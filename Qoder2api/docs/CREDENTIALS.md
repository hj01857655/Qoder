# 凭证与续期：dt- / drt- / OAuth 设备流

> 面向用途：令牌从哪来、怎么续期、`.auth/user` 怎么解、poll 404 怎么判。
> 全部为实测值，令牌值一律不落文档。协议细节见 [PROTOCOL.md](PROTOCOL.md)（§2「身份来源」、§7-25/26）。
> 状态截至 2026-10-10。

## 1. 30 秒版

- 凭证本体是 **OAuth 2.0 产物**（Device Flow + PKCE(S256) + refresh token 轮换）：
  access token **`dt-`**（签名用）+ refresh token **`drt-`**（续期用），各带过期时间。
- 网关凭证只走一个文件：项目根 `credentials.json`（device flow 生成，轮换覆盖写，删除即重新登录）；`.env` 只存配置（PORT/API_KEY），不放任何令牌（2026-10-10 起）。
- **2026-10-10 凭证已入 `credentials.json`**（`dt-`+`drt-`，source=device）：网关可自动续期。
- 三个易混点各一句：dt- **能签名不能自续**；poll **404 是「还没授权」不是端点错**；解密 key **不是什么机器密钥，就是 machine_id 前 16 字符本身**。

## 2. 令牌语义（真账号实测，PROTOCOL.md §7-26）

| 令牌 | `GET /userinfo` Bearer | `POST /deviceToken/refresh` `{refresh_token}` | `POST /jobToken/refresh` | `POST /jobToken/exchange` `{personal_token}` |
|---|---|---|---|---|
| `dt-`（设备访问令牌，27 字符） | **200**（可直接签名） | 400 `invalid refresh_token: must start with drt-` | 400 `Bad request` | 400 `Bad request` |
| `drt-`（设备刷新令牌，28 字符） | — | **200** → 新 pair | — | — |
| 真 personal token | — | — | — | 200 → job token |

- `deviceToken/refresh` 成功响应：`{device_token, refresh_token, expires_at, refresh_token_expires_at}`——**refresh_token 轮换**，旧 drt- 立即作废，新 pair 必须整体覆盖。
- `jobToken/refresh` 成功响应：`{token, refresh_token, expires_at｜expires_in}`。
- 判据：拿 dt- 当 refresh_token 发刷新，上游原话 `invalid refresh_token: must start with drt-`（假 `dr-CONTROL-FAKE` 同文案，判据通用）。

## 3. drt- 从哪来

**网关侧（2026-10-10 起）不需要手工获取**：唯一凭证文件 `credentials.json` 由 device flow 生成、续期轮换自动覆盖写；删除该文件或 POST /login 即重新登录。以下是手工/CLI 侧的来源（恢复凭证或研究用时）：

1. **解密 `~/.qoder-cn/.auth/user`**（文件就在机器上）——`qoderclicn login` 后落盘，`refresh_token` 字段就是 drt-。见 §4。
2. **走一次 PKCE device flow**——`python oauth.py` 预登录，或删掉 `credentials.json` 启动网关；poll 翻 200 的响应里就带 pair。
3. **已有有效 drt- 就能自续**——`deviceToken/refresh` 换新 pair，从此闭环。

- ⚠️ **轮换即作废旧 drt-**：谁消费了某个 drt-，旧值立即失效。CLI/App 重新登录或自动刷新后，其他持有旧 drt- 的一方首次续期 400，需取新 pair。

## 4. `.auth/user` 解密法（完整可复现，2026-10-10 实测）

| 项 | 值 |
|---|---|
| 文件 | `C:\Users\<u>\.qoder-cn\.auth\user`（~1324 B，**单行标准 base64**，解码后 992 B） |
| key 材料 | `C:\Users\<u>\.qoder-cn\.auth\machine_id`（36 字符 UUID 字符串） |
| 算法 | **AES-128-CBC，key = IV = machine_id 的前 16 个 ASCII 字符**，PKCS7 填充 |

```python
import base64, json
from pathlib import Path
from Crypto.Cipher import AES

auth = Path.home() / '.qoder-cn' / '.auth'
mid  = (auth / 'machine_id').read_text().strip()
cb   = base64.b64decode((auth / 'user').read_text().strip())
k    = mid[:16].encode('ascii')            # key = IV = machine_id 前 16 字符
p    = AES.new(k, AES.MODE_CBC, iv=k).decrypt(cb)
d    = json.loads(p[:-p[-1]])              # PKCS7 去垫 → JSON
```

字段集（实测 17 键）：`{uid, name, avatar_url, security_oauth_token, access_token, refresh_token, expire_time, refresh_token_expire_time, login_method, login_timestamp, encrypt_user_info, key, data_policy_agreed, startup_validation, is_data_policy_modifiable, user_type, is_personal_version}`。

判据与坑：
- `access_token` = dt-（27 字符）、`refresh_token` = drt-（28 字符）、`expire_time`/`refresh_token_expire_time` 为 **epoch 秒**。
- 解不开时先确认它**不是** DPAPI：直接 b64decode → `CryptUnprotectData` 实测报「数据无效」（pywintypes.error (13)），此文件不走 DPAPI，别再试。
- Electron App 另有自己的 `auth.v1.dat`（safeStorage：`v10` + nonce(12) + AES-256-GCM，key = DPAPI 解 Local State `os_crypt.encrypted_key`）——**另一套解法，别混**，见 `E:\VSCodeSpace\Agent\qoder\docs\10-机器标识与风控指纹.md` §7。

## 5. deviceToken/poll 404 语义（2026-10-10 实测 + magpie 对照）

- poll 形状：`GET https://openapi.qoder.com.cn/api/v1/deviceToken/poll?nonce&verifier&challenge_method=S256`；授权页 `https://qoder.cn/device/selectAccounts?challenge=…&challenge_method=S256&nonce=…&machine_id=…&client_id=e883ade2-e6e3-4d6d-adf7-f92ceff5fdcb`（CN CLI 的 client_id）。与 magpie `oauth.go` 完全一致。
- **404 = nonce 还没挂上待授权会话（浏览器尚未授权），不是端点错**。magpie `PollDeviceToken` 对**非 200 一律视为未授权、继续轮询**（每 2s，≤900s）；浏览器授权完成后翻 200，返回 `{token: dt-, refresh_token: drt-, user_id, expires_in/expires_at}`——**drt- 就在这条响应里**。
- 判据：启动后日志连刷 `/api/v1/deviceToken/poll → HTTP 404` 属预期噪音；去把打印的授权 URL 在浏览器走完即可。

## 6. 网关现状（2026-10-10）

- **凭证唯一来源是项目根 `credentials.json`**：`dt-` + `drt-`，source=device，uid `01a100d8…`，2026-10-10 device flow 实登；`.env` 只存配置（PORT/API_KEY）。
- 行为：临近到期（<5min）预刷；401/403 → `reauthenticate()` → `_refresh_credential()`（device 类先试 `deviceToken/refresh`）→ 新 pair **覆盖写回 `credentials.json`**（自愈闭环，重启即恢复）。
- 文件里 `expire_time=4383606672`（=2108 年，上游 device flow 响应给的远期值）→ `_expiring()` 不会预刷，续期实际由上游 401 触发。
- 删除 `credentials.json` 即重新登录（启动打印授权 URL 阻塞等待，或 POST /login 非阻塞）；`QODER_PERSIST=0` 关闭落盘。

## 7. Evidence

| 内容 | 出处 |
|---|---|
| 令牌语义七连（上表矩阵） | PROTOCOL.md §7-26、§9（`renew_probe.txt` 等） |
| 解密法验证 | 2026-10-10 实测：992 B 二进制、AES-128-CBC(key=IV=machine_id[:16])、PKCS7，解出 17 键 JSON；同法先行验证见 Breezell 线程记录 `codearts2api-71ace47c….jsonl` i=1850/1859 |
| poll 404 语义 | 2026-10-10 实测日志（poll 404 连发）+ magpie `internal/qoder/oauth.go`（`PollDeviceToken` 非 200 继续轮询；`DeviceToken` 结构带 `refresh_token`） |
| 代码落点 | `qoder_cosy.py`（`_save_cred`/`_load_cred_file` 落盘与恢复、`load_identity` 链路：缓存 → credentials.json → device flow）、PROTOCOL.md §2「身份来源」「.env」行 |
