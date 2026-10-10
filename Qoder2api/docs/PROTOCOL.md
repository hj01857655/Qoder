# Qoder COSY 协议与 qoder2api 实现

本文件只记录配置、实测数字、判据、evidence 路径。行号截至 2026-10-10 01:50。

## 1. 分层与术语

| 层 | 术语 | 本项目对应物 | 位置 |
|---|---|---|---|
| 传输 | transport / framing | HTTPS + SSE（`Accept: text/event-stream`，`data:` 分帧） | 公开标准 |
| 字节编码 | wire encoding / codec（混淆，非保密强度） | 自定义 Base64 字母表 + 标准 b64 首尾 1/3 轮转；user blob AES-128-CBC（key=IV=uuid hex[:16]），AES key 用 RSA-1024/PKCS1_v1_5 包裹 | `qoder_cosy.py:62` `ALPHABET`、`:70` `qoder_encode()`、`:159` `build_cosy_headers()` |
| 认证 | auth scheme | `Authorization: Bearer COSY.<payload_b64>.<md5_sig>` + `Cosy-*` 头全集 | `qoder_cosy.py:93` `sign_request()` |
| 消息格式 | message format / API contract | 请求体 `{parameters, business, agent_id, task_id, session_type, model_config, system, messages, tools, tool_choice, parallel_tool_calls}`；响应信封 `{statusCodeValue, body}`，`body` 是 OpenAI chunk 的 JSON 字符串 | `qoder_cosy.py:407` `build_request_body()`、`:516` `run_qoder_cosy()` |
| schema 定义语言 | IDL | `proto/chat.proto`（`ChatCompletionRequest` 等，带字段编号） | CLI 包内 |
| 端点 | endpoint / route | `POST /algo/api/v2/service/pro/sse/agent_chat_generation?FetchKeys=llm_model_result&AgentId=agent_common&Encode=1` | `qoder_cosy.py:45-46` |

合称：**私有应用层协议 / proprietary wire protocol**（社区叫法"Qoder COSY 协议"；`COSY` 是签名/封装方案代号，见 `Cosy-*` 头与 `Bearer COSY.` 前缀）。无公开规范文档，因此属 de facto contract，不是 standard。

本服务整体：**adapter / gateway / shim**，具体是 OpenAI-compatibility proxy。私有 contract → OpenAI contract 的字段级对应称 **mapping**（映射）。

## 2. 配置

| 键 | 值 | 备注 |
|---|---|---|
| `GATEWAY_HOST` | `https://gateway.qoder.com.cn` | `qoder_cosy.py:44` |
| `COSY_VERSION` | `1.1.49` | `:50` |
| 签名 path | 去掉 `/algo` 前缀后参与 MD5 | `:93` |
| 身份来源 | **自持有凭证，落盘 `credentials.json`（本目录，`oauth.py` device flow 生成，已进 `.gitignore`），不读不写 `~/.qoder-cn/.auth`**。`load_identity()`（`qoder_cosy.py`）回落顺序：**内存缓存 → credentials.json**（`_load_cred_file()`，临期先续期）**→ PKCE device flow**（`oauth.py`，与 CLI 完全无关）。**`.env` 只存配置不含任何令牌（2026-10-10 起）：env 令牌槽位（`QODERCN_TOKEN`/`QODERCN_REFRESH_TOKEN`）与 PAT 兑换路已整体删除**，凭证唯一来源就是 `credentials.json`。续期成功与 device flow 登录成功都会原子写回 `credentials.json`；401/403 → `reauthenticate()` → `_refresh_credential()`（`drt-` 走 `deviceToken/refresh`，轮换 pair 整体覆盖并落盘）。现网凭证为 2026-10-10 device flow 实登：`dt-`+`drt-` 齐，自愈闭环，不再依赖 CLI |
| CLI 依赖面 | 路由层已无 CLI 后端（§7-24）：`server.py` 不再 `from qoder import …`，`grep -E "BACKEND|run_qoder\(|resolve_model|messages_to_prompt|QODER_MODELS|list_models\(|new_id|shutil" server.py` = 0 命中。`qoder.py`（CLI 子进程包装器，含内置 21 模型表）**已整文件删除**（2026-10-10 拆分时确认零调用方）。CLI 子进程依赖、IDE `runtime-info.exe` 机器指纹（`benefit.py` 已改用 credentials.json 的 `machine_id` 冒充，magpie 口径）、env/PAT 凭证（已改 PKCE device flow 落盘）均已解除 |
| 续期/兑换路径（bundle 实测，§7-25 已实现） | 凭证本体是 OAuth 产物：`.auth/user` 的字段集为 `{uid, login_method, access_token, security_oauth_token, refresh_token, expire_time, refresh_token_expire_time}`（`Kw()` 写入方 @18943xxx）。**过期不必然要 CLI**，三条纯 HTTP 路都在 `https://openapi.qoder.com.cn`（DNS 实测与 `gateway.qoder.com.cn` **同两组 IP**：两个域名都解析到 47.116.142.188 + 8.153.206.47，此前记的「不同机」是错的，已撤回）：`POST /api/v1/deviceToken/refresh` body `{refresh_token, machine_id?, machine_token?, machine_type?, machine_code?}` → `{device_token, refresh_token, expires_at, refresh_token_expires_at}`（@18943664 / @32994756）；`POST /api/v1/jobToken/refresh` body `{refresh_token}` → `{token, refresh_token, expires_at｜expires_in}`（@18979338 / @32996101）；`POST /api/v1/jobToken/exchange` body `{personal_token: PAT, machine_id?, machine_token?}`（machine 字段来自 umid，可省，@32996101）→ 同一形状。CLI 侧靠 `startRefreshTimer()`（间隔 + jitter，策略 `local`/`host-job-token`）自动跑前两条；`refresh_token_expire_time` 过期即 `invalidateStoredCredentials`，只能重登。**参考实现 `yetone/magpie` 不读 `.auth`**：它自己走 PKCE device flow 登录（`verifier=b64url(randomBytes(64))`/`challenge=sha256(verifier)`/`nonce=randomUUID()`/**`machineId=randomUUID()`**，@10881）→ `GET /api/v1/deviceToken/poll?nonce&verifier&challenge_method=S256` 每 2s、15min 超时（@11607）→ `POST /api/v1/me/jobToken` body `{clientId}`（@11881；**CN 分支** `site.deviceChat && 4xx` 时不造 job token，直接用 device token 签名）→ 续期 `jobToken/refresh`（@14039）/`deviceToken/refresh`（@48491），401/403 → `SignInGone(expired=true)`；凭证写**自有 store** `client.auth.set({path:{id},body})`，键 `{access,refresh,expires,deviceToken,deviceRefresh}`（@56412/@57363）；预刷判据 `expires - now > REFRESH_LEAD(5min)` 才复用，`RENEW_LEAD=10min` 主动续，`KEEP_SPENT_MS=1h` 记住已消费的 pair 防重复花。**结论：CLI 凭证从来不是协议约束**，本仓库已按此口径改为自持有（§7-25）。随机 `machine_id` 能否被网关接受**仍未实测**（只有一次 bogus PAT 的 `400 BadRequest`，未走到签名步）→ 见 §8 |
| 依赖分层（§7-24 后实测） | ① **推理运行时不依赖 CLI 进程**：`PATH=""` + spy `subprocess.Popen`/`run` 下打 6 个端点（chat stream/非 stream、completions、models、health、首页，上游 stub）全 200、子进程调用记账 0 次（`…/no_cli_proof.py` → `…/no_cli_proof.txt`）；live 代码 `subprocess` 仅剩 `benefit.py:64`，且那是 Qoder CN IDE 的 `runtime-info.exe`（非 qodercli），只服务 `/benefit/*`。② **身份引导不依赖 CLI**（§7-25 起）：`~/.qoder-cn/.auth/{machine_id,user}` 在本仓库既无读也无写（grep `_read_cli_credential|_auth_dir|_store_file` = 0），身份来自 `POST /api/v1/jobToken/exchange`（PAT）或 PKCE device flow，`machine_id` 自生成 UUID。③ **续期在本进程内**：`load_identity()` 发请求前判 `_expiring()`（离到期 <5min 先刷），`_refresh_credential()` 按 `token_type` 依次试 `jobToken/refresh`/`deviceToken/refresh`，`refresh_token` 轮换只更新内存对象（无落盘）；实测离线打桩覆盖 4 条转换（预刷轮换 / 续期被拒后重引导 / PAT 引导 / device flow 引导），见 §9。上游 401/403 走 `reauthenticate()`。④ **协议常量耦合 CLI bundle**：`COSY_VERSION="1.1.49"`（`:50`）、`ALPHABET`（`:62`）、`RSA_PUBKEY_DER`（`:54`）均为从 `qoderclicn.js` 逆向抄入，上游轮换需重新取值 |
| TLS | `verify=True` ×3（`qoder_cosy.py:161` openapi 传输 / `:509` 模型列表 / `:838` chat），`grep verify=False` = 0 | 证书实测：leaf `*.qoder.com.cn`，签发方 GlobalSign GCC R3 DV TLS CA 2020（公共 CA，非企业根），到期 `Jan 4 02:32:49 2027 GMT`，TLSv1.3，主机名校验通过；环境无 `HTTP(S)_PROXY`/`REQUESTS_CA_BUNDLE`/`SSL_CERT_FILE`/`NODE_EXTRA_CA_CERTS`；签名模型列表 GET 在 `verify=True` 下返回 13 个模型 |
| `.env` | `PORT=8389`、`API_KEY`（**env 只存配置；令牌一律走 `credentials.json`**，2026-10-10 起，见 [CREDENTIALS.md](CREDENTIALS.md)） | 历史（env 槽位已删）：**`QODERCN_TOKEN` 实测不是 personal token，而是 `dt-` 开头的设备访问令牌（长 27；`GET /api/v1/userinfo` Bearer 它 = 200；`POST /api/v1/jobToken/exchange` = 400 `Bad request`）**；`QODERCN_REFRESH_TOKEN` 需 `drt-` 前缀。变量名统一过程：`QODERCN_PAT` → `QODERCN_TOKEN`，`server.py`/`benefit.py` 曾各自读 `QODERCN_DEVICE_TOKEN`/`QODERCN_PAT`，后三处同名。`BACKEND` 自 §7-24 起不再被读取，残留行无效 |
| 落盘 | `DUMP_DIR` 默认 `dumps/`，`DUMP=0` 关闭，单向 512KB 截断，`DUMP_MAX_FILES` 默认 200（≤0 不轮转，按 mtime 删最旧） | `server.py:44` `:45` `:46` `:47` `:60` `:76` |

## 3. 上游模型实测

`GET /algo/api/v2/model/list?Encode=1` → 13 个 enabled 模型（`fetch_models()`，TTL 300s）。

| 字段 | 分布 |
|---|---|
| `max_input_tokens` | 180000 ×11、1000000 ×1（`gfmodel`）、96000 ×1（`dmodel`） |
| `is_reasoning` | true ×10、false ×3（`dfmodel`、`kmodel_latest`、`mmodel`） |
| `thinking_config.efforts` | 全部为空（无逐档枚举可取） |

AtomCode 侧 `context_window` 按实测设为 `180000`（`~/.atomcode/config.toml:64`）。

### 3.1 prompt cache

命中由**内容前缀**决定，与 body 顶层字段无关：同一长上下文连发两次，第二次 `cached_tokens` ≈ `prompt_tokens`；`business.id` 每请求新生成不影响命中。因此顶层无需补 `session_id`/`request_id`/`chat_task`/`version`/`stream` 这些字段（实测两臂热请求同为 0.9998）。

| 情形 | `cached_tokens` |
|---|---|
| 该前缀首见 | 0 |
| 同前缀再次发送，`prompt ≥ 30k` | `0.94–0.999 × prompt_tokens` |
| 小 prompt（< 10k） | ~52（仅固定头前缀） |

前缀变化即重新冷启动：`tools` 序列化进前缀，客户端工具列表顺序变动会让 `cached_tokens` 回落。

## 4. OpenAI → COSY 映射表

| OpenAI 请求字段 | 落点 | 状态 |
|---|---|---|
| `messages[]` | `system` 抽为 `body.system` block 并前置 QODER_SYS；其余转 text/image block；`role=tool` → `{role,tool_call_id,content:[blocks]}`；assistant 的 `tool_calls`/`reasoning_content` 挂在自己那条 | 实现 `qoder_cosy.py:606`（`_qoder_messages()`：`tool` 支 `:613`，assistant `tool_calls` 支 `:624`） |
| `tools[]` | `body.tools`，仅 `type=function` 且有名者，保留 `parameters` | `:494` |
| `tool_choice` | 写 `parameters.tool_choice`，值原样透传；`"none"` → 整个不带 `tools` 也不带该键 | 实现 `:644` `_tool_choice_wire()` / 挂载 `:713-715`；上游 honored（§5 实验 C） |
| `parallel_tool_calls` | `parameters.parallel_tool_calls`（bool，仅显式传入时送） | `:508-509`；上游 honored（§5 实验 D） |
| `max_tokens`/`max_completion_tokens` | `parameters.max_tokens`，默认 32000 | `:443` |
| `temperature` | `parameters.temperature`（仅非 None 时送） | `:445-446` |
| `top_p` | `parameters.top_p`（仅非 None 时送） | `:448-449`；实测上游接受 |
| `top_k` | `parameters.top_k`（仅 int 时送） | `:451-452`；实测上游接受 |
| `context_length` | `parameters.context_length`（仅正整数时送；非 OpenAI 字段，客户端直接传） | `:464-465`；实测上游接受 |
| `reasoning_effort` | `parameters.reasoning_effort`（仅 `enable_thinking` 为真时送） | 已接；非法值上游 400 `provider_error` |
| `enable_thinking` | `parameters.enable_thinking`，缺省取模型 `is_reasoning` | 已接 |
| `preserve_thinking` | `parameters.preserve_thinking=true` | 已接（白名单内，非自造字段） |
| `stream_options.include_usage` | 流末追加 `choices:[]` 的 usage chunk | `server.py:347-349` |
| `reasoning_budget_tokens` | `parameters.reasoning_budget_tokens`（CLI 由 `thinkingBudget` 派生后写进同一 map，@23318690） | 已接：`qoder_cosy.py:457-459`（仅正整数且 `enable_thinking` 为真才挂）；`server.py:252` 读取。实测影响思考长度，见 §5 实验 E |
| `stop`/`seed`/`user`/`n`/`logit_bias`/`response_format`/`presence_penalty`/`frequency_penalty` | 本路 `parameters` 无读取方 | **不接（非遗漏）**：2026-10-10 14:0x 实测把 `stop`/`seed`/`response_format` 硬塞进 `parameters` 发上游，全部静默失效（见下「采样面参数证伪」）；接线只会造成"客户端以为生效"的假接口。`presence_penalty`/`frequency_penalty`/`logit_bias`/`n`/`user` 未单测，但同一 map 的任意未知键已被证实静默丢弃，接线同样无收益 |

响应侧映射：

| 上游 | 客户端 |
|---|---|
| `delta.content` | `delta.content` |
| `delta.reasoning_content` | `delta.reasoning_content` |
| `delta.tool_calls[]`（按 `index` 分片） | 原样透传（流式，`server.py:331`）/ 按 index 合并 `id`+`name`+`arguments` 累加（非流式，`server.py:391` `:413`） |
| `choices[].finish_reason` | 透传，`stop` 仅在缺失时兜底（`server.py:345/419/525`） |
| 无 `choices` 的 chunk | 取 `usage` → `prompt/completion/total` + `completion_tokens_details.reasoning_tokens` + `prompt_tokens_details.cached_tokens`（`server.py:218`） |
| 信封 `statusCodeValue != 200` | `UpstreamError(status)` → 非流式真状态码 JSON；流式因头已发出改 in-stream `data: {"error":{...}}` 且跳过成功 chunk |
| 连接/超时异常 | 归一为 `UpstreamError(502/504)` |

## 5. tool_choice / parallel_tool_calls

### 填充语义

两者都进 `parameters` map，不是顶层：CLI 的 RemoteChatAsk 构造器 @23318769 区写 `h.tool_choice=o.toolChoice`、`h.context_length=o.contextWindow`，`h` 即 `parameters`。

`tool_choice` 走 protobuf `Value` 包装（`k3A` @19413556：string→`{stringValue}`、object→`{structValue}`；`M3A` @19426923 仅对 object 递归），即**原样透传 OpenAI 值**：`"required"` 就发 `"required"`，function 对象原样发。`{type:"any"}`/`{type:"tool"}` 那套枚举属 Anthropic Messages 适配器（同包 `z0c` @19524515，同段代码用 `stop_sequences`/`thinking`/`message_start`），Qoder 这条路不适用。

| OpenAI | 网关送出（`parameters.tool_choice`） |
|---|---|
| `"auto"` | `"auto"` |
| `"required"` | `"required"` |
| `{"type":"function","function":{"name":X}}` | 原样 |
| `"none"` | 不送该键，且整个不带 `tools` |
| 其他 / 非法 | 不送该键 |

`parallel_tool_calls`：`parameters.parallel_tool_calls`（bool，仅显式传入时送）。

实现：`qoder_cosy.py:644` `_tool_choice_wire()`、`:713-715` tool_choice 挂载、`:753-755` parallel；`server.py:258-260` 仅在非 OpenAI 取值时打 WARNING。

### 实测（2026-10-10 02:2x，直连 `run_qoder_cosy`，Qwen3.8-Flash）

同一批先做本地 decode 断言，键确实落在 `parameters` 内：`{'tool_choice': 'required'}`、`{'parallel_tool_calls': False}`、`{'top_p': 0.1, 'top_k': 5}`、`{'context_length': 180000}`；顶层只剩 `agent_id/business/messages/model_config/session_type/system/task_id(/tools)`。

实验 C — `tool_choice`，prompt "2+2 等于几？"（工具 `add`，与问题无强制关系）：

| 请求 | finish | n_calls | 返回 |
|---|---|---|---|
| baseline | stop | 0 | `2 + 2 等于 4。` |
| `tool_choice="auto"` | stop | 0 | `2 + 2 = 4。` |
| `tool_choice="required"` | **tool_calls** | 1 | `add{"a": 2, "b": 2}` |
| `tool_choice={type:"function"}` | **tool_calls** | 1 | `add{"a": 2, "b": 2}` |

→ `required` 与指定函数名都被 honored。此前"上游取值不敏感"的结论作废：那批数据把 `tool_choice` 发在顶层，位置错。

实验 D — `parallel_tool_calls`，prompt 明确要求并行 `add(2,3)` 与 `add(40,4)`：

| 请求 | n_calls |
|---|---|
| 缺省 | 2 |
| `true` | 2 |
| `false` 第 1 次 | 1 |
| `false` 第 2 次 | 1 |
| `false` + `required` | 1 |

→ honored，`false` 两次复现。实验 B（顶层发送）的"未复现"同样作废。

### 实验 E — `reasoning_budget_tokens`（2026-10-10 03:0x，HTTP `:8389`，Qwen3.8-Flash，prompt "用三句话解释为什么天空是蓝的"，`enable_thinking=true`、`temperature=0`）

| 请求 | finish | reasoning_chars | reasoning_tokens |
|---|---|---|---|
| 缺省 | stop | 116 | 72 |
| `=200` | stop | 84 | 52 |
| `=4000` | stop | 221 | 139 |

→ 上游接受且**随值单调变化**（52 < 72 < 139，对应 200 < 缺省 < 4000）。单样本，不构成精确上限语义，只证明该键被读取。

### 采样面参数证伪（2026-10-10 14:0x，直连 `run_qoder_cosy`，`gfmodel`，prompt "列出10个中国城市，用中文顿号、分隔，只输出城市名"）

注入方式：patch `qoder_encode`，把探测键合并进 `parameters`（本地 decode 已证明该 map 是唯一落点）。签名在编码**之后**算，注入不影响 COSY 验签。

| 请求 | 上游 HTTP | finish | 输出 |
|---|---|---|---|
| baseline | 200 | stop | `北京、上海、广州、深圳、成都、杭州、武汉、南京、重庆、西安` |
| `stop=["、"]` | 200 | stop | 同上，**顿号照常输出，未被截断** |
| `response_format={type:"json_object"}` | 200 | stop | 同上，**仍是散文，不是 JSON** |
| `seed=12345` | 200 | stop | 同上 |
| `probe_zzz=1`（任意未知键） | 200 | stop | 同上，**不报错** |

→ 三个采样面参数全部**静默失效**，且任意未知键也被静默吞掉（上游对 `parameters` 是白名单读取，不校验）。

`seed` 另做同/跨种子对照（`temperature=1.0`、`reasoning_effort=low`，prompt "想一个1到1000的整数和一种动物"）：`seed=1` 两次得 `42-章鱼` / `42-猫头鹰`——**同种子不同输出**，确定性不成立，故 `seed` 判为未承载。

**决定：`stop`/`seed`/`response_format`/`presence_penalty`/`frequency_penalty`/`logit_bias`/`n`/`user` 一律不接。** 接线只会造出一个"客户端以为生效、实际被丢弃"的假接口，比明确不支持更糟；§6 已注明本路 `stop` 无读取方，与本次实测互证。

> 副产物（本轮真实撞到的上游约束，与本结论无关但值得记）：对 `gfmodel` 送 `enable_thinking=false` → HTTP 400，`code=1210`、`该模型始终思考，不支持关闭思考；请使用 low、high 或 max`。即 §3 的 `enable_thinking` 映射对"恒思考"模型不适用，这类模型只能靠 `reasoning_effort` 调档。

### HTTP 侧复测（03:0x，`:8389` 新进程 PID 5928，4 次推理）

同一批实验 C/D 的 prompt 换成"北京和上海的天气怎么样？需要分别调用工具"，工具 `get_weather(city)`：

| 请求 | finish | n_calls |
|---|---|---|
| `tool_choice="required"` | tool_calls | 2 |
| `tool_choice={type:"function"}` | tool_calls | 2 |
| `required` + `parallel_tool_calls=false` | tool_calls | **1** |
| `required` + `parallel_tool_calls=true` | tool_calls | 1（单样本） |

→ 与协议层直连结论一致：`required`/指定函数名被 honored，`false` 收敛到 1 次。`true` 不是"保证并行"，样本间会波动，不能当断言用。usage 同时带回 `reasoning_tokens` 与 `cached_tokens:0`（这 4 次均为各自前缀首见，即冷启动）。

同批补测**非流式**（客户端 `stream:false` + `tool_choice="required"`，走 `server.py:356` `_full_chat_direct` 的按 index 合并）：`finish=tool_calls`、`n_tool_calls=2`、两条独立 `id`（`call_44c31186…`/`call_6463b17a…`）、`arguments` 完整、`content` 为空、usage 齐全 → 删除 `stream=False` 死分支后非流式路径未退化。

## 6. 参数承载面（两条路，别混）

CLI bundle 里有两个不同的请求构造器，键集不同：

| 路 | 构造器 | 参数落点 | 承载键 |
|---|---|---|---|
| 平铺 OpenAI 形（`/model/v1/chat/completions`、gRPC `ChatCompletionRequest`） | `Icn()` @19433257 + 过滤函数 `DCc()` @19434864 | 顶层合并 | `top_p, top_k, presence_penalty, frequency_penalty, parallel_tool_calls, response_format, tool_choice, context_length, seed, user, enable_thinking, reasoning_budget_tokens, preserve_thinking`（+ 顶层 `stop/max_tokens/temperature/n/logit_bias/reasoning_effort`，`top_k` 进 `extras`） |
| 本仓库用的 SSE COSY 路（`agent_chat_generation`） | RemoteChatAsk 构造器 @23318769 区 + 读取方 `soA()` @19050267 / `Ili()` @19050868 | 全在 `parameters` map | `max_tokens, temperature, top_p, top_k, reasoning_effort, enable_thinking, reasoning_budget_tokens, thinking_budget, preserve_thinking, context_length, tool_choice` |

判据：`soA`/`Ili` 是这条 `parameters` map 唯一的读取方，只解上面那几项；`Din()` @19052100 一带把 `A.parameters` 原样带下去（`parameters:t`）并只把 `temperature/max_tokens/stop` 提到顶层，而 `stop` 无人读取 → 本路 `stop` 无承载。

`DCc()` 的 13 键清单属上表第一行那条路，不能拿来当本路的可接清单。

## 7. 缺陷台账（全部代理侧）

| # | 缺陷 | 判据 | 状态 |
|---|---|---|---|
| 1 | `tools` 从不转发 | 修复前 wire body 无 `tools` 键；修复后本地 decode `has tools=True names=['get_weather']` | 已修 |
| 2 | `delta.tool_calls` 被压成正文 | 修复前客户端 session JSONL 出现 `tools_count:0` + 工具 JSON 混在 assistant 文本；修复后 8471B 真实形状请求得 1 条完整 `Write`，`leaked=False` | 已修 |
| 3 | `finish_reason` 硬编码 `stop` | 三处均为 `finish_reason or "stop"`（`server.py:345/419/525`）；原 CLI 分支的写死随 §7-24 一并移除 | 已修 |
| 4 | assistant `tool_calls` 挂到上一条消息 | 两轮工具循环可跑通（结果 1081） | 已修 |
| 5 | usage chunk 被吞 | 实测 `prompt=339 completion=32 reasoning=21`（此前恒 `{0,0,0}`） | 已修 |
| 6 | 假流式 | `after_request` 曾对 streamed response 调 `get_data()`；现 `is_streamed` 直接返回，流完成行改由 `_stream_log` 发（`server.py:168` `:181`）。实测 19 chunk、ttft=1.56s、末 chunk 2.17s | 已修 |
| 7 | 上游 504/429 被洗成 HTTP 200 正文 | mock 后非流式真返回 504/429 JSON，content 无 HTML；真实 504（ALB 60.5s）如实透传 | 已修 |
| 8 | `enable_thinking:false`/`temperature` 被忽略 | 参数现已条件送出 | 已修 |
| 9 | `/v1/completions` 仍走 CLI | `_stream/_full_completions_direct`（`server.py:463/499`）已是该端点唯一实现（§7-24）。实测流式 8 帧 ttft=1.4s；token 数组 prompt → 400 | 已修 |
| 10 | `tool_choice` 错两层：先按 Anthropic 适配器发 `{type:"any"}`，后发在顶层 | 顶层发送时上游 4 取值全不敏感；改 `parameters.tool_choice`（CLI @23318769）后 `required`/function 均 honored（§5 实验 C） | 已修 |
| 11 | 401 无法定位旧 key 客户端 | 现 `401 bad key: POST /v1/chat/completions \| ip= UA= key=前6位`，rid 已在 `_check_auth` 内赋值 | 已修 |
| 12 | `requirements.txt` 缺 `pycryptodome`/`urllib3` | 已补（装机版本 3.23.0 / 2.6.2） | 已修 |
| 13 | `parallel_tool_calls` 顶层发送不生效 | 改 `parameters.parallel_tool_calls` 后 `false`→1 个调用，两次复现；缺省/`true`→2 个（§5 实验 D） | 已修 |
| 14 | `top_p`/`top_k`/`context_length` 未接 | 现条件写入 `parameters`；本地 decode 见值、上游 200 正常返回（`params_live.txt`） | 已修（采样效果本身不可证伪） |
| 15 | 流式分支丢 `max_tokens` | `_stream_chat_direct` 签名/转发无该参，`plumbing.txt` 里 stream 分支 `max_tokens=None`（非流式 100）；补签名后两支均 100 | 已修 |
| 16 | `/health` 的 `models` 取内置表 21 | direct 路实为 13（live `GET /v1/models` n=13，与 `list_model_ids()` 等值；内置 `QODER_MODELS` n=21，多出 `Auto/Ultimate/Performance/Efficient/Lite/Cantus` 档位别名）。现 `/health` 与 `/v1/models` 同源并加 `model_source`、`identity` 字段（§7-24 后只剩 `identity`，`model_source` 随开关一并去掉） | 已修 |
| 17 | `verify=False` ×2（TLS 校验关闭） | 打开前做了三步实测：① 系统信任库握手 `verify=True` 通过（TLSv1.3，`*.qoder.com.cn`，GlobalSign GCC R3 DV TLS CA 2020，到期 2027-01-04，主机名匹配）；② 无代理/自定义 CA 环境变量，链上不是企业中间证书；③ 真实签名模型列表 GET 强喂 `verify=True` 返回 13 个模型无 SSL 错。两处已改 `verify=True`（`qoder_cosy.py:509` `:838`），grep `verify=False` = 0 命中（§7-25 后为 ×3：`:161`/`:509`/`:838`） | 已修 |
| 18 | 身份缓存永不过期、无 401 感知 | 新增 `invalidate_identity()`（现 `qoder_cosy.py:379`）；chat POST（现 `:845`）与模型列表 GET（现 `:514`）在 401/403 时清缓存、重读 `~/.qoder-cn/.auth` 后**重签重试一次**；流内信封 401 也清缓存（现 `:870`）。打桩实测 4 例：401→200（2 post、2 重签、事件正常吐出、只重试一次）；403→403（2 post 后抛 `UpstreamError(403)`，不发第三次）；流内 401（`cache_cleared=True`）；直连 200（1 post，无多余请求） | 已修 |
| 19 | `dumps/` 无轮转，明文提示词无限增长 | 新增 `DUMP_MAX_FILES`（`server.py:47`，默认 200，≤0 关闭）与 `_dump_trim()`（`:60-74`，按 mtime 删最旧），`_dump_save`（`:76`）写后调用（`:87`）。实测：连续新请求后目录停在 200 个文件（52MB）不再增长 | 已修 |
| 20 | `run_qoder_cosy(stream=False)` 死且坏 | 上游该 path 只回 SSE，`resp.json()` 必抛 `JSONDecodeError`（前已实测）；4 个调用点全传 `stream=True`。已删该分支，两条路径统一走 SSE 解析（`qoder_cosy.py:854` 起），`requests` 的 `stream=` 仍按入参传递 | 已修 |
| 21 | `reasoning_budget_tokens` 未接 | 条件写入 `parameters`（`qoder_cosy.py:701-705`，仅正整数且思考开启），`server.py:252` 读取并透传两支。离线 decode 断言 + HTTP 实测（§5 实验 E）：reasoning_tokens 52/72/139 随 200/缺省/4000 单调上升 | 已修 |
| 22 | 现网 8389 跑旧代码 | 旧 PID 19312（01:59:28）已终止；新 PID 5928 启动 02:59:05，晚于 `qoder_cosy.py` 02:56:21、`server.py` 02:57:29 → 当时磁盘即现网。§5 实验 C/D 已在 HTTP 侧复测（见上）。此后 `server.py` 又改到 10:54:34（§7-23/§7-24），现网进程仍是 02:57 那份 → 见 §8 | 已修（再次落后） |
| 23 | `/health`、首页、启动横幅里三处 CLI 状态是硬编码字符串 | 原 `"qodercli": "installed"`、`<li>qodercli: 已安装</li>`、`认证: CLI 已登录` 均无检测。先改成 `shutil.which()` + `load_identity()` 实测并两分支验过（`PATH=""` 子进程 → `missing`/`warn`，`scratch/cli_false.txt`），随后按用户质疑收回来：`/health` 免鉴权（`server.py:130`）而服务绑 `0.0.0.0`（`:610`），每请求解一次身份等于向内网暴露"本机已登录"判据，且 `load_identity()` 会填 `_cached_identity`（`qoder_cosy.py:108`）——状态端点不该是身份缓存的写入方。现 `/health` 只回静态 `identity:"cli-auth (~/.qoder-cn/.auth)"`（`server.py:531-543`），真解密检测只留在启动横幅（`:602-606`，进程自读一次） | 已修 |
| 24 | 路由仍按 `BACKEND` 在 CLI/direct 间二选一 | 按要求删除该开关：`BACKEND` 两处 `os.environ.get` 全去掉；`/v1/models`、`chat_completions`、`/v1/completions`、`/health`、首页、横幅的条件分支与 `_stream_chat`/`_full_chat`（CLI 适配层，87 行）一并移除；`from qoder import …` 撤掉，`new_id()` 换成 `uuid` 内联（`server.py:262` `:447`）。`server.py` 791 → 610 行。判据：`grep -E "BACKEND\|run_qoder(\|resolve_model\|messages_to_prompt\|QODER_MODELS\|list_models(\|new_id\|shutil" server.py` = 0 命中、`py_compile` 通过。**`qoder.py` 当时整文件保留但无调用方（2026-10-10 已整文件删除）**。打桩回归（0 流量）：`chat/completions` stream/非 stream 两支 10 个参数全到达 `run_qoder_cosy`（`plumbing4.txt`）；`/v1/models` 200（stub 3 id）、`/health` 200、首页 200、`/v1/completions` stream/非 stream 200、`prompt=""`→400、token 数组→400（`cli_removed_rows.txt`） | 已修 |
| 25 | 身份完全寄生在 CLI 的 `~/.qoder-cn/.auth`：只读文件、丢弃 `refresh_token`/`expire_time`、过期只能等 CLI/IDE 在别处续 | 按 `yetone/magpie` 口径改为**自持有、纯 HTTP、只驻内存**（无新增文件、无落盘、无 `.auth` 读写）：常量 `:113-125` `:140`（`OPENAPI_HOST`/`WEB_HOST`/`DEVICE_CLIENT_ID=e883ade2-e6e3-4d6d-adf7-f92ceff5fdcb`/`REFRESH_LEAD_S=300`/`SIGN_IN_TIMEOUT_S=900`/`SIGN_IN_POLL_S=2`/`OPENAPI_RETRY_S=1.0`）；`_exchange_pat()` `:251` = `POST /api/v1/jobToken/exchange {personal_token}`；`_device_flow_sign_in()` `:264` = PKCE（`verifier=b64url(randomBytes(64))`→`challenge=sha256`）+ `GET /api/v1/deviceToken/poll?nonce&verifier&challenge_method=S256` 每 2s + `GET /api/v1/userinfo`（bearer=device）+ `POST /api/v1/me/jobToken {clientId}`，4xx 退 deviceChat（device token 直签）；`_refresh_credential()` `:332` 按 `token_type` 依次试 `jobToken/refresh`/`deviceToken/refresh`（一次性 pair，成功整体覆盖含轮换后的 `refresh_token`）；`load_identity()` `:358` 缓存判据带 `not _expiring()`，`_bootstrap()` `:314` 兜底；三处 401/403（模型列表 GET、chat POST、流内信封 `statusCodeValue`）统一调 `reauthenticate()` `:386`。`machine_id` 改为自生成 `uuid4`。**删掉 `identity_source()`**：它吞异常仍返回占位值，导致引导失败时横幅打印「就绪 (source=unavailable)」；横幅/`/health`/首页改为直读 `load_identity().get("source")` 或静态 `self-owned (PAT exchange / device flow, in-memory)`。openapi 调用统一走 `_request()` `:152`（`verify=True`、单次 1s 重试）。判据：`py_compile` 两支通过；离线打桩 13/13（`auth_offline.txt`：4 条凭证转换 + PKCE 三件套落 query + userinfo/me-jobToken 的 bearer + deviceChat 回退 + cosy 头用自有凭证签 + 模块内零凭证文件 IO + 3 个 `reauthenticate()` 调用点）；HTTP 打桩 13/13（`auth_http.txt`：`_openapi_post/get` 换成抛异常桩后 4 个端点全 200、`run_qoder_cosy` 被调 3 次、`messages` 位参到达、子进程调用 0 次）。**本行取代 §7-23 里「`/health` 只回静态 `identity:"cli-auth (~/.qoder-cn/.auth)"`」的现状描述**，也取代 §7-18 的「清缓存、**重读 `~/.qoder-cn/.auth`** 后重签」描述（现为重取凭证：续期→引导，行号 `:386`）；`~/.qoder-cn/.auth` 现网 mtime 事实（`user` 2026-10-09 21:23:13、`machine_id` 2026-10-03 16:18:25）保留为历史取证，本进程已不再读 | 已修（真实 PAT 兑换/网关接受随机 `machine_id`/一次真 chat 未跑 → 见 §8） |
| 26 | 把 `dt-` 设备令牌当 personal token 发：启动即 `PAT 兑换失败: HTTP 400` → `身份: 无可用凭证 (RuntimeError)`，且非 2xx 响应体被丢掉只剩状态码 | `_request()`（`qoder_cosy.py:152`）非 2xx 时打印 `_err_text()`（`:143`，按 CLI 取值的 `errorMessage/error_message/message/error`）→ 拿到上游原话。实测七连（假令牌做对照，见 §9）：`/userinfo` Bearer=`dt-*` **200**；`jobToken/exchange {personal_token: dt-*}` 400 `Bad request`；`me/jobToken` Bearer=`dt-*` 带 `{clientId}`/`{}`/`{client_id}` 三种 body 全 400 `Bad request`；`deviceToken/refresh {refresh_token: dt-*}` 400 **`invalid refresh_token: must start with drt-`**（假 `dr-CONTROL-FAKE` 同此文案，判据通用）；`jobToken/refresh {refresh_token: dt-*}` 400 `Bad request`。→ `dt-` 既不是 personal token 也不能自续期，但**它本身就是能签名的访问令牌**。`_bootstrap()`（`:314`）改为「令牌直用 → 非 `dt-` 前缀才试兑换 → 环境变量为空才 device flow」，`_bearer_credential()`（`:225`）用 `/userinfo` 200 作判据建凭证（`token_type=device(dt-)/job`、`uid=ui.id`、`machine_id=_PROCESS_MACHINE_ID` `:111`）；`_env_refresh()`（`:134`）新增可选 `QODERCN_REFRESH_TOKEN`，只有 `drt-` 能进 `refresh_token` 让预刷真的可续。**有环境变量时绝不阻塞等浏览器**：全败即 `RuntimeError`。同时统一三处变量名（server.py/benefit.py 的 `QODER*_DEVICE_TOKEN` → `QODER*_TOKEN`）。判据：`py_compile` 三支通过；离线打桩 23/23（新增「dt- 直用不发兑换」、「`dr-` 附进凭证后离到期 1s 自动换新对并轮换 refresh_token」「`/userinfo` 无 uid 拒建」「死令牌不触发 device flow」）；HTTP 打桩 13/13；真实读取 2 次：`env-token` 引导 + 随机 `machine_id` 签名 `GET model/list` → **13 个模型 200** | 已修（`dt-` 无配对 `drt-` 时仍不可续期 → 见 §8） |

## 8. 未闭环

| 项 | 判据/原因 |
|---|---|
| vision 未实测 | `_content_blocks`（`qoder_cosy.py:585`）有 `image_url` 分支，未发过真实图片请求 |
| 其他模型 | §3/§5 全部结论仅测了 Qwen3.8-Flash；`required`/function/`parallel` 未在其余 12 个模型上复测 |
| §6 本路无读取方的参数 | `stop`/`seed`/`user`/`n`/`logit_bias`/`response_format`/`presence_penalty`/`frequency_penalty` 不接，`soA`/`Ili` 无解析方，属协议层无法接，非遗漏 |
| 401 重试未经真实过期 token 验证 | §7-18 用打桩 fake response 验过分支覆盖；没有真过期 token 可造，"CLI 刷新后本进程自动跟上"仍是推论 |
| `reasoning_budget_tokens` 语义 | 只证明该键被读取且随值单调（§5 实验 E，单样本），未证明是硬上限 |
| 自持有凭证还剩两段没真跑 | 已证的一段：**随机进程级 `machine_id` 被网关接受**（`env-token` 引导 + 签名 `GET model/list` → 13 模型 200）。还差两段，都要真实账号：① 真 personal token 的 `jobToken/exchange`（手上的 `QODERCN_TOKEN` 是 `dt-`，按 §7-26 走不到这条，200 分支从未取到）；② PKCE device flow 完整一次浏览器授权 + `me/jobToken`（含 `deviceChat` 回退）。另：`dt-` 且未配 `QODERCN_REFRESH_TOKEN` 时**凭证不可续期**（`renewable=False`，`expire_time` 也为 0 所以永不预刷），上游 401 后只会重跑引导；要自动续期需 `drt-` 或走一次 device flow（**2026-10-10 起 `.env` 已配 drt-，解自 `.auth/user`，见 [CREDENTIALS.md](CREDENTIALS.md)**） |
| 现网 8389 落后磁盘，且端口上有两个 LISTENING | 磁盘 `server.py` mtime 11:36:26、`qoder_cosy.py` 11:40:01（§7-25）；`netstat -ano \| findstr :8389` 实测两个 LISTENING：PID 5928 启动 02:59:05、PID 21632 启动 11:30:22，**两者都早于 11:40:01** → 现网跑的仍是 CLI 凭证版。Windows 下 `SO_REUSEADDR` 允许重复 bind，连接由先起的那个 accept，只杀一个有让另一个顶上的风险；两个进程均归属其他会话，未擅自终止 |

## 9. Evidence 路径

| 内容 | 路径 |
|---|---|
| 请求/响应原文 | `dumps/<rid>.{req,resp}.txt` |
| 服务日志（rid、ttft、字节、WARNING） | `request.log`（2MB ×3 轮转） |
| 客户端可见结果判据 | `~/.atomcode/sessions/<sid>/<turn>.jsonl`（`tools_count`、`usage`、assistant 是否内嵌工具 JSON） |
| 参考实现（上述 offset 出处） | 参考项目 **`yetone/magpie`**（7.3k⭐，`internal/qoder/` Go + `magpie-community/plugins` `packages/qoder/index.mjs`；协议上游 `ufec/CLIProxyAPI`, MIT）。本地唯一拷贝 = 该 index.mjs 抓取结果 `C:\Users\12925\.breezell\tool-results\call_3919fd55868547b58fbd9c85.txt`（64929 B，2026-10-09 22:16）；关键 offset：`deviceSignIn` @10881、`deviceToken/poll` @11607、`POST /api/v1/me/jobToken` @11881、`refreshJob` @14039、`refreshDevice` @48491、`client.auth.set` @56412/@57363、`REFRESH_LEAD/RENEW_LEAD/KEEP_SPENT_MS` @2988、`spend()/renewals` @54900。magpie 本体 Go 源码磁盘无克隆。同系列逆向记录：`E:\VSCodeSpace\codearts\codearts2api\.breezell\memories\workspace_memories.md:24-45`（`E:\VSCodeSpace\Agent\CodeArts\` 下同名旧文件只有已作废的三个早期候选） |
| §7-25 凭证链路离线打桩（0 真实流量） | `C:\Users\12925\AppData\Local\Temp\scratch\auth_offline.py` → `…\auth_offline.txt`：`_openapi_post/_openapi_get` 换成记账桩，13/13 覆盖 PAT 引导、`machine_id` 自生成 UUID、exchange body 只含 `personal_token`、预刷轮换（`[exchange, jobToken/refresh]`）、续期被 403 拒绝后重新引导（含 `deviceToken/refresh` 回退序）、device flow 三步（`poll → userinfo → me/jobToken`）、PKCE 三件套落 query（`nonce/verifier/challenge_method=S256`）、`userinfo` 与 `me/jobToken` 的 bearer、`me/jobToken` 4xx → `deviceChat` 回退、cosy 头用自有凭证签、模块内零凭证文件 IO、`reauthenticate()` 调用点 = 3 |
| §7-25 HTTP 层打桩（0 真实流量） | `…\auth_http.py` → `…\auth_http.txt`：openapi 双桩改「记录后抛 `AssertionError`」，`run_qoder_cosy` 桩事件按合同键 `type`（`reasoning`/`content`/`tool_calls`/`usage`/`finish`）且 `messages` 位参到达。13/13：chat stream/非 stream 200、流内含 `reasoning_content`+`tool_calls`+`finish_reason: "tool_calls"`+`[DONE]`、非 stream usage 透传、`/v1/completions` stream 200、`/v1/models` n=3、`/health.identity == "self-owned (PAT exchange / device flow, in-memory)"` 且整个 JSON 不含 `cli`、首页含「自持有」且不含 `.qoder-cn`、`run_qoder_cosy` 被调 3 次、请求期 openapi 调用 0 次、子进程调用 0 次 |
| §2 DNS 复测（撤回「不同机」） | `openapi.qoder.com.cn` 与 `gateway.qoder.com.cn` 解析到**同一组** A 记录：47.116.142.188 + 8.153.206.47；此前记录的「openapi=8.153.206.47 / gateway=47.116.142.188，不同机」为误记 |
| §7-25 openapi TLS 抖动与 `verify=True` 实测 | 对 `POST /api/v1/jobToken/exchange` 用假 PAT：先两次 `ssl.SSLEOFError: [SSL: UNEXPECTED_EOF_WHILE_READING]`，随后 5/5 正常返回 `400 {"errorCode":"BadRequest"}`；同主机 GET 全程通过；到两个 IP × 两个 SNI 的裸握手 3/3 OK。判为瞬时抖动 → `_request()`（`:152`）加单次 1s 重试（`OPENAPI_RETRY_S` `:140`） |
| §7-26 令牌语义实测（真实账号，全为失败/读取，未消耗配额） | `…/scratch/renew_probe.py` → `…/renew_probe.txt`：A `userinfo`=200 / B、C `deviceToken/refresh`=400 `invalid refresh_token: must start with drt-` / D、E `jobToken/refresh`=400 `Bad request` / F `me/jobToken`=400 / G `exchange`=400；响应体形状统一 `{errorCode, errorMessage, rawMessage?, requestId}`。对照 `…/scratch/shape400.py`（A/B/C 三种 exchange body + `me/jobToken`，全 400）与 `…/scratch/why400.py`（首次拿到 `Bad request` 与 `requestId`）。CLI 侧发法取证：`…/scratch/exch_bundle.txt`（bundle @18966358 `exchangePersonalToken` body = `{personal_token, ...getMachineIdentityRequestFields()}`、@18970062 该字段为 `{machine_id?, machine_token?}` 皆可省、@18977463 `deviceToken/refresh` 需 `refresh_token`） | | §7-26 上线后真实读取 | `…/scratch/live_identity.py`：`source=env-token type=device renewable=False`、二次 `load_identity()` 命中缓存 0 请求、签名 `GET model/list` → 13 | | 协议常量与字段来源 | `~AppData/Roaming/npm/node_modules/@qodercn-ai/qoderclicn/bundle/qoderclicn.js`（offset 23318200-23319300 RemoteChatAsk 构造器 `parameters:h` + `h.tool_choice`/`h.context_length`、19050267 `soA()` 与 19050868 `Ili()` = `parameters` 唯一读取方、19052100 `Din()` 原样下传 `parameters:t`、19433257 `Icn()` + 19434864 `DCc()` = 另一条平铺 OpenAI 形路、19413556 `k3A` / 19426923 `M3A` protobuf Value 包装、19524515 `z0c` = Anthropic Messages 适配器的 `type:any/tool` 枚举）、`bundle/proto/chat.proto:26-51`（`ChatCompletionRequest`，`parallel_tool_calls=14`、`tool_choice=17`，属 gRPC 路非本路信封） |
| §5 实验原始输出 | 实验 C：`C:/Users/12925/AppData/Local/Temp/scratch/tc_params.txt`；实验 D：`…/ptc_params.txt`；参数被上游接受：`…/params_live.txt`。作废数据（顶层发送）：`…/ab2.txt`、`…/http_check.txt` |
| §3.1 prompt cache A/B（真实推理） | `…/scratch/ab_fields.py`：同一条 direct 路各发一对「冷+热」25k prompt。基线（顶层无 `session_id` 等字段）热请求 `25737/25743 = 0.9998`；注入 CLI 顶层字段（`request_id/request_set_id/chat_record_id/session_id/stream/chat_task/version/is_reply/is_retry/source`）`25745/25751 = 0.9998`。冷启动样本：`dumps/r0029`（112k）、`r0030`（46k）、`r0037`（50k），均为该前缀首见 |
| 模型列表来源对比 | `…/scratch/live_models.json`（live `GET :8389/v1/models`，n=13）；对比结果 `live==direct? True`、`live==cli? False`（内置 `QODER_MODELS` n=21，多出的是 `Auto/Ultimate/Performance/Efficient/Lite/Cantus` 等档位别名） |
| HTTP 层字段透传（stub 上游，0 真实流量） | `…/scratch/plumbing.py` → `…/plumbing.txt`、`…/plumbing3.txt`：`test_client` 打两支（stream/非 stream），断言 `top_p/top_k/context_length/tool_choice/parallel_tool_calls/temperature/max_tokens/tools/reasoning_budget_tokens` 全部到达 `run_qoder_cosy` |
| 上线 wire 形状断言（离线 decode，0 流量） | `…/scratch/wire_shape.py` → `…/wire_shape.txt`：`build_request_body` 产物经 `qoder_decode` 后，11 个参数全在 `parameters` 内、顶层零泄漏；反例两条（`enable_thinking=false` 时不带 budget；`tool_choice={type:"any"}` 不挂载） |
| §7-18 401/403 重试分支（打桩，0 流量） | `…/scratch/retry401.py` → `…/retry401.txt`：401→200 = 2 post/2 重签/只重试一次；403→403 = 2 post 后抛错；流内信封 401 = 缓存清空；直连 200 = 1 post |
| §5 实验 E + HTTP 侧 C/D 复测（真实推理） | `…/scratch/budget_live.py` → `…/budget_live.txt`（reasoning_tokens 52/72/139 对应 200/缺省/4000）；`…/scratch/http_cd.py` → `…/http_cd.txt`（4 条：required 2 calls、function 2 calls、`parallel=false` 1 call、`parallel=true` 1 call 单样本）；原始 SSE 取证 `…/sse_raw.txt`（22 条 data 行、含 `finish_reason":"tool_calls"`、两个 tool_call index） |
| §7-17 TLS 校验决策实测 | `…/scratch/tls_check.py` → `…/tls_check.txt`（系统信任库握手 `verify=True`：TLSv1.3 / `*.qoder.com.cn` / GlobalSign GCC R3 DV TLS CA 2020 / 到期 2027-01-04 / 主机名匹配）；`…/scratch/tls_check2.py` → `…/tls_check2.txt`（代理与 CA 类环境变量全为 null；`fetch_models()` 强喂 `verify=True` 返回 n=13） |
| §7-23 两分支取证（后被撤销的 `/health` 实测） | `python.exe -c` 正常 PATH → `qodercli:"found"`/`identity:"cli-auth readable"`；`PATH=""` 子进程 → `qodercli:"missing"`、首页行切 `warn`（`C:/Users/12925/AppData/Local/Temp/scratch/cli_false.txt`）。该实测形态因 §7-23 理由（免鉴权 + `0.0.0.0`）已撤回，仅留作证据 |
| §7-24 CLI 后端移除回归（stub 上游，0 真实流量） | `…/scratch/plumbing.py` → `…/plumbing4.txt`（stream/非 stream 两支各 10 个参数全到达 `run_qoder_cosy`，HTTP 200）；`…/scratch/cli_removed.py` → `…/cli_removed_rows.txt`（`/health` 200、`/v1/models` 200 stub 3 id、首页 200、`/v1/completions` stream/非 stream 200、`prompt=""`→400 `prompt is required`、token 数组→400） |
| 身份 | `~/.qoder-cn/.auth/{machine_id,user}` |
| 现网进程 | 8389 上两个 `LISTENING`：PID 5928 @02:59:05（实测 accept，即为服务进程，代码 = 02:57 那份）与 PID 21980 @10:09:38（另一会话所起，不收新连接）。`server.py` 已到 10:54:34 → §7-23/§7-24 未生效，待干净重启（需连 21980 一起处理）；旧 PID 19312 已终止 |
