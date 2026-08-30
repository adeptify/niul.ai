---
name: 牛来
description: 为本地 AI Session 服务的桌面巡视工作区设计系统
colors:
  shell-ink: "#1c1a16"
  shell-raised: "#27241e"
  shell-bone: "#f3eee4"
  shell-muted: "#b7afa3"
  cattle-tag: "#d7a630"
  cattle-tag-bright: "#e8c46a"
  workspace-paper: "#eee4d4"
  workspace-paper-deep: "#e5d8c5"
  workspace-field: "#f8f1e5"
  workspace-text: "#241f18"
  workspace-muted: "#706657"
  light-paper: "#fffdf8"
  light-paper-deep: "#f3ecdf"
  light-field: "#fffaf2"
  working: "#78c59f"
  waiting: "#d4b05c"
  idle: "#8ab4e4"
  offline: "#9a9388"
  working-label: "#246747"
  waiting-label: "#6f5010"
  idle-label: "#315f8c"
  offline-label: "#554f47"
typography:
  headline:
    fontFamily: 'ui-rounded, ".SF NS Rounded", -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif'
    fontSize: "23px"
    fontWeight: 520
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: 'ui-rounded, ".SF NS Rounded", -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif'
    fontSize: "17px"
    fontWeight: 520
    lineHeight: 1.2
    letterSpacing: "normal"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", system-ui, sans-serif'
    fontSize: "12px"
    fontWeight: 450
    lineHeight: 1.35
    letterSpacing: "normal"
  label:
    fontFamily: 'ui-rounded, ".SF NS Rounded", -apple-system, BlinkMacSystemFont, "PingFang SC", system-ui, sans-serif'
    fontSize: "11px"
    fontWeight: 520
    lineHeight: 1.35
    letterSpacing: "0.01em"
  mono:
    fontFamily: 'ui-monospace, "SFMono-Regular", Menlo, monospace'
    fontSize: "10px"
    fontWeight: 450
    lineHeight: 1.35
    letterSpacing: "normal"
rounded:
  token: "6px"
  state: "8px"
  button: "9px"
  control: "10px"
  field: "11px"
  panel: "21px"
  shell: "22px"
  pill: "999px"
  round: "50%"
spacing:
  hair: "4px"
  tight: "6px"
  compact: "8px"
  control: "10px"
  rhythm: "12px"
  section: "16px"
  panel: "24px"
  workspace-edge: "26px"
components:
  workspace-shell:
    backgroundColor: "{colors.shell-ink}"
    textColor: "{colors.shell-bone}"
    rounded: "{rounded.shell}"
    width: "448px"
  workspace-shell-expanded:
    backgroundColor: "{colors.shell-ink}"
    textColor: "{colors.shell-bone}"
    rounded: "{rounded.shell}"
    width: "680px"
  header-icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.shell-muted}"
    rounded: "{rounded.control}"
    size: "34px"
  status-summary:
    backgroundColor: "transparent"
    textColor: "{colors.workspace-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "0 8px"
    height: "36px"
  session-state:
    textColor: "{colors.offline-label}"
    typography: "{typography.label}"
    rounded: "{rounded.state}"
    padding: "0 9px"
    height: "27px"
  session-row:
    backgroundColor: "transparent"
    textColor: "{colors.workspace-text}"
    typography: "{typography.body}"
    padding: "8px 24px 8px 26px"
    height: "59px"
  market-cell:
    backgroundColor: "{colors.workspace-paper}"
    textColor: "{colors.workspace-text}"
    typography: "{typography.body}"
    padding: "14px 15px"
    height: "112px"
  memo-field:
    backgroundColor: "{colors.workspace-field}"
    textColor: "{colors.workspace-text}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "13px 14px"
  reminder-chip:
    backgroundColor: "transparent"
    textColor: "{colors.workspace-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "0 10px"
    height: "30px"
  button-primary:
    backgroundColor: "{colors.workspace-text}"
    textColor: "{colors.workspace-paper}"
    typography: "{typography.label}"
    rounded: "{rounded.button}"
    padding: "0 13px"
    height: "34px"
---

# Design System: 牛来

## Overview

**Creative North Star: "The Field Ledger / 牧场巡视账簿"**

牛来是一套 Operate 模式的桌面工具界面：它把本地 AI Session 写成一张可以持续扫读的巡视账簿，让状态、工作摘要与回到 Runtime 的动作优先于装饰表达。视觉隐喻来自牲畜巡视牌、墨色外壳和暖纸账页；那头粗糙、笨拙的牛仍是最大的生命体，但工作区保持克制、清楚、适合长时间停留。

紧凑态和工作区不是两套界面。紧凑态保留头部、状态汇总和优先 Session 预览；展开后，同一个壳向左舒展并切换为 Session、大盘、牛记、额度或设置工作面。默认深色主题以深色壳包住暖纸内容面；浅色主题把壳与内容统一切换到全浅色材料。

**Key Characteristics:**
- Operate 优先：先读状态，再理解工作，再执行动作。
- 单壳多工作面，不在壳内继续叠放厚重的深色卡片。
- 紧凑但不拥挤；宽工作区把信息展开成可扫读的账簿。
- 暖纸、细分隔线、琥珀巡视牌和四种低饱和状态色共同建立性格。
- 动效只解释空间展开、工作面切换和操作反馈。

## Colors

色彩由墨色外壳、暖纸工作面、牛牌琥珀和四个状态色组成；浅色主题保留暖纸性格，但不保留深色壳。

### Primary
- **Cattle-tag Amber / 牛牌琥珀** (#d7a630)：用于工作区 kicker、关键悬停和键盘焦点，是巡视牌隐喻中稀少而明确的强调色。

### Secondary
- **Working Pasture Green / 工作绿** (#78c59f)：工作中状态的点色；对应深绿文字，保持暖纸上的对比。
- **Waiting Grain Amber / 等你琥珀** (#d4b05c)：等待用户介入的点色；对应棕金文字，并可用轻微底色提高优先级。
- **Idle Ledger Blue / 闲置蓝** (#8ab4e4)：闲置状态的点色；对应深蓝文字。
- **Offline Dust / 离线灰** (#9a9388)：不在线状态的点色；对应炭灰文字。

### Neutral
- **Ink Shell / 墨色壳** (#1c1a16)：默认主题的顶层壳、头部和外部控件背景。
- **Bone Type / 骨白字** (#f3eee4)：深色壳上的主文本；柔和骨白用于次级说明。
- **Warm Ledger Paper / 暖账纸** (#eee4d4)：默认主题的 Session 汇总、列表与所有工作面。
- **Warm Field / 暖纸输入面** (#f8f1e5)：输入框和需要轻微内陷感的局部区域。
- **Light Ledger Paper / 浅色账纸** (#fffdf8)：浅色主题中的统一壳与工作面材料。

### Named Rules
**The Two-Material Rule.** 默认主题只能由深色壳与暖纸工作面构成；浅色主题必须整体转为浅色，不能留下孤立的深色内层卡片。

**The Text-and-Dot Rule.** working、waiting、idle、offline 必须同时出现状态文字与圆点颜色；颜色承担快速扫描，文字承担无障碍识别。

## Typography

**Display Font:** 未使用独立展示字体
**Body Font:** macOS 系统正文栈（SF Pro Text / PingFang SC 回退）
**Label/Mono Font:** macOS Rounded 栈用于标题与标签；SFMono / Menlo 用于路径

**Character:** 圆体只负责品牌锁定、工作区标题、汇总和状态标签，给工具带来克制的陪伴感；正文仍用系统字体保证密集信息的速度，路径用等宽体与工作摘要区分。

### Hierarchy
- **Headline** (rounded stack, weight 520, 23px, line-height 1.2, letter-spacing -0.025em): 工作区标题与大盘、牛记、额度标题；承担工作面的第一层定位。
- **Title** (rounded stack, weight 520, 17px, line-height 1.2): 紧凑态陪伴标题，表达牛的当前判断而不压过 Session 信息。
- **Body** (system stack, weight 450, 12px, line-height 1.35): Session 名称、摘要、行情数字和表单内容；用于高密度扫读。
- **Label** (rounded stack, weight 520, 11px, line-height 1.35): 状态、kicker、时间、计数和按钮文案；小字号仍保留明确字重。
- **Mono** (SFMono / Menlo, weight 450, 10px, line-height 1.35): Session 路径，只在需要辨认目录时出现。

### Named Rules
**The Three-Voice Rule.** 圆体说“这是哪里和什么状态”，系统正文说“正在发生什么”，等宽体只说“它在哪个目录”。

## Layout

紧凑壳宽度为 448px，面向持续停留和快速查看；工作区打开时壳扩展到约 680px，外层角色容器最多 704px，并在现有窗口中从右向左生长。Session 全景使用 ledger 式横向行：左侧状态，中间并列身份与工作摘要，右侧是进入 Runtime 的方向提示。等待项只提高排序与轻微底色，不隐藏其他状态。

工作面共享同一宽度与头部逻辑。大盘在宽工作区固定为 4×2；牛记采用编辑区与最近记录左右分栏。视口不超过 520px 时，壳回到不超过 448px，大盘改为两列，Session 信息改单列堆叠，牛记改为上下结构；菜单栏壳始终限制为紧凑宽度。

间距以紧凑小步长组织：状态和控件内部使用 4–12px，内容节奏使用 16px，宽工作区边缘主要使用 24–26px。列表靠分隔线与留白分组，不靠独立卡片之间的大空隙。

### Named Rules
**The One-Shell Rule.** Session、大盘、牛记、额度与设置都在同一个壳内切换工作面；工作区展开不创建第二个浮层容器。

## Elevation & Depth

系统采用“外壳抬起、内部铺平”的混合深度。只有最外层气泡使用环境阴影与一像素边界，把桌面工具从透明窗口中托起；汇总、Session、行情和牛记通过纸张色差、细分隔线、悬停底色和输入面内陷感建立层级，内部工作面不使用投影。

### Shadow Vocabulary
- **Desktop Shell** (`box-shadow: 0 18px 48px rgba(16, 13, 10, 0.34), 0 3px 8px rgba(18, 14, 8, 0.22)`): 只用于气泡外壳。
- **Workspace Surfaces** (`box-shadow: none`): 所有展开工作面保持平铺。

### Named Rules
**The Flat-Within Rule.** 壳可以离开桌面，壳内的纸张不能彼此漂浮；内部层级由色调、边界和状态反馈表达。

## Shapes

形状语言以一个柔和圆角的外壳包住更克制的内部几何。外壳使用 22px 圆角，工作面下缘沿用 21px；图标控件使用 10px，按钮使用 9px，状态标签使用 8px，Memo 输入使用 11px。提醒预设使用胶囊形，状态点与扫描点保持正圆。Session 行和行情单元不做独立圆角卡片，它们服从整张账纸的连续边界。

## Components

### Workspace Shell
- **Character:** 一张从紧凑巡视牌舒展为工作账簿的单体壳。
- **Compact / Expanded:** 448px 常态与约 680px 工作区共享头部、圆角、材质和退出路径。
- **Motion:** 支持 View Transition 时，壳和角色组使用 240ms 的快速 ease-out；CSS 回退使用约 260ms。减少动态效果时移除位移、缩放和常规 transition，仅保留近乎即时的状态更新。

### Header Navigation
- **Style:** 品牌、扫描状态与 34px 图标按钮位于深色壳头部；浅色主题下同一结构转为浅色。
- **State:** 默认使用次级文字色；hover、展开或激活时获得轻微底色和主文字色；键盘焦点使用琥珀描边。

### Status Summary
- **Style:** 四列汇总，每项都有圆点、数量和状态文字；底色来自对应状态色的低浓度混合。
- **State:** hover 和筛选态提高底色浓度，按下有轻微缩放；再次选择同一状态回到全部。

### Session Ledger
- **Style:** 横向连续行，以细线分隔；状态标签、项目与路径、工作摘要与 Runtime/时间、进入箭头共同组成一条记录。
- **State:** 等你项可带极浅提示底色；hover、键盘焦点或牛的指向状态使用同一轻底色。行本身不变成悬浮卡片。

### Market Grid
- **Style:** 宽工作区为 4×2 的规则行情格；名称与涨跌在首行，价格跨满第二行。
- **State:** 上涨与下跌只改变涨跌字段颜色；hover 使用统一纸面底色，过期项降低透明度但保留内容。

### Memo Split
- **Style:** 左侧编辑、右侧最近记录。输入框使用暖纸内陷面；提醒时间是胶囊按钮；保存操作使用深字色反转为主按钮。
- **Responsive:** 窄于 520px 时改为编辑在上、历史在下。

### Buttons and Fields
- **Primary Button:** 34px 高、9px 圆角，以工作区主文字色填充并反转为纸色文字。
- **Fields:** 细边界、11px 圆角、暖纸输入面；输入内容允许选择，placeholder 使用次级文字色。
- **Focus:** 按钮、输入、文本域与可聚焦行统一使用 2px 琥珀描边和 2px 外偏移。

## Do's and Don'ts

### Do:
- **Do** 保持 Operate 模式：任何新增工作面都先保证状态、信息和下一步动作可以快速扫读。
- **Do** 复用 448px 紧凑壳、约 680px 工作区与 520px 响应式边界。
- **Do** 让状态同时拥有文字和圆点，并在汇总与 Session 行中保持同一语义映射。
- **Do** 让 Session、大盘与牛记沿用同一个壳、纸张和焦点反馈。
- **Do** 在空间变化上沿用 240ms View Transition，并完整尊重减少动态效果偏好。

### Don't:
- **Don't** 在深色壳内再盖一张厚重的深色工作卡片。
- **Don't** 把 Session 全景退化为通用 Dashboard、表格后台或一组彼此悬浮的卡片。
- **Don't** 只用颜色表达 working、waiting、idle 或 offline。
- **Don't** 把宽工作区的大盘挤回 2×4，或把牛记重新堆成单列窄栏。
- **Don't** 添加持续、高强度或纯装饰性的动效。
