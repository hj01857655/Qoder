# 07 · 响应 `data` 内部 Schema（领域模型）

工具：`scripts/parse_response.js`；产物：`evidence/01-observe/response-data-schema.json`。2026-10-04。

## 1. 问题：Response 是泛型信封

上一轮发现所有 Response 只还原出信封：

```json
{ "code": "ok", "message": "", "success": true }
```

但校验函数里 `data` 和 `requestId` 是 **required**，说明字面量不完整。

追查发现 `data` 的校验是**注入的**：

```javascript
// envelope 校验器
if (t.data !== void 0) {
  vr(t.data, { instancePath: e + "/data", parentData: t, parentDataProperty: "data", rootData: n })
}
```

**`vr` 才是真正的 data schema。** 于是有了二级追踪：`Response类型 → 标识符 → 信封函数 → data 校验函数 → 字段`。

## 2. 突破：信封与数据 schema 分离

对比同一个 IssueResponse：

| 层 | 字段 |
|---|---|
| **信封**（所有 Response 共有）| `code` `message` `success` `data` `requestId` |
| **data**（各自不同）| 26 个领域字段 |

**修正上一轮的判断**：`literal+fn` 合并后信封字段已补全（5/5 required），
但 `data` 是**泛型注入**的，必须单独追一层——这就是当时"95% 覆盖率"是假象的原因。

## 3. 提取结果

响应类型 59 个，**成功提取 data schema 18 个**，覆盖全部核心领域对象：

| 类型 | 字段数 | required |
|---|---|---|
| `IssueResponse` | 26 | 22 |
| `RuntimeMessageResponse` | 18 | 23 |
| `ProjectResponse` | 18 | 9 |
| `ProjectTeamAPIProjectTeamResponse` | 17 | 19 |
| `DiscussionTeamAPIDiscussionTeamResponse` | 17 | 19 |
| `MemberAPIAgentMemberResponse` | 19 | 16 |
| `DiscussionResponse` | 14 | 10 |
| `FileCreatedResponse` | 13 | 10 |
| `TeamAPITeamProfileResponse` | 15 | 16 |
| `DiscussionInvitationAcceptanceResponse` | 7 | 7 |
| `NotificationResponse` | 7 | 7 |
| `UserResponse` | 7 | 7 |
| `AgentWorkspaceConfigResponse` | 2 | 2 |
| `RuntimeAgentWorkspacesResponse` | 5 | 5 |
| 其余 4 个 | 3–4 | 3–4 |

## 4. 完整领域模型

### ProjectResponse

```
id: uuid                     ownerProjectUserId: uuid
name: string                 description: string
status: string               memberCapacity: int32
createdByUserId: string      createdAt/updatedAt/archivedAt/deletedAt: date-time
version
config:
  identifier          coverIconId
  repositoryUrl       coverPath
  localFolderPath
```

`config.localFolderPath` + `repositoryUrl` 说明项目绑定本地目录与 Git 远端。

### DiscussionResponse

```
id: uuid                     projectId: uuid
title: string                description: string
status: string               currentMemberRole: string
memberCapacity: int32        lastMessageSeq
issues: array                createdAt/updatedAt/archivedAt/deletedAt: date-time
createdByUserId: string
```

`lastMessageSeq` = 消息序号游标，配合 `messages/query` 做增量拉取。
`issues: array` 说明讨论可关联 Issue。

### IssueResponse（26 字段，最完整）

```
id: uuid                     projectId: uuid
title                        contents
status                       workflowStatus
priority                     labels: array
reactions: array             version

assigneeProjectUserId: uuid      assigneeProjectAgentId: uuid
assigneeUser: object
  ├─ projectUserId
  ├─ userId
  └─ user
assigneeAgent: object
  ├─ projectAgentId
  └─ agentProfile
       ├─ id
       ├─ name
       └─ avatarUrl

createdByProjectUserId: uuid  createdByUserId
createdAt/updatedAt/archivedAt/deletedAt: date-time
emoji
```

**关键设计**：`assigneeUser` 与 `assigneeAgent` 是**对称的联合结构**——
同一个 Issue 可由人或 Agent 承接，这就是「human/agent/team 并列成员」的具体实现。

## 5. 类型系统信息

还原出的原生类型标注：

| 标注 | 含义 |
|---|---|
| `uuid` | RFC 4122 |
| `date-time` | ISO 8601 |
| `int32` | 32 位整数（`memberCapacity`）|
| `string` / `boolean` | 基础类型 |
| `object` / `array` | 复合 |

**ID 体系统一用 uuid**，跨 Project / Discussion / Issue / Member 全部一致。

## 6. 解析方法

```javascript
// 二级追踪
ResponseType --映射表--> 标识符 --var赋值--> 信封函数
     |
     +-- 函数体内匹配:  FN(t.data, {instancePath: e + "/data", ...
                          └--> data 校验函数 --> 提取字段
```

### 字段提取点

| 来源 | 模式 |
|---|---|
| 字段名 | `instancePath: e + "/x/y"` → 嵌套路径 `x.y` |
| 允许字段 | `l === "x"` / `E === "x"` / `h === "x"` |
| required | `t.x === void 0 && (y = "x")` |
| 类型 | `schemaPath:"#/properties/x/type", params:{type:"T"}` |
| 格式 | `schemaPath:"#/properties/x/format", params:{format:"uuid"}` |

**`instancePath` 字符串是最可靠的字段来源**——它天然携带嵌套路径，
如 `e+"/assigneeAgent/agentProfile/avatarUrl"` 直接给出 `assigneeAgent.agentProfile.avatarUrl`。

## 7. 未覆盖 41 个响应类型的原因

| 原因 | 说明 |
|---|---|
| data 为标量 | 如 `AgentWorkspaceConfigResponse` 只有 `workspaces` + `version` |
| data 为数组 | 校验器走 `Array.isArray` 分支，非对象 schema |
| data 无独立校验 | 直接 `any`/透传 |
| 纯分页包装 | `MessageAPIMessageHistoryPage` 一类 |

**这些都是次要对象**，核心实体已全部覆盖。

## 8. 产物

`response-data-schema.json`：

```json
{
  "IssueResponse": {
    "envelopeFn": "vQ",
    "dataFn": "vr",
    "envelopeFields": ["code","message","success","data","requestId"],
    "required": ["id","projectId","title", ...],
    "fields": {
      "id":                    { "path": ["id"], "type": "string", "format": "uuid" },
      "assigneeAgent.agentProfile.avatarUrl": { "path": ["assigneeAgent","agentProfile","avatarUrl"] },
      ...
    }
  }
}
```