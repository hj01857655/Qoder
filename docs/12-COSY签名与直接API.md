# 12 · COSY 签名与直接 API

> 取证日期：2026-10-09
> 实现文件：`qoder_cosy.py`
> 端点协议详见 [11-CLI协议与端点](11-CLI协议与端点.md)

## 1. COSY 签名流程

COSY 签名是 Qoder 老版推理协议的认证机制，用于 `gateway.qoder.com.cn` 端点。

### 签名步骤

1. **RSA 加密**：随机 16 字节 AES key → RSA(服务器公钥) → `cosyKey`
2. **AES 加密**：用户信息 JSON → AES-128-CBC(key, iv=key) → `info`
3. **Payload**：`{cosyVersion, ideVersion, info, requestId, version}` → JSON → Base64 → `payloadB64`
4. **签名**：`MD5(payloadB64 \n cosyKey \n cosyDate \n bodyEncoded \n path)` → `sig`
5. **Bearer**：`Bearer COSY.{payloadB64}.{sig}`
6. **请求体编码**：JSON → 自定义 Base64（自定义字母表 + 三段旋转）

### 签名路径修正

签名时请求路径需去掉 `/algo` 前缀，即签 `/api/v2/service/pro/sse/agent_chat_generation` 而非完整路径。端点必须用 `gateway.qoder.com.cn`（不是 `api1/api2/api3.qoder.com.cn`），否则 `Signature invalid`。

## 2. 请求头

```
Authorization: Bearer COSY.{payloadB64}.{sig}
Cosy-Key: <RSA加密的AES key>
Cosy-Date: <unix时间戳>
Cosy-User: <uid>
Cosy-Version: 1.1.49
Cosy-ClientType: 10
Cosy-MachineType: 5
Cosy-MachineId: <machine_id>
Cosy-MachineToken: <machine_id>
Cosy-ClientIp: <machine_id>
Cosy-MachineOS: <arch_os>           ← 如 x86_64_win32
Cosy-Data-Policy: disagree
Cosy-Business-Product: app
Cosy-Business-Type: agent
Cosy-Scene: app
Login-Version: v2
Content-Type: application/json
Accept: text/event-stream
Accept-Encoding: identity
```

`Cosy-MachineToken` 和 `Cosy-ClientIp` 都直接用 `machine_id`，不需要调 `runtime-info.exe`。

## 3. User blob

```json
{"uid": "<uid>", "aid": "", "name": "<name>", "email": "<email>", "security_oauth_token": "<token>"}
```

AES-128-CBC 加密，key = IV = UUID 前 16 hex。

## 4. 请求体

```json
{
  "parameters": {"enable_thinking": false, "max_tokens": 32000},
  "business": {"product": "app", "version": "1.1.49", "type": "agent", "id": "...", "name": "...", "begin_at": 0, "stage": "start"},
  "agent_id": "agent_common",
  "task_id": "common",
  "session_type": "app",
  "model_config": {<从 /model/list 获取的完整模型配置>},
  "system": [{"type": "text", "text": "You are a Qoder agent..."}],
  "messages": [{"role": "system", "content": [...]}, ...]
}
```

请求体 JSON → 自定义 Base64 编码 → 作为 wire body 发送。`model_config` 从 `/algo/api/v2/model/list?Encode=1` 获取的完整模型配置（含 key/source/thinking_config 等），不是简单模型名字符串。

## 5. 响应解析

SSE，chunk 内嵌 `body` JSON 字符串，需二次解析：

```
data:{"headers":...,"body":"{\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}","statusCode":"OK"}
```

解析流程：
1. 每行 `data:` 后的 JSON 是信封（envelope）
2. `envelope.body` 是 OpenAI chunk 的 JSON 字符串，需二次 `json.loads`
3. 从 chunk 的 `delta.content` 提取正文，`delta.reasoning_content` 提取推理内容
4. `delta.tool_calls` 提取工具调用

## 6. 签名常量

### 服务器 RSA 公钥

```
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDA8iMH5c02LilrsERw9t6Pv5Nc
4k6Pz1EaDicBMpdpxKduSZu5OANqUq8er4GM95omAGIOPOh+Nx0spthYA2BqGz+l
6HRkPJ7S236FZz73In/KVuLnwI8JJ2CbuJap8kvheCCZpmAWpb/cPx/3Vr/J6I17
XcW+ML9FoCI6AOvOzwIDAQAB
```

### 自定义 Base64 字母表

```
标准: ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/
自定义: _doRTgHZBKcGVjlvpC,@aFSx#DPuNJme&i*MzLOEn)sUrthbf%Y^w.(kIQyXqWA!
填充: $（标准用 =）
```

### 编码流程

```
明文 → 标准 Base64 → 三段旋转（后1/3 + 中1/3 + 前1/3）→ 自定义字母表映射
```

### 其他常量

```
APPCODE = "cosy"
SECRET  = base64("war, war never changes") = "d2FyLCB3YXIgbmV2ZXIgY2hhbmdlcw=="
COSY_VERSION = "1.1.49"
```

## 7. Token 获取

- CLI 登录（`qoderclicn login`）后 token 存 `~/.qoder-cn/.auth/user`（AES 加密）
- 解密：AES-CBC，key = machine_id[:16]，iv = machine_id[:16]
- `machine_id` 从 `~/.qoder-cn/.auth/machine_id` 文件读取
- PAT 仅用于签到/活动 API（`benefit.py`），不能用于推理
- `qoder_cosy.py` 启动时自动加载身份并缓存，后续请求复用

## 8. 网关实现策略

### 路径 A：CLI 包装（server.py + qoder.py）— `BACKEND=cli`

- Flask 包装 `qoderclicn -p -f stream-json` 子进程
- 优点：不需要知道 token，CLI 自己管理认证
- 缺点：每次请求 spawn 子进程，延迟高；流式需解析 CLI 的 stream-json 格式
- 端口：8388

### 路径 B：直接 API（qoder_cosy.py）— `BACKEND=direct`

- 直接 HTTP POST 到 `gateway.qoder.com.cn/algo/api/v2/service/pro/sse/agent_chat_generation`
- COSY 签名（RSA+AES+MD5），签名路径去掉 `/algo` 前缀
- token 从 `~/.qoder-cn/.auth/user` AES 解密获取 `security_oauth_token`
- 模型配置从 `/algo/api/v2/model/list?Encode=1` 动态获取（含 thinking_config 等）
- 支持 `reasoning_content`（thinking 内容单独流式输出）
- 优点：低延迟，无需子进程，返回标准 OpenAI 兼容 SSE chunk
- 缺点：token 需从 CLI 登录文件解密获取（依赖 `qoderclicn login` 先登录）
- 端口：由 `PORT` 环境变量控制（.env 设 8389）

### 切换方式

环境变量 `BACKEND=cli`（代码默认）或 `BACKEND=direct`（.env 设为 direct）。端口由 `PORT` 控制，两条路径共用同一端口。
