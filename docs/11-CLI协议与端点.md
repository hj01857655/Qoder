# 11 · CLI 协议与端点

> 取证日期：2026-10-09
> 来源：bzym2/QoderGateway 协议研究 + qoderclicn endpoint-cache.json 实测 + api1/api2/api3.qoder.com.cn 端点探测

## 1. 两代推理协议

Qoder 存在两代推理协议，CLI（`@qodercn-ai/qoderclicn`）现行使用新版。

| | 老版协议 | 新版协议 |
|---|---|---|
| **推理端点** | `api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation` | `api2-v2.qoder.sh/model/v1/chat/completions` |
| **认证** | COSY 签名（RSA+AES+MD5）+ 自定义 Base64 编码 | 纯 `Authorization: Bearer <token>` |
| **请求体** | Qoder 专有格式（parameters/business/model_config 等） | 标准 OpenAI 格式（messages/tools/stream） |
| **响应** | SSE，内嵌 `body` JSON 字符串，需二次解析 | 标准 OpenAI SSE chunk |
| **性能** | 默认带长 reasoning，复杂任务可到分钟级 | 快，无默认 reasoning |
| **参考实现** | cubk1/qoder2api（Java）、QoderGateway 老版路径 | QoderGateway `bridge.py` `qoder_stream_lines()` |

**关键**：同一个 `security_oauth_token`（`dt-` 前缀）在两代端点上都能用。

## 2. CLI 实际用国际端点

**实测确认**：CN 版 CLI（`@qodercn-ai/qoderclicn`）调用的是**国际端点**（`.qoder.sh`），不是 CN 端点（`.qoder.com.cn`）。

证据来自 `~/.qoder/.cache/qoder-client-endpoint-cache.json`：

```json
{
  "endpointSets": {
    "center":            "https://center.qoder.sh",
    "inference":         "https://api3.qoder.sh",
    "securityInference": "https://api2.qoder.sh",
    "openapi":           "https://openapi.qoder.sh"
  }
}
```

CLI 启动时调 `center.qoder.sh` 获取端点列表，返回国际域名。CN 域名仅在 DNS 缓存中出现（CLI 尝试解析但未实际使用）。

## 3. 端点清单

### 国际端点（.qoder.sh）— CLI 实际使用

| 用途 | URL | 协议 |
|---|---|---|
| 推理（新版） | `POST https://api2-v2.qoder.sh/model/v1/chat/completions` | 纯 Bearer |
| 推理（老版） | `POST https://api3.qoder.sh/algo/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1` | COSY 签名 |
| Auth/jobToken | `POST https://center.qoder.sh/algo/api/v3/user/jobToken?Encode=1` | COSY 签名 |
| 用户信息 | `GET https://openapi.qoder.sh/api/v1/userinfo` | Bearer |
| PAT 交换 | `POST https://openapi.qoder.sh/api/v1/jobToken/exchange` | Bearer |
| Device 授权轮询 | `GET https://openapi.qoder.sh/api/v1/deviceToken/poll?nonce=...&verifier=...&challenge_method=S256` | 无认证 |
| Device token 刷新 | `POST https://openapi.qoder.sh/api/v1/deviceToken/refresh` | 无认证（refresh_token 在 body） |

### CN 端点（.qoder.com.cn）— 签到/活动用

| 用途 | URL | 状态 |
|---|---|---|
| 用户信息 | `GET https://openapi.qoder.com.cn/api/v1/userinfo` | ✅ 200 |
| 用量 | `GET https://openapi.qoder.com.cn/api/v2/quota/usage` | ✅ 200 |
| 签到/活动 | `GET https://openapi.qoder.com.cn/sash/api/v1/me/campaigns` | ✅ 200（需 `Cosy-ClientType: 10`） |
| 领取活动 | `POST https://openapi.qoder.com.cn/sash/api/v1/me/campaigns/{id}/claim` | ✅ 200 |
| 推理（老版） | `POST https://gateway.qoder.com.cn/algo/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1` | ✅ 200 SSE（COSY 签名，签名路径去掉 `/algo` 前缀） |
| 推理（老版·api1） | `POST https://api1.qoder.com.cn/algo/api/v2/service/pro/sse/agent_chat_generation` | ⚠️ 200 SSE 但 `Signature invalid` |
| 推理（新版） | `POST https://api2-v2.qoder.com.cn/model/v1/chat/completions` | ❌ 域名不解析 |
| 新版备选 | `POST https://openapi.qoder.com.cn/model/v1/chat/completions` | ❌ 503 ALB |
| jobToken | `POST https://center.qoder.com.cn/algo/api/v3/user/jobToken` | ❌ 域名不解析 |

**结论**：推理可走国际端点（新版纯 Bearer）或 CN 端点 `gateway.qoder.com.cn`（COSY 签名），签到/活动走 CN 端点。COSY 签名实现详见 [12-COSY签名与直接API](12-COSY签名与直接API.md)。

## 4. Token 类型

| Token | 前缀 | 来源 | 用途 | 有效期 |
|---|---|---|---|---|
| `security_oauth_token` | `dt-` | OAuth device flow（`qoderclicn login`） | 直接用于推理（新版 Bearer / 老版 COSY user blob） | ~30 天 |
| `refresh_token` | `drt-` | OAuth device flow | 刷新 `security_oauth_token` | ~1 年 |
| PAT | `dt-` | qoder.com/account/integrations 手动生成 | jobToken 交换 → `security_oauth_token` | 长期有效 |

**注意**：PAT 和 `security_oauth_token` 都是 `dt-` 前缀，但**不是同一个东西**。

实测：
- PAT 在 `api2-v2.qoder.sh`（新版推理）→ 401 unauthorized
- PAT 在 `center.qoder.sh`（jobToken 交换）→ 401 "personal token is invalid"
- PAT 在 `openapi.qoder.com.cn`（userinfo/quota/campaigns）→ 200 ✅
- CLI 用保存的 OAuth 登录推理 → ✅ 成功

**推断**：PAT 仅对 CN 端点的 `/sash/` 和 `/api/v1/userinfo` 等管理类 API 有效，不能直接用于推理。推理需要 OAuth device flow 产生的 `security_oauth_token`。

## 5. 新版协议直调规格

### 请求

```
POST https://api2-v2.qoder.sh/model/v1/chat/completions
Authorization: Bearer <security_oauth_token>
Content-Type: application/json
Accept: text/event-stream
User-Agent: qoder/1.1.16
X-Request-ID: <uuid>
X-Session-ID: <uuid>
```

仅需 5 个头，**无需任何 COSY 签名/编码**。

### 请求体

标准 OpenAI 格式，直接透传：

```json
{
  "model": "Auto",
  "messages": [{"role": "user", "content": "hello"}],
  "stream": true,
  "stream_options": {"include_usage": true},
  "metadata": {
    "context": {
      "request_id": "<uuid>",
      "request_set_id": "<uuid>",
      "session_id": "<uuid>",
      "task_id": "common",
      "client_type": "qodercli"
    }
  }
}
```

### 响应

标准 OpenAI SSE chunk：

```
data: {"choices":[{"delta":{"role":"assistant","content":"Hi"}}]}
data: {"choices":[{"delta":{"content":"! What can I help you with?"}}]}
data: [DONE]
```

### Token 获取路径

| 方案 | 流程 | 状态 |
|---|---|---|
| A. OAuth Device Flow | `qoderclicn login` → 浏览器授权 → `deviceToken/poll` 轮询 → 拿 `security_oauth_token` | ✅ CLI 内部使用 |
| B. PAT → jobToken 交换 | `POST jobToken/exchange {personal_token: PAT}` → 拿 `security_oauth_token` | ❌ PAT 被拒（401/400） |
| C. 从 CLI keychain 提取 | keytar 模块读系统钥匙串 | ❌ 未找到提取方法 |
| D. Device token 刷新 | `POST deviceToken/refresh {refresh_token: drt-...}` → 新 `security_oauth_token` | ✅ 需先有 refresh_token |

## 6. 实测矩阵

| 测试项 | 结果 | 说明 |
|---|---|---|
| CLI 保存登录推理 | ✅ | 走 api3.qoder.sh 国际端点 |
| CLI + PAT 环境变量 | ❌ | "token that was rejected" |
| PAT → 新版推理端点 | ❌ 401 | PAT ≠ security_oauth_token |
| PAT → jobToken 交换（国际） | ❌ 401 | "personal token is invalid" |
| PAT → jobToken 交换（CN） | ❌ 400 | Bad request |
| PAT → CN 老版端点 + COSY 签名 | ❌ | Signature invalid |
| PAT → CN campaigns/quota/userinfo | ✅ 200 | 需 Cosy-ClientType:10 |
| gateway.qoder.com.cn + COSY 签名（路径去 /algo） | ✅ | 200 SSE，OpenAI 兼容 chat.completion.chunk |
| api1/api2/api3.qoder.com.cn 老版端点 | ⚠️ | 200 SSE，Signature invalid（签名路径未去 /algo 前缀） |
| api2-v2.qoder.com.cn | ❌ | 域名不解析（SSL 错误） |
| openapi.qoder.com.cn/model/v1/chat/completions | ❌ 503 | ALB 后端不可达 |
| openapi.qoder.com.cn/algo/api/v2/... | ❌ 503 | SLB 后端不可达 |
| openapi.qoder.com.cn/algo/api/v1/ping | ✅ | "pong" |

## 7. 参考项目

| 项目 | 语言 | 说明 |
|---|---|---|
| [bzym2/QoderGateway](https://github.com/bzym2/QoderGateway) | Python | 新老两代协议 + 前端管理面板，`bridge.py` 是核心 |
| [cubk1/qoder2api](https://github.com/cubk1/qoder2api) | Java | COSY 签名，BearerBuilder 是核心 |
| [foxy1402/qoder-proxy](https://github.com/foxy1402/qoder-proxy) | Node | OpenAI 兼容包装器，PAT + qodercli |
| [avaritiachaos/qoder-proxy](https://github.com/avaritiachaos/qoder-proxy) | Node | 198⭐，流式快照修复、system prompt 分离 |
