# 牛来 / niul.ai

macOS 桌宠：一头尽量还原电影《牛来》的业余手搓 3D 黄牛犊（无角、可直立、建模崎岖、动作僵硬）。它浮在桌面最上层，头顶常驻气泡，列出本机 AI Runtime / 桌面端 / CLI / 开源 Agent 的 Session。

A macOS always-on-top desktop pet. The calf is a faithful recreation of the *Niu Lai* movie look: amateur 3D yellow cattle, no horns, bipedal, lumpy mesh, stiff motion. A speech bubble above it lists local AI runtime / desktop / CLI / open-source agent sessions.

仓库 / Repo: [https://github.com/adeptify/niul.ai](https://github.com/adeptify/niul.ai)

---

## 这是什么 / What this is

| 中文 | English |
| --- | --- |
| 透明无边框窗口，始终置顶，牛可拖动 | Transparent frameless window, always on top, the cow is draggable |
| 气泡列出扫到的 Session：Runtime 名、三态、工作目录 | Bubble lists scanned sessions: runtime name, three-state status, working directory |
| 三态：工作中 / 闲着 / 不在线 | States: **working** / **idle** / **offline** |
| 点一条：前置对应窗口；找不到窗口就打开那个目录 | Click a row: focus that app window, or open the directory |
| Runtime 可开关，也允许自定义 glob / 进程名 | Runtimes are togglable; custom globs and process names are allowed |

三态启发式（默认）/ Default heuristic:

1. **工作中 / working**：对应进程在，且该 Session 文件在 `workingWindowMs`（默认 25s）内被写入  
2. **闲着 / idle**：进程在，但文件不热  
3. **不在线 / offline**：进程不在

完整、按产品可执行的监控方案见 [docs/runtime-monitoring.md](docs/runtime-monitoring.md)。

The full, per-product monitoring plan is in [docs/runtime-monitoring.md](docs/runtime-monitoring.md).

---

## 启动 / Run

需要 macOS 与 Node 18+。Requires macOS and Node 18+.

```bash
git clone https://github.com/adeptify/niul.ai.git
cd niul.ai
npm install
npm start
```

第一次点击 Session 跳转时，macOS 可能要求给「辅助功能」权限（用来前置别的窗口）。

The first time you click a session, macOS may ask for Accessibility permission so the pet can bring another app to the front.

扫一次（不启动窗口）/ Scan once without the window:

```bash
node electron/scan.js
```

---

## 配置 / Config

| 位置 / Path | 用途 / Role |
| --- | --- |
| [`config/runtimes.default.json`](config/runtimes.default.json) | 内置 Runtime 清单、轮询间隔、热写入窗口 |
| `~/Library/Application Support/niul.ai/config.json` | 用户覆盖：开关 Runtime、自定义扫描规则 |
| 桌宠齿轮按钮 | 勾选内置 Runtime；`custom` 用 JSON 追加 |

用户配置会与默认清单合并，不会丢掉仓库里后来新增的 Runtime。

User config is merged on top of the defaults, so new built-in runtimes still appear after an upgrade.

自定义一条 / Custom runtime example:

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

Cursor · Claude Code · Claude Desktop · Codex · Gemini CLI · OpenCode · Pi · Aider · Continue · Windsurf · GitHub Copilot · Crush · Goose · Amp · Cline · Zed · Warp · ChatGPT

方案文档额外覆盖、需要自定义或后续接线的：jcode、Roo、OpenHands 等。见监控方案里的「覆盖表」。

The monitoring doc also covers jcode, Roo, OpenHands, and others that are plan-ready but not all wired as first-class detectors yet. See the coverage table there.

---

## 项目结构 / Layout

```
config/runtimes.default.json   默认 Runtime
electron/scan.js               扫描与三态
electron/focus.js              点击跳转
electron/main.js               透明置顶窗口
docs/runtime-monitoring.md     各家监控方案
```

---

## 许可与形象 / License and likeness

代码在本仓库。牛的形象是对电影《牛来》业余 3D 黄牛犊的原创还原，供本机桌宠使用，不是官方周边。

The code lives in this repo. The calf art is an original recreation of the *Niu Lai* amateur 3D look for this local pet; it is not official merchandise.
