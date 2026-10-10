# 06 · 字段级 Schema 还原

工具：`scripts/parse_schema.js`；产物：`evidence/01-observe/schema-fields.json`。2026-10-04。

## 1. 结论：字段定义**就在 bundle 里**，以 Zod 描述

上一轮说"只有类型名、没有字段"是错的。主进程 bundle 内嵌了**完整的 Zod 校验 schema**，只是压缩后形态特殊。

## 2. 三种存储形态

| 形态 | 结构 | 字段来源 |
|---|---|---|
| **A. 字面量** | `var Klt=pN,{properties:{emoji:{enum:[...]}},required:[],additionalProperties:!1}` | `properties` 字面量 |
| **B. 仅函数** | `var Jot=nh;function nh(t,{...}){ ...t.X===void 0&&(g="X")... !(h==="a"\|\|h==="b")... }` | 校验函数体 |
| **C. $defs 约束** | `schemaPath:"#/$defs/CreateFileRequest/properties/size/maximum",params:{limit:"5e7"}` | 校验路径串 |

### 覆盖来源分布（41 个请求体）

| 来源 | 数量 |
|---|---|
| A 字面量 | 16 |
| B 仅函数 | 21 |
| C $defs 约束 | 1 |
| **未覆盖** | **3** |

**合计还原 294 个类型**（远超 41 个请求体，含全部响应类型）。

**bodySchema 覆盖 38/41**。未覆盖：`AcceptDiscussionInvitation`、`AcceptProjectInvitationInput`、`RuntimeIssueCommentCreateBody`（形态特殊，量少）。

## 3. 还原样例

### CreateFileRequest（来源 C，含完整约束）

```json
{
  "clientUploadId": { "type": "string", "format": "uuid" },
  "fileName":       { "type": "string", "maxLength": { "limit": "255" },
                      "minLength": { "limit": "1" } },
  "size":           { "type": "integer", "maximum": { "comparison": "<=", "limit": "5e7" },
                      "minimum": { "comparison": ">=", "limit": "1" } }
}
```

**即：客户端侧校验 uuid 格式、文件名 1–255 字符、体积 ≤ 50 MB。**

### MessageAPISendMessage（来源 B，`strict=true`）

| 字段 | 类型 | 必填 |
|---|---|---|
| `clientMessageId` | string | ✅ |
| `contents` | （复合）| ✅ |
| `kind` | string | |
| `memberId` | string | |
| `discussionTeamId` | string | |
| `mentions` | array | |
| `replyToMessageId` | string | |

`strict=true` = **拒绝未声明字段**（`additionalProperties` 校验）。

### AssignIssueAgent

| 字段 | 类型 | 必填 |
|---|---|---|
| `projectAgentId` | string | ✅ |
| `instruction` | string | |

### SetIssueReaction

```json
{ "emoji": { "enum": ["👍","👌","❤️","✅","🎉","😕","🚀","👀"] } }
```

## 4. 关键发现：`strict` 普遍为真

抽查的类型中，`additionalProperties` 校验几乎都存在，即 **服务端 schema 是封闭的**——多传字段会被客户端直接拒绝。

这解释了为什么 API 面虽宽（154 operation），但实际调用参数受客户端强约束。

## 5. 解析踩坑记录（三处）

| 坑 | 现象 | 修正 |
|---|---|---|
| **括号配平过早闭合** | 函数体只截到 **73 字符**（正好是参数表 `(t,{instancePath:e="",...}={})`），字段全丢 | 先配平 `()` 得参数表结束位置，再从其后的 `{` 做花括号配平取**函数体** |
| 字面量与函数混杂 | 同一标识符既有字面量又有函数 | 先试 A，失败回落 B |
| `$defs` 参数嵌套 | `params:{comparison:"<=",limit:"5e7"}` 是对象 | 输出时做扁平化 |

第一条最隐蔽——**73 字符这个数字本身就暴露了"只抓到签名没抓到函数体"**。若不核对函数体长度，很容易误判为"该类型无 schema"。

## 6. 产物结构

`schema-fields.json`：

```json
{
  "MessageAPISendMessage": {
    "source": "fn",
    "ident": "CJ",
    "fn": "yh",
    "strict": true,
    "required": ["clientMessageId", "contents"],
    "fields": {
      "clientMessageId": { "name": "clientMessageId", "type": "string" },
      "contents": { "name": "contents" },
      "mentions": { "name": "mentions", "type": "array", "optional": true }
    }
  }
}
```

`source` 字段标明来源，便于回溯：`literal` / `fn` / `zod` / 组合形式。

## 7. 现状

| 项 | 状态 |
|---|---|
| 请求体字段 | ✅ 38/41 |
| 请求体约束（长度/范围/格式/enum）| ✅ |
| `required` / `strict` | ✅ |
| 响应体字段 | 🔴 仅类型名，字段在运行时对象里（`var Wlt=vQ,{properties:{code:{enum:["ok"]}...}}` 同样可提取，**未做**）|
| 嵌套对象内部字段 | 🔶 未递归展开 |

响应类型同样有 schema 字面量（已抽样确认 `IssueResponse` 含 `code:{enum:["ok"]}`），但**尚未批量提取**——这是下一步最直接的工作。