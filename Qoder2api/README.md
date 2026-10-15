# Qoder2api

> Qoder COSY 模型 → OpenAI / Anthropic 兼容 API 网关

把 Qoder 云端的 COSY 协议接口包装为三协议兼容接口，供任意客户端调用。

## 功能特性

- **三协议兼容**：OpenAI Chat Completions · OpenAI Responses · Anthropic Messages
- **COSY 协议适配**：上游 `gateway.qoder.com.cn` 走 COSY 事件流，网关转标准 OpenAI 格式
- **OAuth 登录**：设备流授权，后台自动续期
- **WebUI 管理面板**：凭证状态 / 模型列表
- **流式 / 非流式双模式**

## 快速开始

```bash
pip install -r requirements.txt
python server.py
```

```
Base URL : http://127.0.0.1:8388/v1
API Key  : .env 的 API_KEY
Model    : /v1/models 返回的 id
```

浏览器打开 <http://127.0.0.1:8388/> 是管理面板。

## API 接口

| 端点 | 方法 | 说明 |
|---|---|---|
| `/v1/chat/completions` | POST | OpenAI Chat Completions（流式/非流式） |
| `/v1/completions` | POST | OpenAI Completions（文本补全） |
| `/v1/responses` | POST | OpenAI Responses API（翻译层 ⇄ Chat） |
| `/v1/messages` | POST | Anthropic Messages API（翻译层 ⇄ Chat） |
| `/v1/models` | GET | 可用模型列表 |

### 协议翻译架构

```
客户端                 proxy 翻译层              上游（COSY）
─────────            ─────────────            ─────────────
Chat Completions ──→  COSY→Chat           ──→  gateway.qoder.com.cn
Responses        ──→  responses_to_chat  ──→  gateway.qoder.com.cn
Anthropic        ──→  anthropic_to_chat  ──→  gateway.qoder.com.cn
                    ↑ 响应翻回各自格式
```

上游走 COSY 事件流协议，网关先转成 Chat Completions 格式，再按客户端协议翻回。`thinking`、`cache_control` 等 Anthropic 特有字段无 Chat 对应项，翻译时丢弃。

## 配置

| 变量 | 默认 | 说明 |
|---|---|---|
| `API_KEY` | — | 本地鉴权 Bearer token |
| `PORT` | `8388` | 监听端口 |

## 已知限制

- **thinking / cache_control 丢失**：Anthropic 特有字段，Chat 协议无对应项
- **凭证隔离**：只读本目录凭证，绝不碰 Qoder 客户端本体

## 项目结构

```
Qoder2api/
├── server.py              # Flask 反代主体
├── qoder_cosy.py          # 上游 COSY 协议客户端
├── oauth.py               # OAuth 设备流登录
├── webui.py               # WebUI 管理面板
├── benefit.py             # 福利签到
├── responses_bridge.py    # Responses ⇄ Chat 翻译层
├── anthropic_bridge.py    # Anthropic ⇄ Chat 翻译层
├── test_responses_route.py
├── test_stream_errors_offline.py
└── .env                   # 本地配置
```
