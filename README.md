# 牛来 / niul.ai

macOS 桌宠：一头尽量还原电影《牛来》的业余手搓 3D 黄牛（短角、黄色短绒、紫灰色口鼻与手脚、半眯方眼、直立且动作僵硬）。它浮在桌面最上层，头顶气泡列出本机 AI Runtime / 桌面端 / CLI / 开源 Agent 的 Session。

A macOS always-on-top desktop pet. The character recreates the *Niu Lai* movie look: short horns, fuzzy yellow body, purple-gray muzzle and limbs, half-lidded rectangular eyes, bipedal stance, and deliberately stiff amateur 3D motion. A speech bubble above it lists local AI runtime / desktop / CLI / open-source agent sessions.

仓库 / Repo: [https://github.com/adeptify/niul.ai](https://github.com/adeptify/niul.ai)

---

## 这是什么 / What this is

| 中文 | English |
| --- | --- |
| 透明无边框窗口，始终置顶，牛可拖动 | Transparent frameless window, always on top, the cow is draggable |
| 气泡列出扫到的 Session：Runtime 名、状态、工作目录与判定依据 | Bubble lists runtime, state, working directory, and activity evidence |
| 四态：工作中 / 等你 / 闲置 / 不在线 | States: **working** / **waiting** / **idle** / **offline** |
| 牛会眨眼；说话有三段嘴型；悬停 Session 时经过中间帧抬头转向 | The cow blinks, speaks through three mouth frames, and turns toward hovered sessions through an in-between frame |
| 单击牛展开/收起气泡；拖动移动；双击抚摸 | Click to toggle the bubble, drag to move, double-click to pet |
| 右键牛打开本地快捷 Memo，可选 15 分钟、1 小时或明早提醒 | Right-click the cow for local quick memos and reminder presets |
| 点一条只打开对应 Runtime App；项目名不会被误当成 App 或 Finder 目录 | Click a row to open its Runtime app, never the project name or Finder folder |
| 状态与 Runtime 双重筛选，默认只展示“工作中” | Filter by status and Runtime; working sessions are shown by default |
| 状态变化会触发带“哞”前缀的牛来播报 | State changes trigger a spoken cow notification prefixed with “哞” |
| 碎嘴可关闭；快速连点牛五下会发现一个可再次连点取消的彩蛋 | Chatter can be muted; five quick clicks reveal a cancellable easter egg |
| 今日 Token 只读取 Codex、Claude Code、Grok Build、Gemini CLI 的明确 usage；部分记录显示为下界，Cursor 不估算 | Today’s tokens use explicit local usage only; partial records are lower bounds, and Cursor is not estimated |
| 设置里可分别缩放牛和 Session 气泡，并直接开关 Runtime | Scale the cow and bubble independently and toggle runtimes visually |
| Roll 池包含九种牛来；电源菜单可收展、隐藏或彻底退出 | Roll among nine cows; the power menu can collapse, hide, or fully quit |

状态判定 / State detection:

1. **工作中 / working**：优先读各 Runtime 的事件链（如 Cursor `tool_use`、Codex `task_started`），文件热写入只作为回退
2. **等你 / waiting**：最近一轮已有明确完成事件，等待用户继续
3. **闲置 / idle**：Runtime 在运行，但该 Session 已停止活动
4. **不在线 / offline**：没有发现对应 Runtime 进程

完整、按产品可执行的监控方案见 [docs/runtime-monitoring.md](docs/runtime-monitoring.md)。

The full, per-product monitoring plan is in [docs/runtime-monitoring.md](docs/runtime-monitoring.md). Token accounting follows [TokenStep](https://github.com/Backtthefuture/TokenStep)'s local-first rule and [CC-Switch](https://github.com/farion1231/cc-switch)'s importer behavior: explicit usage only, cross-file deduplication, no text-length estimation, and no legacy Grok context estimate mixed into exact totals.

---

## 安装与启动 / Install and run

需要 **macOS** 与 **Node 18+**。当前还没有已签名的 GitHub Release，请从源码安装。Requires macOS and Node 18+. There is no signed Release yet.

### 先在终端里跑起来 / Run from source

在**已经能执行 `node -v`** 的终端里：

```bash
git clone https://github.com/adeptify/niul.ai.git
cd niul.ai
npm install
npm start
```

不要只依赖双击：安装脚本启动的是非交互 shell，默认不会读 `~/.zshrc`。脚本会自己查找 nvm / Homebrew / Volta 里的 Node，但若你的 Node 只存在于当前终端会话，请在这个终端里继续操作。

If Node lives in nvm, run these commands in a terminal where `node -v` already works.

### 装成可重复打开的 App / Install the app

同一终端里：

```bash
zsh 安装牛来.command
```

也可以在 Finder 里打开 [`安装牛来.command`](安装牛来.command)。若系统提示无法验证开发者，对它**右键 → 打开**。

脚本顺序：已有的 `dist` 构建产物 → GitHub Release（若有）→ 用本机 Node 从源码打包。安装位置是 **`~/Applications/牛来.app`**（用户主目录下的应用程序，**不是** `/Applications`）。

The installer copies the app to `~/Applications/牛来.app`, not `/Applications`.

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

## 现在能扫到什么 / What is scanned today

内置（可在齿轮里关掉）/ Built-in (toggle in the gear panel):

Cursor · Claude Code · Claude Desktop · Codex · **Grok Build** · Gemini CLI · OpenCode · Pi · Aider · Continue · Windsurf · GitHub Copilot · Crush · Goose · Amp · Cline · Zed · Warp · ChatGPT

方案文档额外覆盖、需要自定义或后续接线的：jcode、Roo、OpenHands 等。见监控方案里的「覆盖表」。

The monitoring doc also covers jcode, Roo, OpenHands, and others that are plan-ready but not all wired as first-class detectors yet. See the coverage table there.

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

代码在本仓库。牛的形象是对电影《牛来》业余 3D 黄牛犊的原创还原，供本机桌宠使用，不是官方周边。

The code lives in this repo. The calf art is an original recreation of the *Niu Lai* amateur 3D look for this local pet; it is not official merchandise.
