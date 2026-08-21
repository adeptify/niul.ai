# 牛来 A 版视觉刷新实施计划

> 实现者：Grok Build。复审与验收：Codex。工作目录仅限 `/Users/oreal/adeptify-home/worktrees/niul.ai/visual-refresh-a`。

## 任务 1：先建立会失败的结构契约

文件：

- 新增 `test/visual-layout.test.js`
- 只读 `renderer/index.html`
- 只读 `renderer/styles.css`
- 只读 `renderer/app.js`

步骤：

1. 用 Node 内置测试读取三份 renderer 文件。
2. 断言顶栏六个按钮顺序为 `toggleBubble`、`rollCow`、`memoButton`、`marketButton`、`gear`、`petMenuButton`。
3. 断言牛记与大盘都位于 `.bubble` 内并具备 overlay 结构；开关键菜单在退出项之前含主题切换项。
4. 断言四态状态栏只有 working、waiting、idle、offline，且支持 `aria-pressed`。
5. 更新 Session 契约：第一行项目名 + 工作摘要，第二行路径 + `Agent · 时间`；箭头是独立末列，Agent 不再使用胶囊标签。
6. 更新统一工作区契约：牛记、大盘、设置都在 `.bubble` 内，设置不再是 `dialog`；三者共用工作区结构和关闭逻辑。
7. 增加布局契约：448px 外壳、52px 顶栏、紧凑 Session、大盘两列、设置可读字号和 108px 左导航。
8. 主题函数继续保存和恢复外观。
9. 运行 `node --test test/visual-layout.test.js`，确认在改产品代码前真实失败，并记录失败摘要。

## 任务 2：重排 HTML 和交互状态

文件：

- 修改 `renderer/index.html`
- 修改 `renderer/app.js`

步骤：

1. 按合同重排顶栏，增加大盘按钮与“刚刚巡视”，不改变现有按钮行为。
2. 把现有四态汇总改为可点击筛选；默认筛选 waiting，保留所有四态计数。
3. 将牛记、大盘、设置改成位于 `.bubble` 内、覆盖顶栏下方主页内容的同层工作区；设置移出独立 `dialog`，不再调用 `showModal()`。
4. 建立统一工作区状态函数，保证牛记、大盘、设置、开关键、折叠和 Escape 的打开/关闭逻辑一致；三个顶栏入口具备正确激活状态。
5. 把 Session 渲染改为最终两行结构：项目名 + 工作摘要 / 路径 + `Agent · 时间`；箭头独立，保留打开 Session 与可访问描述。
6. 设置继续使用三个 tab，原有设置字段全部保留，取消与保存行为不得退化。
7. 新增主题初始化、应用和切换函数，默认深色并写入 `localStorage`。
8. 运行结构契约测试，修到通过。

## 任务 3：实现 A 版视觉系统

文件：

- 修改 `renderer/styles.css`

步骤：

1. 建立深浅色语义变量，覆盖所有用户可见区域；不加载字体、不加依赖、不用渐变。
2. 直接修改既有 `/* A-version visual system */`，不得再追加第三层大块 override；可在本轮相关选择器中清理冲突声明。
3. 把气泡收至 448px、顶栏收至 52px，并按合同统一字号、按钮命中区、圆角和纵向节奏。
4. 实现安静四态状态栏：四态各自有颜色，只有 waiting 使用明显强调；四态文字与 Session 正文视觉量级平衡。
5. 实现 68-72px Session 单层卡片、左侧语义色竖线和最终两行网格；项目名与 `Agent · 时间` 优先可见，摘要与路径正确省略。
6. 将陪伴区压缩到约 44px，“我看着呢。”使用 16px；保留安静 Token 尾注。
7. 让牛记、大盘、设置共用同尺寸、同背景、同边界和同滚动模型的工作区；只在内容区内部滚动。
8. 大盘改成两列，现有 8 个指数显示为 4 行；按合同放大名称、点位与涨跌字号。
9. 设置左导航约 108px，“牛来”“Session 气泡”等主标签为 13px并置于滑杆上方，适配深浅外观。
10. 校验 360px 和桌面宽度的截断、间距、按钮命中区、折叠状态与面板切换。

## 任务 4：Grok 自检并交付候选实现

步骤：

1. 运行 `node --test test/visual-layout.test.js`。
2. 运行 `npm test`。
3. 运行 `npm run pack`。
4. 检查 `git diff --check` 与 `git status --short`。
5. 输出改动文件、RED 证据、测试/打包原始结论和已知风险。
6. 不 commit、不 push、不 merge。

## 任务 5：Codex 独立复审和产品实操

1. 独立检查完整 diff，重点审统一工作区互斥状态、事件重复绑定、设置字段遗漏、主题恢复、Session 空值与长文本、Agent 元信息固定对齐。
2. 独立重跑结构测试、全量测试、打包和 `git diff --check`。
3. 用最终打包 App 和隔离 userData 走真实界面，获取深色首页、浅色首页、牛记、大盘、设置、开关键、折叠和长 Session 截图；确认设置没有独立弹窗，三个工作区边界一致。
4. 与视觉真值逐项对照。若有明显偏差或 bug，退回 Grok 修正，再重复独立验收。
5. 最终只报告实际达到的层级；用户未确认前不声称用户验收通过。
