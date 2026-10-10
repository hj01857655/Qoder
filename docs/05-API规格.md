# 05 · API 规格（静态解析）

工具：`scripts/parse_api.js`；产物：`evidence/01-observe/api-spec.json`。2026-10-04。

## 1. 重大发现：bundle 内嵌完整 operation 定义

主进程 bundle 里**内嵌了一份 API 描述表**，结构为：

```javascript
const Xst = {
  setIssueReaction: {
    path: "/api/v1/collaboration/projects/{projectId}/issues/{issueId}/reactions",
    method: "PATCH",
    requiredHeaders: [],
    bodySchema: "SetIssueReaction",
    responses: { 200: "IssueResponse" }
  },
  // ...
};
```

**这不是路径字符串，而是带方法/请求体类型/响应类型的规格声明。**

### 解析结果

| 指标 | 数量 |
|---|---|
| operation 总数 | **154** |
| 唯一 `method + path` | 150 |
| 成功提取 operation 名 | **154 / 154** |
| 带 `bodySchema` | 51 |
| 带 `responses` | 绝大多数 |

### 方法分布

| 方法 | 数量 |
|---|---|
| GET | 63 |
| POST | 41 |
| PATCH | 18 |
| DELETE | 18 |
| PUT | 14 |

**一致性校验通过**：63 个 GET 接口中，**0 个带 `bodySchema`**——符合 REST 规范，说明解析未串位。

## 2. 解析方法与踩坑

结构化提取优于正则猜测。三个关键点：

| 坑 | 现象 | 修正 |
|---|---|---|
| 游标越界 | `i0+6` 落在值首字符，`indexOf('"',i)` 找到下一个引号，path 变超长 | 用 `vStart = i0 + 6` 显式定位 |
| **抓错括号** | `indexOf('{', pEnd)` 抓到**内部 `responses:{`** 而非外层对象，导致 156 条全部匹配不到 method | 改用 `lastIndexOf('{', i0)` **向前**取外层 `{` |
| 名字提取 | `src[i0-1]` 是 `{` 不是 `:`，跳过条件写错 | 同时跳过 `{` `:` 空格 逗号 |

> 第二条曾让脚本输出 0 条——**向前取括号**是这类嵌套字面量解析的关键。

## 3. 领域模型（由响应类型反推）

响应类型分布最能反映后端领域划分：

| 次数 | 响应类型 | 领域 |
|---|---|---|
| 9 | `IssueResponse` | **Issue（工单）** |
| 6 | `ProjectResponse` | Project |
| 6 | `AgentWorkspaceConfigResponse` | Agent 工作区配置 |
| 6 | `DiscussionResponse` | Discussion |
| 5 | `DiscussionInvitationResponse` | 邀请 |
| 5 | `ProjectTeamAPIProjectTeamResponse` | 项目团队 |
| 5 | `TeamAPITeamProfileResponse` | 团队档案 |
| 4 | `ProjectAgentMembershipResponse` | Agent 成员关系 |
| 4 | `FileCreatedResponse` | 文件 |
| 3 | `CurrentAgentProfileResponse` | 当前 Agent |
| 2 | `MessageAPIMessageHistoryPage` | 消息分页 |
| 2 | `MessageAPIMessageConfirmationResponse` | 消息确认 |
| 2 | `ProjectAgentPolicyResponse` | Agent 策略 |

**结论：Qoder 后端是一套「项目 → Issue → Agent 执行」的协作系统**，
Agent（`agent-*`）是一等公民，与 human/team 并列作为成员（`members/{kind}/{memberId}`）。

## 4. operation 命名规范（可反推语义）

| 前缀 | 语义 | 例 |
|---|---|---|
| `get*` | 读 | `getCurrentAgentProfile` |
| `list*` | 列表 | `listDiscussionMessages` |
| `query*` | 复杂查询（有 body）| `queryDiscussionMessages` |
| `create*` / `send*` | 写/发| `createProjectInvitation`、`sendDiscussionMessage` |
| `replace*` | 全量替换（PUT）| `replaceAgentProfileAvatar` |
| `update*` / `set*` | 局部更新（PATCH）| `updateAgentProfileInvocationPolicy`、`setIssueReaction` |
| `accept*` / `revoke*` | 状态流转 | `acceptDiscussionInvitation` |
| `ensure*` | 幂等创建 | `ensureCurrentAgentProfile` |

**`query*` 一律带 body**（复杂查询走 POST），`get*`/`list*` 不带 —— 命名与 schema 严格对应。

## 5. 完整 operation 清单

`evidence/01-observe/api-spec.json`，结构：

```json
{
  "name": "setIssueReaction",
  "path": "/api/v1/collaboration/projects/{projectId}/issues/{issueId}/reactions",
  "method": "PATCH",
  "bodySchema": "SetIssueReaction",
  "requiredHeaders": "",
  "responses": ["200=IssueResponse"]
}
```

抽样：

| method | op | path | body | responses |
|---|---|---|---|---|
| PATCH | `setIssueReaction` | `…/issues/{issueId}/reactions` | `SetIssueReaction` | 200=IssueResponse |
| POST | `queryAgentMemberships` | `…/agent-memberships/query` | `AgentMembershipQuery` | 200=…QueryResponse |
| GET | `getCurrentAgentProfile` | `…/agent-profiles/current` | — | 200=…ProfileResponse |
| PUT | `ensureCurrentAgentProfile` | `…/agent-profiles/current` | `EnsureCurrentAgentProfile` | 200/201=… |
| GET | `getAgentProfileAvatar` | `…/{profileId}/avatar` | — | 200=AgentAvatarResponse |
| PUT | `replaceAgentProfileAvatar` | `…/{profileId}/avatar` | `ReplaceAgentAvatarRequest` | 200=AgentAvatarResponse |
| PATCH | `updateAgentProfileInvocationPolicy` | `…/{profileId}/invocation-policy` | `ProfileInvocationPolicyUpdate` | 200=…PolicyResponse |
| GET | `getAgentProfileWorkspaces` | `…/{profileId}/workspaces` | — | 200=AgentWorkspaceConfigResponse |
| PUT | `replaceAgentProfileWorkspaces` | `…/{profileId}/workspaces` | `ReplaceAgentWorkspaces` | 200=…ConfigResponse |
| GET | `listDiscussionMessages` | `…/discussions/{id}/messages` | — | 200=MessageAPIMessageHistoryPage |
| POST | `sendDiscussionMessage` | `…/discussions/{id}/messages` | `MessageAPISendMessage` | 201=…ConfirmationResponse |
| POST | `queryDiscussionMessages` | `…/discussions/{id}/messages/query` | `MessageAPIQueryMessages` | 200=…QueryResponse |
| PATCH | `setDiscussionMessageKeyMark` | `…/messages/{messageId}/key-mark` | — | 200=… |

## 6. 请求体类型清单（51 个）

`bodySchema` 命名即领域实体，按前缀归类：

| 前缀 | 数量 | 领域 |
|---|---|---|
| `Message*` | 3+ | 消息（Send / Query / KeyMark）|
| `*Issue*` | 若干 | 工单（SetIssueReaction 等）|
| `*Agent*` | 若干 | Agent 档案/策略/工作区/头像 |
| `*Project*` | 若干 | 项目与邀请 |
| `*Discussion*` | 若干 | 讨论与成员 |
| `*File*` | 若干 | 文件上传/元数据 |

**注意**：schema **只有类型名，没有字段定义**。字段级schema 在服务端或未打进 bundle。

## 7. 已确认 / 待补

| 项 | 状态 |
|---|---|
| 路径 | ✅ 154 operation |
| HTTP 方法 | ✅ 精确 |
| 请求体**类型名** | ✅ 51 个 |
| 响应**类型名** | ✅ |
| 请求体**字段** | ✅ 38/41，见 [06-字段级Schema](06-字段级Schema.md) |
| 响应**字段** | ✅ 18 个核心实体，见 [07-响应Schema与领域模型](07-响应Schema与领域模型.md) |
| base URL 运行时取值 | ✅ 见 [01-API与鉴权](01-API与鉴权.md) §1 + [11-CLI协议与直接API](11-CLI协议与直接API.md) §3 |
| 实际连通性 | ✅ 见 [11-CLI协议与直接API](11-CLI协议与直接API.md) §8 实测矩阵 |

## 8. 若需补全字段

三条路：

1. **抓包**——MCP 已就绪（`--browserUrl` 连 Chrome），在 Qoder 里实际操作，抓真实请求体/响应
2. **查服务端 OpenAPI**——`/api/v1/version`、`qcs/config` 可能暴露 schema 端点
3. **渲染进程**——19.81 MB bundle 里可能有 TypeScript 类型定义（`interface`/`type` 声明）