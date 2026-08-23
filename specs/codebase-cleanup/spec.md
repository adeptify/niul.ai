# 牛来代码边界整理

## 背景与目标

牛群功能接入后，产品行为已经达到内部完整，但部分实现仍沿用单文件增长方式：

- `electron/main.js` 同时拥有应用生命周期、扫描 Worker、鼠标穿透、窗口拖动、通知、托盘和 IPC 注册。
- `renderer/app.js` 同时包含正式运行逻辑、Session 展示纯函数和浏览器预览假数据。
- 牛群专属样式附着在 4500 多行的通用样式文件末尾。
- 样式中仍有已经没有 DOM 或 JavaScript 消费方的旧选择器。
- QA 启动参数和正式启动共用同一环境变量入口，测试实例容易被误当成用户配置启动。

本轮完成等级为“内部完整的行为保持型重构”：正式功能、配置和用户数据不变；模块责任、调用链和测试入口更单一；整理后的应用可继续内部长期试用。

## 当前证据

- 基线 `npm test` 为 160/160 通过。
- 最大实现文件为 `renderer/styles.css` 4597 行、`renderer/app.js` 2990 行、`electron/scan.js` 1278 行。
- `main.js` 直接维护窗口拖动与穿透的 5 组可变状态，并直接处理对应 IPC。
- `app.js` 内嵌 `PREVIEW_CONFIG`、Session/市场预览快照和假 API，正式入口必须穿过演示数据定义。
- `status-overview`、`status-dot`、`session-title`、`scale-settings` 四组 CSS 类在当前 HTML 和 JavaScript 中均无消费者。
- 最近一次 QA 使用 `NIULAI_HERD_MODE=1` 启动后被误留给用户，证明 QA/正式启动边界需要显式隔离。

## 保留、替换、忽略

### 保留

- 现有 UI、文案、交互、配置格式、牛群 Actor 契约、扫描结果和外部 IPC 名称。
- 单宠/牛群切换、鼠标穿透、窗口拖动、Session 聚焦、牛记与大盘行为。
- `scan.js` 当前 Runtime 检测边界：其解析器共享日志、进程和状态推断语义，本轮不按 Runtime 人为拆散。
- 本地 `artifacts/` QA 截图，不读取业务内容、不删除、不提交。

### 替换

- 用独立窗口交互控制器替换 `main.js` 中分散的拖动和穿透状态。
- 用独立 Session 扫描客户端替换 `main.js` 中分散的 Worker、并发请求和可信快照恢复状态。
- 用独立 QA 启动参数解析器替换主进程直接读取牛群测试变量；只有 `NIULAI_QA=1` 时测试覆盖才生效。
- 用共享的安全文件访问/遍历底座替换 `scan.js`、`tokens.js` 和 `config.js` 中重复的容错实现，同时保留各自深度与数量上限。
- 用可独立单测的 Session 展示模块替换 `app.js` 内的展示纯函数。
- 用独立预览数据/API 模块替换 `app.js` 内的演示假数据。
- 用共享牛群挂载配置消除预览牛群和真实牛群的重复回调接线。
- 把牛群专属 CSS 移入独立样式包，并删除已确认无消费者的旧规则。

### 忽略

- 不改变产品功能、视觉方案、文案语气、配置字段或 README。
- 不引入框架、打包器、状态库、lint 依赖或新的运行时依赖。
- 不为了文件变小而拆散 `scan.js`、`tokens.js` 的内聚解析流程。
- 不制作 DMG/ZIP，不调整签名或发布版本号。

## 模块与调用链

### 主进程

```text
renderer IPC
  -> electron/main.js（只负责注册与编排）
  -> window-interactions.js（穿透、交互区域、拖动状态）
  -> window-position.js / pointer-regions.js（纯计算）
  -> BrowserWindow / screen
```

`window-interactions.js` 对外只暴露意图方法：设置交互区域、请求穿透、刷新穿透、开始/移动/结束拖动、查询是否拖动和窗口关闭复位。原生窗口异常只在这一层处理。

```text
process.env
  -> launch-options.js
  -> main.js createWindow query
```

QA 参数必须有显式总开关；普通启动永远只服从保存配置。

```text
renderer scan IPC / 后台定时器
  -> session-scanner.js（单飞请求、Worker 生命周期、可信快照）
  -> scan-worker.js
  -> scan.js + tokens.js
  -> files.js（统一容错文件访问与有界遍历）
```

### 渲染进程

```text
session-view.js（纯展示契约）
  -> app.js（DOM 编排）

preview-api.js（仅浏览器预览数据与假 IPC）
  -> app.js 在 window.niulai 缺失时使用

herd-mode.js + herd-runtime.js（Actor 数据）
  -> herd-preview.js（单一群体视图控制器）
  -> app.js（真实/预览两种装配）
```

`app.js` 仍是页面编排入口，但不再定义跨场景纯函数和大段假数据。

### 样式

`styles.css` 保留通用桌宠、气泡、设置和市场样式；`herd.css` 只拥有 `data-herd-*` 与 `.herd-*` 规则，并在通用样式之后加载以保持层叠顺序。

## 输入输出与兼容性

- IPC channel 名称与 preload API 不变。
- `window-interactions` 只接受普通坐标/矩形对象，非法输入被忽略；BrowserWindow 拒绝某一帧时结束当前拖动，不抛到应用顶层。
- Session 展示模块输入仍为现有 row；输出字符串与当前快照完全一致。
- 预览 API 返回结构保持和 Electron preload API 对齐。
- `NIULAI_HERD_PREVIEW`、`NIULAI_HERD_MODE`、`NIULAI_HERD_COUNT` 只在同时设置 `NIULAI_QA=1` 时生效。

## 验收标准

1. `electron/main.js` 不再直接保存拖动/穿透内部状态，也不直接计算窗口坐标。
2. 穿透与拖动控制器有覆盖正常拖动、非法帧、原生拒绝、拖动期间禁止穿透和复位的单元测试。
3. 扫描客户端有覆盖并发单飞、成功快照、失败恢复、首次失败和停止 Worker 的单元测试。
4. 普通启动忽略 QA 牛群环境变量；显式 QA 启动仍支持 1/8/34 牛。
5. Session 展示测试直接调用模块导出，不再从 `app.js` 文本截取函数执行。
6. `app.js` 不再内嵌预览配置、快照和假 IPC 实现；预览模式行为不变。
7. 预览与真实牛群共享一套基础回调装配，差异只保留在各自覆盖项。
8. 牛群样式独立加载，已确认无消费者的旧 CSS 规则被删除。
9. 文件遍历的失败容错、深度和数量边界有直接单元测试；扫描与 Token 现有回归继续全绿。
10. `node --check` 覆盖所有 JavaScript；`npm test` 全绿；`npm run pack` 成功。
11. 真实 Electron smoke 覆盖正常配置启动、显式 34 牛 QA 启动、群拖、Session 点击高亮和鼠标穿透，无未捕获异常。

## 风险与处理

- 纯脚本通过 HTML 顺序共享全局：新增模块必须在 `app.js` 前加载，并保留 CommonJS 导出供测试使用。
- CSS 分包可能改变层叠：只按原文件连续边界搬移，保持加载顺序，不重排规则。
- 主进程控制器可能改变穿透时序：保留原 16ms 防护刷新和首次 260ms 交互期，由真实 Electron 验证。
- QA 门禁改变内部启动命令：所有验收命令明确加 `NIULAI_QA=1`，正式用户不受测试变量污染。

## 验收结果（2026-08-24）

- 通过：全部 JavaScript 已执行 `node --check`。
- 通过：`npm test`，176/176。
- 通过：`npm run pack`，产物为 `dist/mac-arm64/牛来.app`；本轮仍按非目标不制作 DMG/ZIP、不签名。
- 通过：普通安装包在只残留 `NIULAI_HERD_MODE=1`、没有 `NIULAI_QA=1` 时启动为单宠；保存配置未被覆盖。
- 通过：普通实例首次可交互约 220ms，穿透 ready，单宠拖动结束，无渲染或主进程异常。
- 通过：显式 `NIULAI_QA=1 NIULAI_HERD_PREVIEW=1 NIULAI_HERD_COUNT=34` 实例显示并完成 34/34 Actor，独立 `herd.css` 已加载。
- 通过：点击 Session 牛后精确高亮 `preview-cursor`，群拖结束，Actor 仍为 34，无渲染或主进程异常。
- 通过：静态死代码复核没有发现只定义不消费的顶层函数；剩余启发式 CSS 命中均为运行期拼接的状态类或字体名，不删除。
- 通过：QA 实例已关闭，最后重新打开的是不带测试环境变量的正常安装包。
