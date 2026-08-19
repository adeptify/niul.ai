# Runtime 监控方案 / Runtime monitoring plan

这份文档说明牛来桌宠**怎么监视本机 AI Session**：文件在哪、三态怎么判、工作目录怎么取、点击往哪跳、哪些路径可配置。优先 macOS。路径以用户主目录为准；Windows / Linux 只在差异大时附注。

This document is the executable monitoring plan: where sessions live, how to classify **working / idle / offline**, how to read `cwd`, how click-to-focus should land, and which paths are configurable. macOS first.

实现入口 / Implementation: [`electron/scan.js`](../electron/scan.js), [`electron/focus.js`](../electron/focus.js), [`config/runtimes.default.json`](../config/runtimes.default.json).

---

## 1. 共同启发式 / Shared heuristic

轮询默认 2.5s，热写入窗口默认 25s（`workingWindowMs`）。先拍一张 `ps -axo pid=,comm=,args=`，再扫各家文件。

Poll every 2.5s by default. “Hot write” window defaults to 25s (`workingWindowMs`). Take one process snapshot, then walk each store.

| 状态 / State | 判定 / Rule |
| --- | --- |
| 工作中 / working | 该 Runtime **进程在**，且这条 Session 的主文件 `mtime` 落在 `workingWindowMs` 内 |
| 闲着 / idle | 进程在，但文件不热 |
| 不在线 / offline | 进程不在。默认只展示 `mtime` 仍在 `maxOfflineAgeMs`（3 天）内的条目 |

进程匹配必须收紧，避免误伤 / Process matching must be strict:

- 不要子串匹配 `amp`、`zed`、`claude`、`codex`（会撞上 `AMPDevices`、`Cursor Helper (Renderer)` 里的 zed、ChatGPT 的 `Codex Framework`、当前 shell 命令行）。  
- 优先：`comm` 整词、`/Applications/<Name>.app`、argv[0] 的 basename。  
- 黑名单示例：`CursorUIViewService`、`AMPDeviceDiscovery`、`Codex Framework`、`crashpad`。

点击跳转顺序 / Click-to-focus order:

1. 若配置了 `openBin` 且 PATH 上找得到，并且 `cwd` 存在 → `openBin cwd`（如 `cursor /Users/me/code/foo`）  
2. 否则若 `cwd` 存在 → `open cwd`  
3. 若配置了 `focusApp` → AppleScript 把名字包含该字符串的进程前置（需要辅助功能权限）

**工作目录**优先从 Session 文件字段读；没有再用目录名反解（把 `Users-me-code-foo` / `-Users-me-code-foo` 还原成 `/Users/me/code/foo`，并尝试最后一段用 `.` 连接，以覆盖 `niul.ai`）。

`cwd` comes from the session payload first, then from hyphen-encoded folder names (`Users-me-code-foo` → `/Users/me/code/foo`, with a `.` join fallback for `niul.ai`).

---

## 2. 覆盖表 / Coverage

| Runtime | Session 主路径 / Primary store | 环境变量 / Env | 本仓库 | 证据 / Evidence |
| --- | --- | --- | --- | --- |
| Cursor | `~/.cursor/projects/<id>/agent-transcripts/` | — | 内置 | 本机已验证 |
| Claude Code | `~/.claude/projects/**/*.jsonl` | `CLAUDE_HOME` | 内置 | showagent + 本机 |
| Claude Desktop | `~/Library/Application Support/Claude/local-agent-mode-sessions/` | — | 内置 | 本机目录 |
| Codex | `~/.codex/sessions/**/*.jsonl` | `CODEX_HOME` | 内置 | showagent + 本机；`originator` 可为 `Codex Desktop` |
| Gemini CLI | `~/.gemini/tmp/<project_hash>/chats/session-*` | `GEMINI_CLI_HOME` / `GEMINI_DIR` | 内置 | 官方 session-management 文档 |
| OpenCode | `~/.local/share/opencode/opencode.db` 与 `storage/session/` | `OPENCODE_DATA_HOME` | 内置 | OpenCode docs / issues |
| Pi | `~/.pi/agent/sessions/**/*.jsonl` | `PI_CODING_AGENT_DIR`, `PI_CODING_AGENT_SESSION_DIR` | 内置 | Pi 官方 sessions 文档 |
| Aider | 项目内 `.aider.chat.history.md`；`~/.aider/` | — | 内置（家目录扫描） | Aider 惯例 |
| Continue | `~/.continue/sessions/` | — | 内置 | Continue 惯例 |
| Windsurf | `~/.codeium/windsurf/` | — | 内置 | skills CLI detection path |
| GitHub Copilot | `~/.copilot/`；VS Code `globalStorage` | — | 内置（家目录） | skills CLI；Chat 记录因 IDE 而异 |
| Crush | `~/.local/share/crush/`，`~/.config/crush/` | — | 内置 | XDG + skills CLI |
| Goose | `~/.local/share/goose/`，`~/.config/goose/` | — | 内置 | XDG + skills CLI |
| Amp | `~/.amp/`，`~/.config/amp/` | — | 内置 | skills CLI detection `~/.config/amp` |
| Cline | VS Code `globalStorage/saoudrizwan.claude-dev/tasks/`；新版 `~/.cline/data/sessions/` | — | 内置（`~/.cline`） | Cline 官方 task-history 文档 |
| jcode | `~/.jcode/sessions/*.json` | `JCODE_HOME` | 自定义 glob | showagent / jcode README |
| Roo | VS Code `globalStorage`（Roo 扩展 id）+ `~/.roo/` | — | 自定义 | skills CLI `~/.roo` |
| OpenHands | `~/.openhands/` | — | 自定义 | skills CLI |
| Zed / Warp / ChatGPT | 应用支持目录 + 进程名 | — | 内置（粗粒度） | 桌面端，Session 粒度弱 |

「内置」= `config/runtimes.default.json` 有条目且 `scan.js` 会跑探测器。未内置的用 `custom` 即可先用起来。

“Built-in” means a detector runs today. Everything else can be added via `custom` without a code change.

---

## 3. 可配置 Runtime / Configurable runtimes

两层配置 / Two layers:

1. **默认清单** `config/runtimes.default.json`  
   - `pollMs`, `workingWindowMs`, `maxOfflineAgeMs`, `maxSessions`  
   - `runtimes.<id>.enabled | label | process[] | focusApp | openBin`  
2. **用户覆盖** `~/Library/Application Support/niul.ai/config.json`  
   - 只改你关掉的 Runtime 和 `custom[]`  
   - 与默认 deep-merge，升级不会冲掉新内置项  

`custom[]` 最小可用形状 / Minimum custom shape:

```json
{
  "id": "openhands",
  "label": "OpenHands",
  "enabled": true,
  "glob": "~/.openhands",
  "process": ["openhands"],
  "openBin": "openhands",
  "focusApp": "OpenHands"
}
```

扫描器对 `glob` 指向的目录做有限深度递归，收取 `.json` / `.jsonl`，用同一套三态规则。`cwd` 尝试 JSON/JSONL 里的 `cwd` / `directory` / `payload.cwd`。

The scanner walks `glob` (bounded depth), keeps `.json` / `.jsonl`, applies the same three-state rules, and reads `cwd` / `directory` / `payload.cwd` when present.

以后若某家需要 SQLite / VS Code globalStorage，应升为内置探测器，而不是把 SQL 塞进 glob。

If a product needs SQLite or VS Code `globalStorage`, promote it to a built-in detector instead of stretching glob.

---

## 4. 各家细节 / Per-runtime notes

每节同一套字段：存哪、三态、cwd、跳转、配置。

Each section uses the same fields: store, states, cwd, focus, config.

### Cursor

**存哪 / Store**

- `~/.cursor/projects/<project-id>/agent-transcripts/<session-id>/<session-id>.jsonl`  
  这是 Agent 对话；子目录 `subagents/` 是子代理，列表里应忽略，避免一条用户对话炸出十几行。  
- `~/.cursor/projects/<project-id>/terminals/*.txt` 头部有 `cwd:`、`pid:`，用来还原工作区。  
- `<project-id>` 一般是把绝对路径的 `/` 换成 `-`，点号有时也变成 `-`（`/Users/me/code/niul.ai` → `Users-yijunwang-code-niul-ai`）。

**三态 / States**

- 进程：`/Applications/Cursor.app` 或 `comm` 为 `Cursor`。不要匹配 `Cursor Helper` 里的偶然子串，更不要匹配 `CursorUIViewService`。  
- 工作中：上述 jsonl（不要用 subagent 文件）`mtime` 很新。当前对话会持续 append。  
- 闲着：Cursor 开着，但该 jsonl 不再写。  
- 不在线：没有 Cursor 主进程。

**cwd**

1. 任一 `terminals/*.txt` 的 `cwd:`  
2. 否则反解 `project-id`  
3. jsonl 正文里偶尔有工作区绝对路径，可作校验

**跳转 / Focus**

- `openBin`: `cursor` → `cursor <cwd>`  
- `focusApp`: `Cursor`

**配置 / Config**

- 无官方 env。自定义根目录目前只能改探测器或 `custom.glob`。

---

### Claude Code

**存哪 / Store**

- `~/.claude/projects/<encoded-cwd>/*.jsonl`  
- 编码：绝对路径前加 `-`，`/` → `-`，例如 `/Users/me/code/foo` → `-Users-me-code-foo`。  
- 行内字段常见：`cwd`, `sessionId`, `type`, `timestamp`。

**三态 / States**

- 进程：argv0 basename `claude`，或 `comm` 为 `claude`。不要把任意 zsh 命令行里出现的单词 `claude` 算在线。  
- 工作中：该 jsonl 热写入。  
- 闲着 / 不在线：同上启发式。

**cwd**

- JSONL 行上的 `cwd`（最可靠）  
- 否则反解目录名 `<encoded-cwd>`

**跳转 / Focus**

- `openBin`: `claude`（在已有终端里 resume 不可靠；至少 `open <cwd>`）  
- 若用户用 Claude Desktop 跑 Code：再前置 `Claude`

**配置 / Config**

- `CLAUDE_HOME`：若设置，应指向 **Claude 家目录**（`~/.claude`），Session 仍在其下 `projects/`。探测器不要把 `CLAUDE_HOME` 直接当成 `projects`。

---

### Claude Desktop

**存哪 / Store**

- `~/Library/Application Support/Claude/`  
- Agent 模式：`local-agent-mode-sessions/<id>/`（跳过 `skills-plugin`）  
- 另有 Electron 常规目录（Cache、IndexedDB），那些不是 Session 列表。

**三态 / States**

- 进程：`/Applications/Claude.app`，`comm` 为 `Claude`。  
- 工作中：该 session 目录下最新 `.json` / `.jsonl` 热写入。  
- Desktop 与 Code 可能同机共存：两条 Runtime 分开显示，不要合并。

**cwd**

- 从 session 文件读 `cwd`；没有就留空，点击只前置 Claude。

**跳转 / Focus**

- `focusApp`: `Claude`  
- 无稳定 CLI 打开指定 Agent session；退回 `open <cwd>`。

**配置 / Config**

- 无稳定 env。路径跟 macOS 应用支持目录走。

---

### Codex（CLI 与 Desktop）

**存哪 / Store**

- `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`  
- 第一行常为 `type: session_meta`，`payload.cwd`、`payload.originator`（可见 `Codex Desktop`）、`payload.session_id`。  
- **注意**：`session_meta` 可能非常长（内嵌 instructions）。读 cwd 不要 `JSON.parse` 截断后的第一行；应在文件头里用 `"cwd":"..."` 正则，或读足够大的前缀再解析。

**三态 / States**

- 进程：`codex` 二进制，或 `/Applications/Codex.app`。  
- **不要**把 ChatGPT.app 里的 `Codex Framework.framework` 当成 Codex 在线。  
- 工作中：该 rollout jsonl 热 append。  
- Desktop 与 CLI 共用 `~/.codex` 时，用 `originator` 区分展示标签即可，仍算同一家存储。

**cwd**

- `payload.cwd`  
- 子 agent 可能带 `agent_path`，列表仍以 session 的 workspace cwd 为准。

**跳转 / Focus**

- `openBin`: `codex`  
- `focusApp`: `Codex`  
- Desktop：前置 Codex；否则 `open <cwd>`

**配置 / Config**

- `CODEX_HOME` 覆盖 `~/.codex`

---

### Gemini CLI

**存哪 / Store**

- `~/.gemini/tmp/<project_hash>/chats/session-*.jsonl`（现格式）  
- 旧/导出：同目录 `session-*.json`  
- `<project_hash>` 由项目根算出来，**不是**可读路径。

**三态 / States**

- 进程：basename `gemini`  
- JSONL 为 append-only，热 `mtime` = 正在聊。  
- 旧整文件 JSON 每次重写，同样可用 `mtime`。

**cwd**

- 元数据里的项目路径（若有）  
- 否则只能显示 hash；可维护 hash→path 缓存（例如从最近一次 `pwd` 与 hash 对照）。这是已知缺口。

**跳转 / Focus**

- `openBin`: `gemini`  
- 无官方「打开某 session 并前置窗口」；`open <cwd>` 若 cwd 已知。

**配置 / Config**

- `GEMINI_CLI_HOME` 或文档中的 `GEMINI_DIR` 替换 `~/.gemini`  
- 本仓库当前认 `GEMINI_CLI_HOME`

---

### OpenCode

**存哪 / Store**

- 数据根：`$OPENCODE_DATA_HOME` 或 `$XDG_DATA_HOME/opencode` 或 `~/.local/share/opencode`  
- 现：`opencode.db`（或渠道版 `opencode-*.db`）  
- 仍可能存在 `storage/session/` JSON（迁移残留）  
- Desktop 与 CLI 共用同一 DB

**三态 / States**

- 进程：`opencode` 或 OpenCode.app  
- 工作中：DB 或当前 session 行 `updated_at` / 对应 JSON `mtime` 很新。SQLite 上不要把整库 `mtime` 当成「有一条在干活」——库文件一写，所有行都会像在工作。应按 session 行的时间戳。  
- 本仓库第一版若只看到 DB 文件，只能给出粗粒度「OpenCode 在写库」，这是已知限制。

**cwd**

- session 行的 `directory` / `path`（Desktop 常用绝对路径，CLI 可能是相对 worktree 路径）

**跳转 / Focus**

- `openBin`: `opencode`  
- `focusApp`: `OpenCode`

**配置 / Config**

- `OPENCODE_DATA_HOME`  
- `XDG_DATA_HOME`

---

### Pi

**存哪 / Store**

- `~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`  
- JSONL 树；header 含 `cwd`

**三态 / States**

- 进程：`pi-coding-agent` 或 argv 含 `@mariozechner/pi`。不要匹配任意叫 `pi` 的进程。  
- 热 jsonl = 工作中。

**cwd**

- header / `session_info` 的 `cwd`  
- 否则反解目录名（`/` 曾被换成 `-`）

**跳转 / Focus**

- `openBin`: `pi`  
- CLI TUI，通常没有独立窗口可前置 → `open <cwd>`

**配置 / Config**

- `PI_CODING_AGENT_DIR`（默认 `~/.pi/agent`）  
- `PI_CODING_AGENT_SESSION_DIR`（直接覆盖 sessions 根）

---

### Aider

**存哪 / Store**

- 仓库根：`.aider.chat.history.md`、`.aider.input.history`  
- 家目录：`~/.aider/`  
- 没有全局 UUID session 树；一条历史文件 ≈ 该仓库的对话。

**三态 / States**

- 进程：basename `aider`  
- 工作中：当前仓库的 history 文件热写入。全局扫描家目录只能证明「这台机器用过 Aider」，不能列出所有项目 session，除非再扫常见代码根（成本高）。

**cwd**

- history 文件所在目录（若在项目根）

**跳转 / Focus**

- `openBin`: `aider`  
- 无 GUI → `open <cwd>`

**配置 / Config**

- 无单一 env。`custom.glob` 可指向你的代码根下的 `.aider.chat.history.md`。

---

### Continue

**存哪 / Store**

- `~/.continue/sessions/`  
- 有时还有 `~/.continue/dev_data/sessions/`  
- 项目内 `.continue/` 是配置，不是全局 session 索引。

**三态 / States**

- 进程：Continue 扩展跑在 VS Code / JetBrains 里，**没有**稳定的名为 `continue` 的 OS 进程。更可靠：宿主 IDE 在线（`Code` / `Cursor`）且该 session 文件热。  
- 若只匹配单词 `continue`，误报会很多。建议：文件热 → 工作中；文件冷且宿主 IDE 在 → 闲着；否则不在线。

**cwd**

- session JSON 若含 workspace 路径则用；否则留空。

**跳转 / Focus**

- 前置 VS Code / Cursor  
- `open <cwd>`

**配置 / Config**

- 无稳定 env。自定义 glob：`~/.continue/sessions`

---

### Windsurf

**存哪 / Store**

- 检测根：`~/.codeium/windsurf/`  
- Cascade 对话还可能在 Windsurf 的 `User/globalStorage` 下（Codeium 扩展 id）。以目录 `mtime` 和 Cascade JSON 为准做第一版。

**三态 / States**

- 进程：`/Applications/Windsurf.app`  
- 工作中：Cascade/session 文件热。不要把整个 `~/.codeium` 缓存抖动当成干活。

**cwd**

- 从对话元数据读 workspace；否则只能前置应用。

**跳转 / Focus**

- `openBin`: `windsurf`  
- `focusApp`: `Windsurf`

**配置 / Config**

- 无稳定 session env。

---

### GitHub Copilot

**存哪 / Store**

- 技能/配置：`~/.copilot/`  
- Copilot Chat 对话在 **宿主编辑器** 的 `globalStorage`（GitHub Copilot Chat 扩展），Cursor 与 VS Code 路径不同：  
  - `~/Library/Application Support/Code/User/globalStorage/`  
  - `~/Library/Application Support/Cursor/User/globalStorage/`  
- 没有一份官方、稳定、跨 IDE 的「session jsonl」合同。第一版只扫 `~/.copilot/` 会漏掉 Chat。

**三态 / States**

- 不要用进程名 `Copilot`（几乎不会作为独立 app）。  
- 用：宿主 IDE 在线 + Chat 存储文件热。

**cwd**

- 当前工作区来自 IDE；Copilot 存储里不一定有绝对路径。

**跳转 / Focus**

- 前置 Cursor 或 VS Code，并 `open <cwd>`（若已知）。

**配置 / Config**

- 建议 `custom.glob` 指向你常用 IDE 的 `globalStorage/<copilot-chat-id>/`。确认 id 后再写进默认清单。

---

### Crush

**存哪 / Store**

- `~/.local/share/crush/`  
- `~/.config/crush/`（配置为主，session 可能在 XDG data）

**三态 / States**

- 进程：basename `crush`  
- 热 json/jsonl = 工作中

**cwd**

- 文件内 `cwd`；否则空

**跳转 / Focus**

- `openBin`: `crush`  
- TUI → `open <cwd>`

**配置 / Config**

- 遵循 XDG：`XDG_DATA_HOME`, `XDG_CONFIG_HOME`

---

### Goose

**存哪 / Store**

- `~/.config/goose/`（配置、skills）  
- `~/.local/share/goose/`（session / 记忆类数据，按版本可能变化）

**三态 / States**

- 进程：basename `goose`  
- 对 session 文件用同一套 mtime 启发式。若只有配置文件在抖，不要标工作中。

**cwd**

- session 记录中的工作目录字段（若有）

**跳转 / Focus**

- `openBin`: `goose`

**配置 / Config**

- `XDG_CONFIG_HOME`, `XDG_DATA_HOME`

---

### Amp

**存哪 / Store**

- `~/.config/amp`（skills CLI 检测路径）  
- `~/.amp/`（部分安装）  
- 进程名 `amp` **极易误报**（`AMPDevices` 等）。必须用 argv0 basename 或 `/Applications/Amp.app`。

**三态 / States**

- 仅当 Amp 二进制/应用确实在跑，且 session 文件热。  
- 若家目录存在但进程匹配失败：最多标不在线历史，不要标工作中。

**cwd / 跳转 / 配置**

- 同通用 JSONL 规则；`openBin`: `amp`  
- 无稳定 session env 时用 `custom.glob`

---

### Cline

**存哪 / Store**

- 旧 VS Code：`~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/tasks/<task-id>/`  
  内含 `api_conversation_history.json`, `ui_messages.json`, `task_metadata.json`  
- Cursor 里装 Cline：把 `Code` 换成 `Cursor`  
- 新 SDK：`~/.cline/data/sessions/<sessionId>/`

**三态 / States**

- 无独立 Cline.app。宿主 IDE 在 + `ui_messages.json`（或 session messages）热写入 = 工作中。  
- 不要依赖进程名 `cline`。

**cwd**

- `task_metadata.json` / session manifest 里的 workspace 路径

**跳转 / Focus**

- 前置 VS Code 或 Cursor  
- `open <cwd>`

**配置 / Config**

- 同时扫 Code 与 Cursor 两套 `globalStorage`，外加 `~/.cline/data/sessions`

---

### jcode

**存哪 / Store**

- `~/.jcode/sessions/*.json`  
- 记忆：`~/.jcode/memory/`（不要当 Session 列表）

**三态 / States**

- 进程：`jcode` 在 PATH 上且正在跑（showagent 也要求二进制存在才启用）  
- 热 json = 工作中

**cwd**

- session JSON 内字段（实现时读文件确认键名）

**跳转 / Focus**

- `openBin`: `jcode`

**配置 / Config**

- `JCODE_HOME`  
- 本仓库用 custom：`"glob": "~/.jcode/sessions"`

---

### Roo

**存哪 / Store**

- 技能根：`~/.roo/`  
- 任务历史通常在 VS Code/Cursor `globalStorage/<Roo 扩展 id>/`（与 Cline 同类，扩展 id 不同）。落地前用本机 `ls "~/Library/Application Support/Cursor/User/globalStorage"` 确认 id。

**三态 / States**

- 同 Cline：宿主 IDE + 任务文件热写入。

**cwd / 跳转 / 配置**

- 从 task metadata 读 workspace；前置 IDE；`custom.glob` 指向确认后的 globalStorage。

---

### OpenHands

**存哪 / Store**

- `~/.openhands/`（skills CLI 检测路径）  
- 运行时还可能有 Docker 卷里的 conversation；桌宠只扫本机家目录，不进容器。

**三态 / States**

- 进程：`openhands` 或对应桌面/runtime 进程  
- 热 conversation 文件 = 工作中

**cwd**

- conversation 元数据中的 repo/workspace

**跳转 / Focus**

- `openBin`: `openhands`（若存在）  
- 否则 `open <cwd>`

**配置 / Config**

- `custom.glob`: `~/.openhands`

---

### 粗粒度桌面端 / Coarse desktop apps

Zed、Warp、ChatGPT 可以显示「应用在/不在」，但没有与 Cursor jsonl 同级的稳定 Session 合同。

Zed, Warp, and ChatGPT can show app up/down, but they lack a stable per-session file contract comparable to Cursor jsonl.

- **Zed**：进程 `Zed`；会话细节弱。进程匹配必须避开 `Cursor Helper (Renderer)` 命令行里偶然出现的 `zed`。  
- **Warp**：`~/Library/Application Support/dev.warp.Warp-Stable/`；进程 `Warp`。  
- **ChatGPT**：`~/Library/Application Support/com.openai.chat/`；进程 `ChatGPT`。不要把它的内嵌 `Codex Framework` 当成 Codex Runtime。

对这三家：有进程 → 闲着（除非找到明确的热 session 文件）；无进程 → 不在线。点击只前置 App。

For these three: process up ⇒ idle unless a real hot session file exists; process down ⇒ offline. Click only focuses the app.

---

## 5. 落地顺序 / Implementation order

1. 收紧进程匹配（已经部分做了：blocklist + 整词）。  
2. Cursor / Claude Code / Codex / Pi / Gemini：文件合同清晰，作为三态金标准。  
3. OpenCode：按 DB 行而不是 DB 文件 mtime。  
4. Cline：补 Code + Cursor 两套 `globalStorage`，不要只扫 `~/.cline`。  
5. Copilot / Windsurf / Roo：先本机确认 globalStorage 扩展 id，再写死默认路径。  
6. jcode / OpenHands / Crush / Goose / Amp：custom glob 可先用，误报低再升内置。

Click 路径保持单一函数：`openBin cwd` → `open cwd` → `focusApp`。缺 Accessibility 权限时仍应打开目录。

Keep one click path: `openBin cwd` → `open cwd` → `focusApp`. Opening the directory must still work without Accessibility permission.
