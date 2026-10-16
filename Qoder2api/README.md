# Qoder2api

> Qoder COSY 模型 → OpenAI / Anthropic 兼容 API 网关

把 Qoder 云端的 COSY 协议接口包装为三协议兼容接口，供任意客户端调用。

## 功能特性

- **三协议兼容**：OpenAI Chat Completions · OpenAI Responses · Anthropic Messages
- **COSY 协议适配**：上游 `gateway.qoder.com.cn` 走 COSY 事件流，网关转标准 OpenAI 格式
- **思维链结构化**：上游 `reasoning_content` 独立通道返回；上游偶发把 `<think>` 模板标签内联进正文时，跨 chunk 分流状态机实时归位，孤立/嵌套标签按噪声丢弃
- **出站历史净化**：回传给上游的 assistant 历史自动剥离内联 think 标签，污染不会每轮回显
- **antml 工具调用回收**：模型把工具调用写成正文文本时（流式/非流式），自动拆回结构化 `tool_calls`
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
| `/v1/responses` | POST | OpenAI Responses API（请求翻 Chat 调上游，响应由桥重放原生事件流） |
| `/v1/messages` | POST | Anthropic Messages API（翻译层 ⇄ Chat） |
| `/v1/models` | GET | 可用模型列表 |

### 协议翻译架构

```
客户端                 proxy 翻译层              上游（COSY）
─────────            ─────────────            ─────────────
Chat Completions ──→  直通                 ──→  gateway.qoder.com.cn
Responses        ──→  responses_bridge     ──→  gateway.qoder.com.cn
                      （请求翻 Chat；响应重放 Responses 事件流——sequence_number
                        递增、终帧携带聚合全文与 usage）
Anthropic        ──→  anthropic_bridge     ──→  gateway.qoder.com.cn
                      （双向翻译）
```

上游走 COSY 事件流协议，网关先转成 Chat Completions 格式，再按客户端协议翻回。`cache_control` 等 Anthropic 特有字段无 Chat 对应项，翻译时丢弃；上游思维链经 `reasoning_content` 通道结构化返回，Anthropic 客户端侧以纯文本块交付。

## 配置

| 变量 | 默认 | 说明 |
|---|---|---|
| `API_KEY` | — | 本地鉴权 Bearer token |
| `PORT` | `8388` | 监听端口 |

## 已知限制

- **cache_control 丢失**：Anthropic 特有字段，Chat 协议无对应项（上游亦无 Anthropic 式 prompt cache）
- **Anthropic thinking 块丢弃**：客户端入站的 `thinking` 配置不透传（上游 `enable_thinking` 由模型推理属性决定）
- **Anthropic base URL 不带 `/v1`**：`ANTHROPIC_BASE_URL` 填 `http://host:port` 即可，客户端自己补 `/v1/messages`；若填成 `.../v1`，请求会打到 `/v1/v1/messages`。此前会收到 Flask 默认 HTML 404（被 Claude Code 误报成"模型不可用"），现已统一回 JSON 错误体，且 `/messages` 路附上该提示。
- **流式 usage 在末帧给出**：上游只在流末产 usage，故 `message_start.usage` 是占位零，真实 `input_tokens`/`output_tokens` 在收尾的 `message_delta.usage` 里（客户端按后者算上下文占用与成本）。
- **凭证隔离**：只读本目录凭证，绝不碰 Qoder 客户端本体
