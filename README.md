# Qoder CN 客户端逆向

对 Qoder CN 桌面客户端（Electron）的逆向记录。取证日期：2026-10-04。

## 文档

| 编号 | 文档 | 内容 |
|---|---|---|
| 00 | [总览](docs/00-总览.md) | 目标形态、产物结构、依赖清单 |
| 01 | [API 与鉴权](docs/01-API与鉴权.md) | 域名、140 条 API 路径、Bearer 鉴权、safeStorage、内置 MCP 客户端 |
| 02 | [内部架构](docs/02-内部架构.md) | 代码形态、610 个业务码、插件私有协议、原生模块、遥测 |
| 03 | [渲染进程与功能面](docs/03-渲染进程与功能面.md) | 1131 chunk、图表/PPT/排版能力、语音会议子系统 |
| 04 | [Agent 执行与插件体系](docs/04-Agent执行与插件体系.md) | RUNTIME 生命周期、插件清单格式、Qoder Context 插件、安全设计 |
| 05 | [API 规格](docs/05-API规格.md) | 154 个 operation 精确解析（method / bodySchema / responses）|
| 06 | [字段级 Schema](docs/06-字段级Schema.md) | 请求体字段还原 38/41（三种存储形态 + Zod 约束）|
| 07 | [响应 Schema 与领域模型](docs/07-响应Schema与领域模型.md) | 泛型信封追踪，18 个核心实体的完整字段与嵌套结构 |
| 08 | [渲染进程与 Preload 深挖](docs/08-渲染进程与Preload深挖.md) | 5.9 MB 插件视图运行时、Ace/Lit/React 三栈、沙箱隔离配置 |
| 09 | [活动权益与签到 API](docs/09-活动权益与签到API.md) | campaigns API、奶茶免单卡抢领、growth-page JS 逆向 |
| 10 | [机器标识与风控指纹](docs/10-机器标识与风控指纹.md) | runtime-info.exe 调用协议、Cosy-Machine* 头注入、auth.machine-id、代码流 |
| 11 | [CLI 协议与直接 API](docs/11-CLI协议与直接API.md) | 两代推理协议、端点清单、Token 类型、双后端网关实现 |

## 快速上手

```powershell
# 解析 asar 结构
node scripts\asar_index.js "<安装路径>\resources\app.asar" evidence\01-observe\asar-index.json

# 提取主进程代码
node scripts\asar_extract.js "<asar>" evidence\01-observe\asar-index.json main evidence\01-observe\out-main

# 提取全部 JS/JSON
node scripts\asar_extract.js "<asar>" evidence\01-observe\asar-index.json js evidence\01-observe\out-js

# 扫描业务码
node scripts\list_codes.js evidence\01-observe\out-main\out\main\index.js evidence\01-observe
```

## 现状小结

| 面 | 状态 |
|---|---|
| 目标形态 | ✅ Electron 0.4.3，单文件主进程 |
| 产物结构 | ✅ 4658 文件索引，main/renderer/preload 已提取 |
| API 面 | ✅ 20 域名 + **154 个 operation**（method / bodySchema / responses）|
| 请求体字段 | ✅ **38/41**，含类型、格式、长度、范围、enum |
| 响应体字段 | ✅ **18 个核心实体**，含嵌套路径与 uuid/date-time |
| 鉴权 | ✅ Bearer + refresh，OS 级 `safeStorage` 加密存储（已解密 auth.v1.dat）|
| MCP 子系统 | ✅ 自研 stdio 客户端 + 279 个专属错误码 + 私有插件协议 |
| 渲染进程 | ✅ 1131 chunk 分类，功能域权重已测 |
| 插件体系 | ✅ RUNTIME 生命周期 + 清单校验 + Qoder Context 插件已提取 |
| 模型链路 | ✅ 双后端网关跑通：CLI 包装（`BACKEND=cli`）+ 直接 API（`BACKEND=direct`，COSY 签名 → `gateway.qoder.com.cn`） |
| 活动权益 | ✅ campaigns API + 奶茶免单卡抢领（10:00:00 精准定时 + 100ms 快速重试）|
| 机器标识 | ✅ runtime-info.exe 硬件指纹 + Cosy-Machine* 头注入 + auth.machine-id |

**网关使用**：

```powershell
# CLI 包装后端（默认，端口 8388）
cd qoder2api; python server.py

# 直接 API 后端（端口 8389，COSY 签名直调 gateway.qoder.com.cn）
$env:BACKEND="direct"; $env:PORT="8389"; python server.py
```

**下一步建议**：API Key 鉴权、多账号轮转、并发闸门 + 退避重试。