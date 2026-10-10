# 09 · 活动权益与签到 API（动态逆向）

取证日期：2026-10-09。方法：app 日志分析 + growth-page JS 逆向 + `runtime-info.exe` 调用 + API 实测。

## 1. Campaigns API

### 端点

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/sash/api/v1/me/campaigns` | 查活动状态 |
| POST | `/sash/api/v1/me/campaigns/{campaignId}/claim` | 领取活动奖励 |
| GET | `/sash/api/v1/me/campaigns/{campaignId}/reward` | 查领取后的奖励详情（兑奖码） |
| GET | `/sash/api/v1/me/achievements` | 查用户成就完成情况 |
| GET | `/sash/api/v2/me/usage` | 查 Credits 用量 |

域名：`https://openapi.qoder.com.cn`（CN）/ `https://openapi.qoder.com`（国际）。

### 请求头

```
Authorization: Bearer <PAT>
Accept: application/json
User-Agent: Qoder
Cosy-ClientType: 10          # 必须带，否则 showCampaign=false
Cosy-Version: 0.4.3
Cosy-MachineOS: win32
Cosy-MachineHostname: <主机名>
Cosy-MachineId: <machineId>           # 从 auth.machine-id 文件读
Cosy-MachineToken: <machineToken>     # 从 runtime-info.exe 获取
Cosy-MachineCode: <machineCode>       # 从 runtime-info.exe 获取
Cosy-MachineType: <machineType>       # 从 runtime-info.exe 获取
```

**关键发现**：仅带 `Cosy-ClientType: 10` 时 API 只返回 2 个活动（100 Credits + Pro 福利）。**奶茶免单卡活动只在带完整机器标识头（`Cosy-MachineToken`/`Code`/`Type`）时才出现**。缺这些头时 claim 返回 503 `SAME_PERSON_DEPENDENCY_UNAVAILABLE`。

## 2. 机器标识（runtime-info.exe）

> 详见 [10-机器标识与风控指纹](10-机器标识与风控指纹.md)。

Campaigns API 需要完整的 `Cosy-Machine*` 系列头。`Cosy-MachineToken`/`Code`/`Type` 由 `resources/umid/runtime-info.exe` 生成（硬件指纹），`Cosy-MachineId` 从 `auth.machine-id` 文件读取。缺这些头时 API 不返回奶茶活动，claim 返回 503 `SAME_PERSON_DEPENDENCY_UNAVAILABLE`。

## 3. 活动清单

### 3.1 每日 100 Credits

| 字段 | 值 |
|---|---|
| campaignKey | `act-20260930-736` |
| actionType | `CLAIM_BENEFIT` |
| benefit.kind | `CREDITS` |
| benefit.amount | 100 |
| benefit.validity | `RELATIVE_DAYS`, 30 天 |
| 刷新时间 | 每日 10:00 (UTC+8) |
| claimStatus | `CLAIMABLE` → 领取后 `CLAIMED` |

### 3.2 Pro 福利

| 字段 | 值 |
|---|---|
| campaignKey | `act-20260901-922` |
| actionType | `VIEW_DETAILS` |
| claimStatus | `CLAIMED` |

### 3.3 奶茶免单卡

| 字段 | 值 |
|---|---|
| campaignId | `01a0e886-e3b4-7ab6-887c-431f37021ffa` |
| campaignKey | `act-20260928-620` |
| actionType | `CLAIM_BENEFIT` |
| benefit.kind | `REDEMPTION_CODE` |
| benefit.amount | 1 |
| benefit.validity | `FIXED_END`, `2026-10-29T15:59:00Z` |
| requiredAchievementKey | `sites_first_use` |
| achievementCompleted | `true`（已发布站点） |
| claimStatus | `NOT_ELIGIBLE`（码已领完时） |
| unavailableReason | `REDEMPTION_CODE_OUT_OF_STOCK` |
| 活动时间 | 2026-09-28 ~ 2026-10-29 |
| 刷新时间 | 每日 10:00 (UTC+8) |

**claim 返回**（200 + FAILED）：

```json
{
  "grantId": "01a11fa6-...",
  "status": "FAILED",
  "failureCode": "REDEMPTION_CODE_OUT_OF_STOCK",
  "campaignId": "01a0e886-e3b4-7ab6-887c-431f37021ffa",
  "campaignKey": "act-20260928-620",
  "claimedAt": "2026-10-09T07:52:41.901667Z"
}
```

## 4. Growth-page JS 逆向

### 来源

```
https://g.alicdn.com/qbase/qoder/0.0.718/growth-page/activity-iframe/activity-iframe.js
```

app 通过 Electron `BrowserWindow` 加载此 iframe，`onBeforeSendHeaders` 拦截注入鉴权头。

### 奶茶 UI 文案（zh-CN）

```javascript
{
  title: "Qoder 送你一张奶茶免单卡",
  loading: "正在查询活动权益…",
  claimable: "福利已解锁，点击领取活动码",
  locked: "请完成 Qoder 站点创建",
  task: "在 Qoder 输入框 @站点 新建站点任务，完成创建后，可解锁二维码兑换奶茶免单卡一张",
  unavailable: "暂不符合领取条件",
  outOfStock: "今日活动码已领完，请明日再来",
  inactive: "活动已不可领取",
  confirming: "活动火爆，正在确认领取结果，请稍后重试",
  claimed: "打开手机淘宝扫一扫，领取奶茶免单卡一张"
}
```

### 状态映射逻辑

```javascript
// vt(e) — campaign 状态 → UI 状态
"claimed"           → {status: "confirming"}
"expired" / endsAt  → {status: "inactive"}
"claimable"         → {status: "claimable"}
REDEMPTION_CODE_OUT_OF_STOCK → {status: "outOfStock"}
ACHIEVEMENT_NOT_COMPLETED / !achievementCompleted → {status: "locked"}
其他                → {status: "unavailable"}
```

### 关键函数

| offset | 功能 |
|---|---|
| 242992 | 奶茶文案定义 `st` |
| 247340 | `ht(e)` — 判断 `benefitKind === "REDEMPTION_CODE"` |
| 247631 | `vt(e)` — campaign 状态 → UI 状态映射 |
| 252547 | `qt(e,t,n)` — API 请求封装 |
| 260597 | campaigns fetch + 渲染 |
| 261675 | claim POST |
| 261897 | reward GET |

## 5. 签到线程设计

### 每日 100 Credits

- 启动时立即签一次 → 之后每小时检查跨日 → 跨了就签
- daemon 线程，随进程退出
- 签到前查 `claimStatus`，只领 `CLAIMABLE` 的活动

### 奶茶免单卡抢领

- **精准定时**：计算到 10:00:00 (UTC+8) 的等待时间，`time.sleep` 到点
- **快速重试**：100ms 间隔，持续 30 秒（~300 次尝试）
- 遇到 `REDEMPTION_CODE_OUT_OF_STOCK` 继续重试（码可能在 10:00:00.001 才放出）
- 遇到 429 限流等 1 秒
- 其他错误立即返回
- daemon 线程，每分钟检查是否到 10:00

## 6. 网关端点

| 方法 | 路径 | 功能 |
|---|---|---|
| POST | `/benefit/claim` | 立即签到（100 Credits） |
| POST | `/benefit/coffee` | 立即抢领奶茶免单卡 |
| GET | `/benefit/usage` | 查 Credits 用量 |

## 7. 成就 API

```
GET /sash/api/v1/me/achievements
```

返回用户已完成的成就。实测返回 `desktop_pet_first_use`（2026-10-03）。`sites_first_use` 成就在 achievements API 中未返回，但 campaigns API 中 `achievementCompleted: true` 表明服务端已记录站点创建完成。
