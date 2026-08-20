# Product

<!-- impeccable:product-schema 1 -->

## Platform

macOS desktop

## Users

在 macOS 上同时运行多个本地 AI Runtime、桌面客户端与 CLI Agent 的开发者。用户希望不切换窗口就能看见哪些 Session 正在工作、哪些已闲置，并快速回到对应工作目录。

## Product Purpose

牛来是一个始终置顶、可拖动的 macOS 桌宠。它扫描本机 AI Session，把工作中、等你、闲置、不在线四种状态、判定依据和工作目录集中在头顶气泡中，并通过牛的姿态和动作提供不打扰工作的环境反馈。

## Positioning

它不是传统监控面板：Session 状态同时驱动一个有生命感的角色。用户既能一眼读状态，也能通过拖动、单击和双击抚摸与桌宠互动。

## Operating Context

- 长时间停留在开发者桌面边缘并保持置顶。
- 与 Cursor、Claude Code / Desktop、Codex、Grok Build、Gemini CLI、OpenCode、Pi 等本地工具并行运行。
- 气泡由用户手动展开或收起；点击 Session 前置对应 Runtime 应用，项目名不能被误当成应用。
- 桌宠应保持低干扰，循环动作克制，并尊重系统的减少动态效果偏好。

## Capabilities and Constraints

- macOS 优先，Electron 透明无边框窗口。
- 四态：工作中、等你、闲置、不在线；有事件合同的 Runtime 必须事件优先，不能只靠统一 `mtime`。
- 今日 Token 只读取本机明确 usage 元数据；不按 prompt 或回复字数估算。
- Session 可按 Runtime 标签即时筛选；悬停行会驱动牛转身关注并播报状态。
- 状态筛选默认只看“工作中”，牛和 Session 气泡可独立缩放。
- 悬停 Session 时只驱动牛的注意方向与状态播报，不添加脱离原图身体结构的假肢。
- 快捷 Memo 保存在本机，可设置短时或次日提醒。
- Runtime 可在可视化设置里开关；自定义 Runtime 通过名称、Session 文件夹和可选进程名添加。
- 牛可拖动；单击切换气泡；双击触发抚摸反馈。
- 用户可 Roll 不同造型的牛；电源菜单提供收起、展开、隐藏与显式退出。
- 用户可关闭非必要碎嘴；主动发现的彩蛋必须可取消、不阻塞监控；哞拉松会出声，再连点五下可闭嘴。
- 运行期间可用 `⌘⇧U` 显示或隐藏；完整退出后从用户主目录的应用程序（`~/Applications/牛来.app`）或 Spotlight 重启。
- 动效必须解释状态或操作，不加入持续高强度装饰动画。
- 不上传 Session 内容；扫描和状态判断都留在本机。

## Brand Commitments

- 产品名为“牛来 / niul.ai”。
- 牛尽量保留电影《牛来》中短角、直立、黄色短绒身体、紫灰色口鼻与手脚、半眯方眼和业余手搓 3D 的辨识度；它是基于电影的二次创作（二创），不冒充官方素材。
- 角色气质笨拙、真诚、克制，不做精致光滑的通用卡通吉祥物。

## Evidence on Hand

- Runtime 扫描与状态判定：`electron/scan.js`
- 本机 Token 统计：`electron/tokens.js`
- 本地 Memo 与提醒：`electron/memos.js`
- macOS 跳转行为：`electron/focus.js`
- 用户提供的电影截图与据此生成的角色参考资产：`assets/niulai-canonical-v4.png`
- Runtime 证据与覆盖方案：`docs/runtime-monitoring.md`

## Product Principles

1. 一眼看懂状态，不要求用户阅读仪表盘。
2. 角色动作必须来自真实 Session 状态或用户操作。
3. 长时间陪伴但不抢注意力。
4. 本地优先，用户始终掌控扫描范围。
5. 保留“手搓牛”的性格，同时让操作界面达到生产可用水准。
6. 情绪价值来自“有一头笨拙的牛替你看着 Agent 干活”，不是无关的通用卖萌。

## Accessibility & Inclusion

支持键盘焦点、清晰状态文本与不依赖颜色的状态表达；在 `prefers-reduced-motion` 下停掉非必要循环并缩短状态过渡。
