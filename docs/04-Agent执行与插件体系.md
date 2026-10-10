# 04 · Agent 执行模型与插件体系

取证：主进程业务码、`resources/bundled-resources/`、`evidence/02-plugins/`。2026-10-04。

## 1. RUNTIME：插件完整生命周期

40 个 `RUNTIME_*` 错误码勾勒出插件运行时的全部阶段。

### 安装与注册
```
RUNTIME_REGISTRATION_REQUIRED      RUNTIME_NAME_CONFLICT
RUNTIME_MANIFEST_INVALID           RUNTIME_MANIFEST_UNAVAILABLE
RUNTIME_MANIFEST_VERSION_INVALID   RUNTIME_TARGET_REQUIRED
RUNTIME_TARGET_UNSUPPORTED         RUNTIME_BINDING_INCOMPATIBLE
RUNTIME_INSTALL_FAILED             RUNTIME_DOWNLOAD_FAILED
RUNTIME_ROLLBACK_FAILED            RUNTIME_NOT_FOUND
```

### 凭证绑定（最完整的一段）
```
RUNTIME_CREDENTIAL_BINDING_MISMATCH     RUNTIME_CREDENTIAL_IDENTITY_CHANGED
RUNTIME_CREDENTIAL_ENVELOPE_INVALID      RUNTIME_CREDENTIAL_PAYLOAD_INVALID
RUNTIME_CREDENTIAL_PROTECTION_UNAVAILABLE
RUNTIME_CREDENTIAL_USER_AUTH_UNAVAILABLE
```

**每个插件独立绑定凭证**，且绑定「身份」（identity）——凭证与用户身份校验，任一环节不可用即拒绝运行。

### 启动与健康
```
RUNTIME_HANDSHAKE_FAILED          RUNTIME_HOST_SMOKE_FAILED
RUNTIME_WORKER_SMOKE_FAILED       RUNTIME_START_FAILED
RUNTIME_ACTIVATION_HEALTH_FAILED  RUNTIME_CAPABILITY_CHECK_FAILED
RUNTIME_NOT_READY                 RUNTIME_UNAVAILABLE
RUNTIME_IN_USE                    RUNTIME_PRESENCE_CHANGED
```

**双 smoke test**：宿主级 + Worker 级，加握手，共三道关。

### 制品与远端
```
RUNTIME_ARTIFACT_INTEGRITY_FAILED   RUNTIME_ARTIFACT_TOO_LARGE
RUNTIME_ARTIFACT_UNAVAILABLE        RUNTIME_ARCHIVE_EXTRACTION_FAILED
RUNTIME_UPLOAD_FAILED
RUNTIME_REMOTE_NETWORK_CHECK_FAILED RUNTIME_REMOTE_NETWORK_UNAVAILABLE
RUNTIME_PROVIDER_UNSUPPORTED
```

`ARTIFACT_INTEGRITY_FAILED` + `ARTIFACT_TOO_LARGE` 说明**制品带完整性校验和体积限制**。

### 状态机常量
```
RUNTIME_PHASE     RUNTIME_STATE_CHANGED     RUNTIME_BUILTIN_IMMUTABLE
```

`RUNTIME_BUILTIN_IMMUTABLE` —— 内置插件不可修改。

## 2. 插件清单格式

`resources/bundled-resources/manifest.json` 定义两个随包资源：

| id | kind | 版本 | 说明 |
|---|---|---|---|
| `qoder-cn-context-plugin` | `qoder-plugin` | `1.0.72.34cf9e2f` | 上下文套件（Wiki + 检索）|
| `qoder-cn-computer-use` | `shared-binary` | `1.0.12` | 计算机使用能力 |

### 完整性校验：逐文件 sha256

manifest 对**每个文件**记录 `path` + `size` + `sha256`：

```json
{
  "schemaVersion": 1,
## 3. Qoder Context 插件（已提取）

### 3.1 插件定义

`.qoder-plugin/plugin.json`：

```json
{
  "name": "qoder-context",
  "displayName": "Qoder Context",
  "version": "1.0.72.34cf9e2f",
  "description": "Wiki, retrieval engine, and more for Qoder"
}
```

### 3.2 MCP 服务器定义

`mcp.json` —— **与你在 settings.json 里写的格式同源**：

```json
{
  "mcpServers": {
    "qoder-context": {
      "command": "${QODER_NODE_RUNTIME}",
      "args": ["${QODER_PLUGIN_ROOT}/runtime/qoder-search.bundle.mjs", "mcp-bridge"],
      "env_vars": [
        "QODER_HOME", "QODER_ENV",
        "QODER_BIG_MODEL_ENDPOINT",
        "QODER_OPENAPI_ENDPOINT",
        "QODERCN_VPC_ENDPOINT", "QODERCN_VPC_OPENAPI_ENDPOINT"
      ],
      "env": {
        "QODER_PRODUCT_ID": "qoder-cn",
        "QODER_SEARCH_PRODUCT_FORM": "qoder",
        "QODER_MTREE_NATIVE": "${QODER_PLUGIN_ROOT}/runtime/native/mtree/index.cjs",
        "QODER_SEARCH_RIPGREP_PATH": "${QODER_PLUGIN_ROOT}/bin/rg.exe",
        "QODER_SEARCH_BUILD_ID": "1.0.72.34cf9e2f-win32-x64"
      },
      "qoderAuthState": true,
      "startup": "application",
      "timeout": 600000,
      "alwaysAllow": ["SearchKnowledge"],
      "toolOverrides": {
        "SearchKnowledge": { "exposedName": "SearchKnowledge", "alwaysLoad": true }
      }
    }
  }
}
```

**关键发现**：

1. **`env_vars` 与 `env` 是两类** —— `env_vars` 声明「需从主进程继承的环境变量」，`env` 是静态注入
2. **`qoderAuthState: true`** —— 插件可读取登录态
3. **`${QODER_NODE_RUNTIME}` / `${QODER_PLUGIN_ROOT}`** 占位符由宿主解析
4. **用户配置格式同源**（`mcpServers` + `command`/`args`/`env`），但插件侧多出 `alwaysAllow`、`toolOverrides`、`startup`、`qoderAuthState`

**端点变量清单**：

```
QODER_BIG_MODEL_ENDPOINT      ← 大模型服务
QODER_OPENAPI_ENDPOINT        ← 主 API
QODERCN_VPC_ENDPOINT          ← 内网 VPC
QODERCN_VPC_OPENAPI_ENDPOINT  ← 内网 OpenAPI
```

> `QODERCN_VPC_*` 说明**存在私有化部署 / VPC 接入场景**。

### 3.3 生命周期钩子

`hooks/hooks.json` 定义两个同步钩子（`async: false`，超时 **2 秒**）：

| 钩子 | 命令 | 用途 |
|---|---|---|
| `SessionStart` | `qoder-context.cmd qoder-context-prompt` | 会话开始注入知识概览 |
| `UserPromptSubmit` | `qoder-context.cmd user-prompt-submit` | 用户提问时补充上下文 |

均通过 `cmd.exe /d /c` 调用（**Windows 批处理封装**）。

### 3.4 运行时构成

`runtime-manifest.json`：

```json
{
  "javascriptRuntime": {
    "source": "qoder-electron",
    "command": "C:\\Program Files\\Qoder CN\\Qoder CN.exe",
    "electronRunAsNode": true,
    "bundled": false
  },
  "mtreeNapiVersion": 10,
  "build": { "minified": true, "sourceMap": false }
}
```

> ⚠️ 路径写死为 `C:\Program Files\Qoder CN\`，本机实际装在 `%LOCALAPPDATA%\Programs\Qoder CN\` —— **该字段由宿主运行时覆盖**。

**零独立 Node.js**，直接复用 Electron 的 Node 运行时（`ELECTRON_RUN_AS_NODE`）。

| 文件 | 体积 | 用途 |
|---|---|---|
## 4. 会话状态机

`SESSION_*` + `TERMINAL_*` 错误码揭示会话生命周期：

```
SESSION_LIFECYCLE           ← 生命周期总控
SESSION_CREATE_RESULT       ← 创建结果
SESSION_EXECUTING           ← 执行中
SESSION_REMAINING           ← 剩余（预算/时间？）
SESSION_INTERRUPT_RESULT    ← 中断结果
SESSION_CONTINUE_RESULT     ← 继续结果
SESSION_REVEAL_RESULT       ← 揭示结果
SESSION_RESULT_READ         ← 读取结果
SESSION_ARCHIVE_FAILED      ← 归档失败
SESSION_ACTION              ← 动作
SESSION_FILE_OUTSIDE_WORKSPACE ← 文件越界！
TERMINAL_NOT_READY
```

`SESSION_FILE_OUTSIDE_WORKSPACE` 说明**有工作区边界校验**（防路径逃逸），与插件的 `PLUGIN_MCP_PATH_ESCAPE` 形成双重防护。

## 5. 鉴权状态机

`AUTH_*` 11 个：

```
AUTH_INITIALIZE       AUTH_METHODS        AUTH_TYPE_UNSUPPORTED
AUTH_LOGIN            AUTH_REFRESH
AUTH_REQUIRED         AUTH_UNAUTHORIZED   AUTH_SERVER_ERROR
AUTH_NETWORK          AUTH_LOGIN_FAILED
AUTH_USER_TOKEN_RUNTIME_DISPOSED   ← 运行时会销毁用户 token
```

`AUTH_USER_TOKEN_RUNTIME_DISPOSED`：**Agent Runtime 可以独立销毁用户令牌**（如登出或销毁沙箱时）。

## 6. 插件安全约束

`PLUGIN_*` 中的安全项：

```
PLUGIN_NAME_UNSAFE              ← 插件名非法
PLUGIN_MCP_PATH_ABSOLUTE        ← 拒绝绝对路径
PLUGIN_MCP_PATH_ESCAPE          ← 拒绝路径逃逸（../）
PLUGIN_MCP_CONFIG_INVALID
PLUGIN_MCP_SERVERS_INVALID
```

**MCP 路径必须相对**，且显式拒绝 `..` 逃逸 —— 这是防止恶意插件读取任意文件的关键防线。

## 7. 小结：Qoder 的安全设计

| 层 | 措施 |
|---|---|
| 制品完整性 | 三层 sha256（清单签名 / 压缩包 / 逐文件）|
| 解压安全 | `maxEntries` + `maxExpandedBytes`（防 zip bomb）|
| 凭证隔离 | 每插件独立凭证 + 身份绑定 + 失效保护 |
| 路径安全 | 拒绝绝对路径、拒绝 `..` 逃逸、工作区边界校验 |
| 进程隔离 | `shell: false`、环境变量白名单（11 项）|
| 完整性 | `RUNTIME_ARTIFACT_INTEGRITY_FAILED` |
| 健康检查 | 握手 + 宿主 smoke + Worker smoke |

整体思路是**纵深防御**：每一层假设下层可能被绕过。
| `runtime/qoder-search.bundle.mjs` | **5.25 MB** | 主逻辑（无 sourcemap）|
| `runtime/knowledge-legacy-migration-worker.js` | **3.37 MB** | 旧知识库迁移 Worker |
| `bin/rg.exe` | **5.43 MB** | **自带 ripgrep** |
| `runtime/native/mtree/mtree.win32-x64-msvc.node` | 1.82 MB | **mtree** 目录树原生模块 |
| `runtime/assets/r1/b.bin` | 111 KB | 静态资源 |
| `runtime/syncWorkspaceScanWorker.js` | 1.8 KB | 工作区扫描 Worker |
| `bin/qoder-context.cmd` | 2.2 KB | Windows 封装 |

**检索栈**：`rg.exe`（文本）+ `mtree`（结构树）+ `assets/r1/*.bin`（疑似嵌入索引/词表）。

### 3.5 Computer Use 插件

```json
{
  "id": "qoder-cn-computer-use",
  "kind": "shared-binary",
  "entrypoints": [{ "name": "runtime", "path": "QoderComputerUse.exe", "executable": true }]
}
```

单个 **2.46 MB 的 `QoderComputerUse.exe`** —— **计算机使用（屏幕/鼠标/键盘自动化）是独立原生程序**，不走 Node。

与 `resources/bin/appshot_bare_modifier_monitor.exe`（屏幕捕获）配合。

---
  "definitionSha256": "152299f80c8ed45b...",
  "target": { "platform": "win32", "architecture": "x64" },
  "archive": {
    "sha256": "e45277593ba288a3...",
    "root": "qoder-context-plugin",
    "maxEntries": 87,
    "maxExpandedBytes": 18459634
  }
}
```

三层防护：**清单签名 → 压缩包 sha256 → 逐文件 sha256**，另加 `maxEntries` / `maxExpandedBytes`（**防 zip bomb**）。

### 安装策略

```json
"install": {
  "folderName": "qoder-context",
  "pluginId": "qoder-context@qoderapp-bundler",
  "presence": "ensure-minimum",
  "defaultEnabled": true,
  "userVisible": false
}
```

`presence: ensure-minimum` = 缺失则装、版本不足则升级。`userVisible: false` = 用户看不到也禁不掉。

---