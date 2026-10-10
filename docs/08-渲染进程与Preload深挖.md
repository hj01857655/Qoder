# 08 · 渲染进程与 Preload 深挖

取证：`evidence/01-observe/out-renderer/`、`out-preload/`。2026-10-04。

## 1. assets 构成

| 类型 | 数量 | 体积 |
|---|---|---|
| `.js` | 535 | 42.1 MB |
| `.webp` | 410 | 15.4 MB |
| `.woff` / `.woff2` / `.ttf` | 59 / 57 / 20 | 2.2 MB |
| `.svg` | 31 | 4.2 MB |
| `.wav` | 4 | 1.5 MB |
| `.mp4` | 1 | 8.2 MB（登录动画）|
| `.css` | 1 | 0.5 MB |

**图片全部 webp**（410 个）——说明构建期做了格式转换。

## 2. Preload：两个超大运行时

之前只关注了主进程，preload 里有两个此前未分析的大文件：

| 文件 | 体积 | 性质 |
|---|---|---|
| `pluginViewDiagramRuntime.cjs` | **3.37 MB** | 图表渲染运行时 |
| `pluginViewRuntime.cjs` | **2.51 MB** | 插件视图运行时 |
| `index.cjs` | 113.8 KB | 主 preload |

**合计 5.9 MB，是真正的插件 UI 宿主**。

### 2.1 图表运行时（3.37 MB）

| 库 | 命中 | 作用 |
|---|---|---|
| **mermaid** | 66 | 文本转图（主力）|
| **cytoscape** | 15 | 交互式图谱 |
| **dagre** | 15 | 有向图布局 |
| **klay** | 5 | 分层布局 |

即 **Mermaid 负责"画"，dagre/klay 负责"排"，cytoscape 负责"交互"**。

### 2.2 插件视图运行时（2.51 MB）

| 库 | 命中 | 说明 |
|---|---|---|
| **ace** | **715** | **Ace 编辑器**（代码编辑核心）|
| **lit** | 343 | Web Components（轻量组件）|
| react | 135 | React 渲染 |
| vue | 39 | Vue 兼容 |
| mermaid | 35 | 图表 |
| marked | 34 | Markdown |
| jest / prism | 33 / 3 | 测试与语法高亮 |

**三栈共存**（Ace + Lit + React/Vue）——说明插件视图**不限定技术栈**，通过 Ace 做代码块渲染，Lit 做宿主组件，React/Vue 渲染插件自身产物。

## 3. 沙箱与隔离

### 3.1 Preload 侧关键字计数

| 关键字 | 次数 |
|---|---|
| `origin` | 166 |
| `postMessage` | 25 |
| `sandbox` | 14 |
| `Worker(` | 11 |
| `iframe` | 6 |
| `new Function` | 2 |

### 3.2 主进程窗口配置

完整 `webPreferences` 对象（实际提取）：

```javascript
{
  preload: e.content.preloadPath,
  contextIsolation: true,          // ✅ 上下文隔离
  nodeIntegration: false,          // ✅ Node 未暴露
  sandbox: true,                   // ✅ 沙箱
  backgroundThrottling: false,
  webSecurity: true,               // ✅ 同源策略
  allowRunningInsecureContent: false,
  spellcheck: true,
  zoomFactor: 1,
  devTools: e.developerToolsEnabled
}
```

全文件出现次数与取值（脚本 `scripts/check_webpref.js` 核验）：

| 键 | 取值 | 次数 |
|---|---|---|
| `contextIsolation` | `true` | 6 |
| `nodeIntegration` | `false` | 6 |
| `sandbox` | `true` | 7 |
| `webSecurity` | `true` | 3 |
| `allowRunningInsecureContent` | `false` | 3 |
| `spellcheck` | `true` | 2 |

**多次出现且取值一致**，说明主窗口、子窗口、插件视图**统一采用这套安全配置**——
不是个别窗口配置，是全局基线。

> `devTools` 由 `e.developerToolsEnabled` 动态控制，是唯一可配置项。
> `nodeIntegrationInWorker` / `nodeIntegrationInSubFrames` / `webviewTag` / `experimentalFeatures` **均未出现**，即全部走默认（不开启）。

### 3.3 通信模型

```javascript
// preload 与插件视图间
postMessage(...)            // 25 处
addEventListener(...)       // 241 处
type:                       // 276 处
action:                     // 42 处
```

插件视图通过 **`{type, action, ...}` 消息协议**与宿主通信（`postMessage` + `addEventListener` 组合），
而非直接调用——**这是进程隔离下的标准做法**。

配合 `origin` 检查（166 处）防止消息伪造。

## 4. 未开封的部分

| 项 | 原因 |
|---|---|
| 路由表 | `path:"/"` 仅一处，路由定义**未字符串化**（动态构造或已被 Vite 内联）|
| IPC 通道名 | `.invoke("...")` / `.handle("...")` 在渲染进程仅命中 `Ready` —— **压缩后拼接**，无法直接提取 |
| 状态管理 | 未识别（可能是 zustand/redux 但无明显特征）|

渲染进程因高度压缩（单文件 19.81 MB），**静态提取难度显著高于主进程**——
主进程至少保留了 operation/schema 字面量，而渲染进程几乎全是混淆后的标识符。

若要分析渲染进程，**运行时断点比静态扫描有效**（`list_scripts` + `search_in_sources` 已在 wangyiyun 验证过这套流程）。

## 5. 结论：插件视图是完整沙箱

综合 preload 与主进程配置：

```
插件 HTML/JS  →  iframe(sandbox)      ← 完全沙箱，无 Node
              →  postMessage 协议     ← 唯一通信通道
              →  origin 校验           ← 防伪造
              →  preload 注入能力      ← 受控暴露
              →  Ace/Lit/React/Vue 渲染 ← 多栈支持
```

**这是一套设计良好的插件 UI 隔离机制**——与 `docs/04 §7` 记录的后端侧安全措施
（制品校验、路径逃逸防护、凭证绑定）形成前后端一致的纵深防御。