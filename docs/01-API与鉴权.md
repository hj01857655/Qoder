# 01 · API 层与鉴权

取证：`evidence/01-observe/out-main/out/main/index.js`（11.67 MB bundle）。2026-10-04。

## 1. 域名

扫描全部 JS/CJS 得20 个域名，按用途分：

| 域名 | 用途 |
|---|---|
| `openapi.qoder.com` | **主 API 端点**（clientType = app 时）|
| `gateway.qoder.com` | 网关 |
| `api.qoder.com` | API（另一组环境）|
| `gateway.qoder.com.cn` | **CN 推理网关**（COSY 签名，`/algo/api/v2/service/pro/sse/agent_chat_generation`）|
| `openapi.qoder.com.cn` | CN 管理 API（userinfo/quota/campaigns/claim）|
| `api1/api2/api3.qoder.com.cn` | CN 推理端点（旧，Signature invalid）|
| `center.qoder.sh` / `openapi.qoder.sh` | 海外/备用环境 |
| `api2-v2.qoder.sh` / `api3.qoder.sh` | 海外推理端点（新版纯 Bearer / 老版 COSY）|
| `test-openapi.qoder.com` / `test-gateway.qoder.com` / `test-ops2.qoder.sh` | **测试环境**（`releaseChannel` 驱动）|
| `static.qoder.com` / `download.qoder.com` | 静态资源与安装包 |
| `mobile.qoder.cn` / `docs.qoder.cn` | 移动端与文档 |
| `bailian.console.aliyun.com` / `modelstudio.console.aliyun.com` | 阿里云百炼 / ModelStudio（模型侧）|

URL 里带 `.invalid` 的（`markdown-image.qoder.invalid` 等）是**占位符**，用于 CSP/资源拦截占位，非真实请求。

## 2. API 路径面

`/api/v1/*` 共 **140 条**路径，按二级分组：

| 数量 | 前缀 | 含义 |
|---|---|---|
| 28 | `collaboration/runtime` | 协作运行时（Agent 执行）|
| 27 | `collaboration/projects` | 项目管理 |
| 26 | `collaboration/discussions` | 讨论/会话 |
| 6 | `collaboration/users` | 用户 |
| 4 | `collaboration/agent-profiles` | Agent 档案 |
| 4 | `collaboration/files` | 文件 |
| 3 | `collaboration/team-profiles` | 团队档案 |
| 2 | `me/mcp-servers` | **MCP 服务器列表** |
| 2 | `me/campaigns` | 活动 |
| 2 | `sites/templates` | 站点模板 |
| 2 | `remote/qoder` | 远程 |
| 2 | `qcs/config` | 配置服务 |
| 1 | `me/jobToken` / `me/data-policy` / `me/partner_plans` | 杂项 |
| 1 | `userinfo` / `organizations` / `version` / `ping` | 基础 |

**协作（collaboration）是产品重心**，占 105/140。

典型路径形态：

```
/api/v1/collaboration/discussions/{id}/messages
/api/v1/collaboration/discussions/{id}/messages/query
/api/v1/collaboration/discussions/{id}/agents/{memberId}/workspaces
/api/v1/collaboration/projects/{id}/members/agent/{memberId}/invocation-policy
/api/v1/ai-conversations/credits-heatmap      ← 额度统计
/api/v1/ai-conversations/credits-summary     ← 额度汇总
```

## 3. 鉴权机制

### 3.1 方案：Bearer Token

```javascript
headers: {
  Accept: "application/json",
  Authorization: `Bearer ${token}`,
  "Cosy-ClientType": String(clientType),   // 客户端类型标识
}
```

关键词统计（主进程全量）：

| 关键词 | 出现次数 |
|---|---|
| `Authorization` | 239 |
| `APIKey` | 46 |
| `Bearer ` | 31 |
| `refresh_token` | 26 |
| `Jwt` | 24 |
| `access_token` | 21 |
| `api_key` | 14 |

### 3.2 令牌获取与刷新

```javascript
await this.authService.getAccessToken()   // 取当前 access token
```

特征：

- **`accessToken` + `refreshToken` 成对**
- **401 / 403 触发刷新**（多处`if (r.status === 401 || r.status === 403) throw ...`）
- 刷新失败错误码：`ACCESS_TOKEN_REJECTED`
- 部分场景用 `startupPersonalAccessToken`（个人访问令牌，PAT）
- `me/jobToken` 为任务级临时令牌

### 3.3 本地存储：OS 级加密

```
~/.qoder-cn/.auth/
├── .credential-transaction    （事务锁文件，0 字节）
└── machine_id                 （设备标识）
```

依赖 **`electron-store` + Electron `safeStorage.encryptString`**：

> safeStorage：Windows 走 **DPAPI**，macOS 走 Keychain，Linux 走 libsecret。
> 密文绑定当前用户账户，换用户/重装即失效。

**结论：token 不是明文落盘**，普通方式读取 `.auth` 拿不到凭据。

## 4. 内置 MCP 客户端实现

虽然 `package.json` 依赖 `@modelcontextprotocol/client`，但**主进程另有一套自研 stdio JSON-RPC 实现**。

### 4.1 进程启动

```javascript
spawn(command, [...args], {
  cwd: config.cwd ?? undefined,
  env: mergeEnv(config.environment),
  shell: false,          // ← 不走 shell，避免命令注入
  detached: config.detached,
  windowsHide: true,
  stdio: ["pipe", "pipe", "pipe"],
})
```

环境变量白名单（**只透传这 11 个**）：

```
PATH, HOME, USERPROFILE, TMPDIR, TMP, TEMP,
LANG, LC_ALL, SYSTEMROOT, COMSPEC, PATHEXT
```

失败错误码：`MCP_STDIO_PROCESS_UNAVAILABLE`（拿不到 pid 或 stdio 句柄时）。

### 4.2 内置 MCP 服务器（Qoder 自家的）

以 SearchWorkspace 为例，注册了一个 node 侧的 MCP bridge：

```javascript
{
  command: `${base}/bin/node`,
  args: [`${base}/lib/qoder-context/runtime/qoder-search.bundle.mjs`, "mcp-bridge"],
  env: {
    QODER_BUSINESS_PRODUCT: "app",
    QODER_PRODUCT_ID: <productId>,
    QODER_SEARCH_PRODUCT_FORM: "qoder",
    QODERCLI_PATH: `${base}/bin/qoder-worker-runtime`,
  },
  timeout: 600000,                    // 10 分钟
  startup: "application",
  alwaysAllow: ["SearchWorkspace"],
  toolOverrides: {
    SearchWorkspace: { exposedName: "SearchWorkspace", alwaysLoad: true }
  }
}
```

**即Qoder 把自己的搜索能力也包装成 MCP 暴露出来**，常驻启动且默认放行。

### 4.3 插件方法白名单

内置插件通信走自定义协议（非标准 MCP），方法清单：

```
system.hello / system.ping / system.health / system.shutdown
workspace.resolve / resolvePath / list / read / write / identity
workspace.snapshotText / readImage / watchFile / unwatchFile
git.status / git.diff / git.reviewTargets / git.reviewStatus / git.reviewDiff / git.watch / git.unwatch
terminal.list / create / input / resize / kill
agent.sessionExists / sessionMessages / sessionSubagents / subagentMessages
agent.sessionFork / sessionDelete / stageAttachment / spawn / stdin / endInput / signal
feedback.collectDiagnostics
```

协议用 **4 字节小端长度前缀 + JSON**：

```javascript
const payload = Buffer.from(JSON.stringify({type, protocolVersion: 2}));
const header = Buffer.alloc(4);
header.writeUInt32LE(payload.byteLength);
child.stdin.write(Buffer.concat([header, payload]));
```

握手报文：`{type: "watchRelayClients", protocolVersion: 2}`，超��� **5 秒**报`NATIVE_CHROME_CONNECTOR_SELF_TEST_TIMEOUT`。

### 4.4 SSH 远程模式

工作区支持三种连接模式（`mode` 字段）：

| mode | agent | workspace |
|---|---|---|
| `local`（缺省）| local | local |
| `ssh-managed` | remote | remote |
| `ssh-local-agent` | local | remote |

**即 Agent 跑本地、工作区可跑远端 SSH**，通过私有插件协议（`agent.spawn` / `agent.stdin`）转发。

## 5. 观察要点

- 主进程单文件 11.67 MB，符号名已被混淆（`jYe`、`h2e`、`wCt` 之类），但**字符串与结构完整**，正则可挖
- 渲染进程 19.81 MB bundle，按功能拆成 1131 个 chunk（含 `presentation-render.worker-*.js` 等）
- 存在 `qcs/config` 配置服务与 `releaseChannel` 分环境机制（test/prod）
- `@arms/rum-electron` 说明有阿里 ARMS 遥测

## 6. CLI 协议与两代推理端点（2026-10-09 实测）

**详见 [11-CLI协议与直接API](11-CLI协议与直接API.md)**

要点：
- CLI（`@qodercn-ai/qoderclicn`）实际调**国际端点**（`api3.qoder.sh`），不是 CN 端点
- 新版协议 `api2-v2.qoder.sh/model/v1/chat/completions` 是纯 Bearer OpenAI 兼容，无需 COSY 签名
- PAT ≠ `security_oauth_token`，推理需 OAuth device flow 产生的 token
- 签到/活动走 CN 端点 `openapi.qoder.com.cn/sash/api/v1/me/campaigns`

## 7. Device Token 刷新（2026-10-09 实测）

### 端点

```
POST /api/v1/deviceToken/refresh
Content-Type: application/json
Body: {"refresh_token": "<refreshToken>"}
```

无需 Authorization 头，refresh_token 在 body 里。

### 响应

```json
{
  "device_token": "<新 access token>",
  "refresh_token": "<新 refresh token>",
  "token_type": "Bearer",
  "expires_at": "2026-11-08T08:18:48Z",
  "refresh_token_expires_at": "2027-10-04T08:18:48Z",
  "created_at": "..."
}
```

### 有效期

| token | 有效期 |
|---|---|
| device_token（access） | ~30 天 |
| refresh_token | ~1 年 |

### 写回 auth.v1.dat

刷新后**必须**将新 token 写回 `auth.v1.dat`（重新 AES-256-GCM 加密，见 [10-机器标识与风控指纹](10-机器标识与风控指纹.md) §7），否则 IDE 登录失效。实测服务端允许同一 refresh_token 多次刷新（非单次使用）。

### 代码定位

| offset | 功能 |
|---|---|
| 32590540 | `ensureFreshToken()` — 检查过期 → POST refresh |
| 32591320 | 响应解析 — 更新 token / refreshToken / expiresAt |
| 32537167 | JobToken refresh — `/api/v1/jobToken/refresh`（独立端点） |