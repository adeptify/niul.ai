<p align="center">
  <img src="assets/niulai-product-logo-v1.png" width="120" height="120" alt="牛来">
</p>

<h1 align="center">AI 开了一堆，谁在干活？让牛来帮你盯着。</h1>

<p align="center">
  一头驻扎在 macOS 桌面的小牛牛，替你巡视 Cursor、Claude Code、Codex、Grok Build 和其他本地 AI Session。
</p>

<p align="center">
  它不写代码，只负责看谁在拉犁、谁在等你、谁又偷偷跑去吃草。
</p>

<p align="center">
  <a href="https://github.com/adeptify/niul.ai/releases/latest"><b>下载最新版</b></a>
  ·
  <a href="#它到底会干嘛">它会干嘛</a>
  ·
  <a href="#支持的-runtime">支持的 Runtime</a>
</p>

<p align="center">
  <img src="assets/github-social-preview.png" width="100%" alt="Niul.ai 牛来">
</p>

## 你开了很多 AI，但你已经忘了它们在哪

Cursor 开着。Claude Code 也开着。Codex 好像刚跑完，但你不确定。

还有一个 Session 躲在角落里等你确认，已经等了二十分钟。

**牛来知道。**

它浮在桌面最上层，把本机 AI Session 翻译成四句牛话：

- 🟢 **拉犁**：正在工作
- 🔵 **停犁**：这一轮完成了，正在等你
- 🟡 **吃草**：Runtime 还在，但 Session 闲置了
- ⚫ **回棚**：Runtime 已经不在线

不用反复切窗口，也不用盯着一排终端。**看一眼牛，就知道谁还在干活。**

## 它到底会干嘛

### 一眼看完所有 AI Session

气泡里显示 Runtime、项目目录、活动状态、判定依据和今日 Token。支持按状态与 Runtime 筛选，默认只把正在拉犁的 Session 放到你眼前。

<p align="center">
  <img src="assets/niulai-session-overview.png" width="72%" alt="Niul.ai Session 状态、筛选与 Token 功能演示">
  <br>
  <sub>演示数据均为 Mock，不包含真实用户名、目录或 Token 记录。</sub>
</p>

### 点谁，就去找谁

点击 Session，直接唤起对应的 Runtime App。Codex 就打开 Codex，不会把项目名误当成 App，也不会把 Finder 文件夹丢到你脸上。

### 它真的会盯着工作

状态变化时，牛会抬头、张嘴，然后告诉你：

> 哞，niul.ai 停犁了，正等你。

牛会眨眼、看向你正在悬停的 Session，也会在你拖动时乖乖跟着走。拖到上半屏，气泡自动跑到牛下面；拖回下半屏，气泡重新回到头顶。

### 今天又烧了多少 Token

读取 Codex、Claude Code、Grok Build、Gemini CLI 本机日志里的明确 usage。不按文字长度瞎猜，不把历史上下文伪装成新增消耗，Cursor 没公开的数据也不会硬估。

### 一头牛不够，那就 Roll

原版牛、小裙子牛、头箍牛、学习牛、书包牛、跳舞牛、足球牛……目前一共九头，而且每头都多少有点不正常。

<p align="center">
  <img src="assets/niulai-skirt-v1.png" width="15%" alt="小裙子牛来">
  <img src="assets/niulai-study-v1.png" width="15%" alt="学习牛来">
  <img src="assets/niulai-backpack-v1.png" width="15%" alt="书包牛来">
  <img src="assets/niulai-dance-v1.png" width="15%" alt="跳舞牛来">
  <img src="assets/niulai-football-v1.png" width="15%" alt="足球牛来">
</p>

## ⚠️ 一些没必要，但不能没有的东西

- 单击牛：展开或收起 Session
- 双击牛：摸一下
- 右键牛：快速记 Memo，可选 15 分钟、1 小时或明早提醒
- `⌘⇧U`：随时召唤或隐藏
- 状态变化：牛会带着一声「哞」碎嘴播报

> [!CAUTION]
> **不要连续点击这头牛五下。**
>
> 除非你真的想让它进入持续五分钟的「哞拉松」：每隔几秒抬头张嘴、认真报时，并继续哞。后悔了也可以再连点五下取消——前提是你还点得到它。

<p align="center">
  <img src="assets/niulai-moo-marathon.png" width="88%" alt="连续点击牛五下触发哞拉松彩蛋">
</p>

## 本地优先

牛来不需要登录你的 AI 账号，不上传 Session，也不接第三方统计服务。

扫描、状态判断、Token 汇总和 Memo 都留在你的 Mac 上。它只是看起来不太聪明。

<details>
<summary><b>English</b></summary>

Niul.ai is a weirdly useful always-on-top macOS desktop pet. It watches local AI sessions across Cursor, Claude Code, Codex, Grok Build, and other runtimes, tells you who is working or waiting, focuses the right app when clicked, and keeps explicit local token usage local.

</details>

---

## 三分钟把牛牵回家 / Install

### 普通用户：直接下载 App

1. 打开 [GitHub Releases](https://github.com/adeptify/niul.ai/releases/latest)
2. Apple 芯片（M1 / M2 / M3 / M4）下载 `arm64`；Intel Mac 下载 `x64`
3. 解压 `.zip`，把「牛来」放进应用程序
4. 第一次启动请在 Finder 里对 App **右键 → 打开**

不需要 Node，不需要打开终端。当前构建尚未使用 Apple Developer ID 签名，因此直接双击可能被 macOS 拦住一次。

### 开发者：从源码启动 / Run from source

在**已经能执行 `node -v`** 的终端里：

```bash
git clone https://github.com/adeptify/niul.ai.git
cd niul.ai
npm install
npm start
```

需要 macOS 与 Node 18+。If Node lives in nvm, run these commands in a terminal where `node -v` already works.

### 从仓库一键安装

同一终端里：

```bash
zsh 安装牛来.command
```

也可以在 Finder 里打开 [`安装牛来.command`](安装牛来.command)。脚本会优先使用现有构建或 GitHub Release，没有可用产物时才从源码打包。

安装位置是 **`~/Applications/牛来.app`**。The installer copies the app to `~/Applications/牛来.app`, not `/Applications`.

### 装好之后 / After install

- 用 Spotlight 搜「牛来」，或打开 `~/Applications/牛来.app`
- 运行中按 **⌘⇧U** 显示或隐藏；电源菜单「隐藏桌宠」仍保留菜单栏和快捷键
- 「彻底退出」或重启后不会自动回来，需要再打开一次
- 当前构建没有 Apple Developer ID 签名。若打不开，在 Finder 里对 App **右键 → 打开**
- 第一次点 Session 跳转时，macOS 可能要求给「辅助功能」权限（用来前置别的窗口）
- 默认只展示「工作中」Session；列表为空时可切到「全部」，或点齿轮开关 Runtime

扫一次（不启动窗口）/ Scan once without the window:

```bash
node electron/scan.js
```

---

## 配置 / Config

| 位置 / Path | 用途 / Role |
| --- | --- |
| [`config/runtimes.default.json`](config/runtimes.default.json) | 内置 Runtime 清单、轮询间隔、热写入窗口 |
| `~/Library/Application Support/牛来/config.json` | 用户覆盖：开关 Runtime、自定义扫描规则 |
| 桌宠齿轮按钮 | 勾选内置 Runtime；通过名称、文件夹和可选进程名添加其他 Runtime |

用户配置会与默认清单合并，不会丢掉仓库里后来新增的 Runtime。

User config is merged on top of the defaults, so new built-in runtimes still appear after an upgrade.

通常不需要手改配置文件；高级用户仍可编辑 `config.json`。Custom runtimes can be added entirely from the settings panel; the JSON shape remains available for advanced users:

```json
{
  "custom": [
    {
      "id": "jcode",
      "label": "jcode",
      "enabled": true,
      "glob": "~/.jcode/sessions",
      "process": ["jcode"],
      "openBin": "jcode",
      "focusApp": "jcode"
    }
  ]
}
```

字段含义 / Fields:

- `glob`：Session 目录或文件树（实现会递归找 `.json` / `.jsonl`）  
- `process`：`ps` 里用来判断「进程在不在」的名字  
- `openBin`：点击时若 PATH 上有这个命令，用它打开 `cwd`  
- `focusApp`：AppleScript 前置的进程名  

---

## 支持的 Runtime

内置（可在齿轮里关掉）/ Built-in (toggle in the gear panel):

Cursor · Claude Code · Claude Desktop · Codex · **Grok Build** · Gemini CLI · OpenCode · Pi · Aider · Continue · Windsurf · GitHub Copilot · Crush · Goose · Amp · Cline · Zed · Warp · ChatGPT

方案文档额外覆盖、需要自定义或后续接线的：jcode、Roo、OpenHands 等。见监控方案里的「覆盖表」。

The monitoring doc also covers jcode, Roo, OpenHands, and others that are plan-ready but not all wired as first-class detectors yet. See the coverage table there.

### 它怎么知道谁在干活

牛来优先读取各 Runtime 的明确事件链，例如 Cursor `tool_use`、Codex `task_started` 和任务完成事件；只有拿不到事件时，才会用文件活动作为回退。

今日 Token 参考 [TokenStep](https://github.com/Backtthefuture/TokenStep) 的本地优先原则和 [CC-Switch](https://github.com/farion1231/cc-switch) 的导入逻辑：只统计明确 usage、跨文件去重、不按文本长度估算。

完整的逐 Runtime 监控方案见 [docs/runtime-monitoring.md](docs/runtime-monitoring.md)。

---

## 项目结构 / Layout

```
config/runtimes.default.json   默认 Runtime
electron/scan.js               扫描、Runtime 事件解析与四态
electron/tokens.js             本机今日 Token 统计与去重
electron/memos.js              本地 Memo 与到点提醒
electron/focus.js              点击跳转
electron/main.js               透明置顶窗口
docs/runtime-monitoring.md     各家监控方案
```

---

## 许可与形象 / License and likeness

牛来是一只原创的手搓感 3D 小黄牛桌宠：短角、半眯眼、动作有点僵，工作态度倒是很认真。

Niul.ai and its calf character are original open-source project assets.

## 最后

它可能不是你最需要的开发工具。

但当你同时开着六个 Agent 时，你会需要一头牛。

如果它替你少找过一次窗口，给牛加颗草：**Star ⭐**
