# 牛来 ← 刘海竞品：可借鉴功能纪要

给后续 agent 的交接。先读本文件和 `PRODUCT.md`。过项已结束，不要再发明功能。

- 来源：Grok Build 会话 `01a01e7e-7124-74b2-a809-01e0074e4ca6`（标题：牛来对照刘海竞品：先过停犁语义）
- 磁盘：`~/.grok/sessions/%2FUsers%2Foreal/01a01e7e-7124-74b2-a809-01e0074e4ca6/`
- 日期：2026-08-20（产品过项收口）
- 产品：牛来 / niul.ai
- 对照：https://vibeisland.app/ 、https://agentpeek.app/

---

## 本轮要实现（仅此 7 项）

按三刀做，不要拆成十九个互不相关的 PR，也不要做表外的东西。

| 刀 | 做 | 主要文件 |
|---|---|---|
| 1 气泡 + 牛话 | ① 停犁 `waitWhy`（next/choose/allow）② 停太久再催一声 ③ 副行正在犁什么 ④ 看不清才说 ⑤ Cursor 带着 N 头小牛 | `electron/scan.js`、`renderer/app.js` |
| 2 Token 条 | ⑥ Codex 剩余额度：只读 Codex `rate_limits` | `electron/tokens.js`、Token 条 UI |
| 3 跳转 | ⑦ IDE 用 `openBin`+cwd；CLI 认父进程终端 App | `electron/focus.js` |

合同细节见下方同名小节。用户可见文案、检测边界、性能约束以那些小节为准。

## 本轮不要做

- **头数影响牛有多忙**（用户否决）
- **新 CLI 名单扩张 / hook**（政策：按需再升内置；本轮零代码）
- 刘海、Allow/Deny、Chat、看板、小组件、精确 tab/pane、估 Claude 5 小时、为配额联网、Doctor、假肢/额上数字、hide-when-idle

---

## 产品物种（不可改）

牛来是 **会说话的桌宠哨兵**，不是 Agent 指挥台。

| | 牛来 | AgentPeek / Vibe Island |
|---|---|---|
| 卖的是 | 有一头笨拙的牛替你看着 Agent | 刘海就是控制面 |
| 主界面 | 置顶 3D 桌宠 + 头顶气泡 | 刘海 pill / 菜单栏 / 看板 / 聊天窗 |
| 对 Agent | 只看、只跳、只报 | 看 + 批 + 答 + 续聊 |
| 技术 | Electron，只读扫描本机 session | 原生 Swift，往 CLI 写 hook |

四态锁死，界面文案用牛话：

| status | 用户看见 |
|---|---|
| `working` | 拉犁 |
| `waiting` | 停犁 |
| `idle` | 吃草 |
| `offline` | 回棚 |

### 借鉴过滤（过不了就不要做）

1. 牛的姿态或一句牛话能表达，不靠新仪表盘。
2. 仍是观察，不往 Claude/Codex 等 config 里写 hook。
3. 用户动作仍是：看一眼 → 点一下跳回去；牛不替人点 Allow、不续聊。
4. 去掉这头牛，功能还像一个独立工具——那就是在长成 AgentPeek。

每加一项验收：用户是先看见牛的变化，还是先看见一块新 UI？必须先看见牛。

### 明确不要做

刘海 / Dynamic Island / 玻璃面板；Allow/Deny、答题卡、Plan Markdown；Direct Chat / 往 session 塞 follow-up；独立 Chat 窗、Todos/Transcript 小组件；Fast Actions / Views / 终端工作区启动器；SSH 远程指挥；把本地 dev server 收成新一级产品；8-bit 音包；推 iPhone；菜单栏第二块监控 UI；在牛身上贴数字徽章或假肢。

---

## 已锁定合同（实现时逐条对照）

用户已口头确认「可以 / 按这个」。实现按用户可见行为，不要先做审批 UI。

### 1. 把停犁说清楚

**用户感到的：** 忙还是忙；但有一种闲是在盯他——不点一下，那边动不了。余光里不是多了一块监控，是牛偶尔抬头：别写了，有人在等你。

**现在的问题：** 停犁 ≈ 最近一轮写完了。卡在允许上时，日志最后一条常是 `tool_use` / `function_call`，现行规则会标成 **拉犁**。用户以为还在干活。

**合同：**

- 四态不拆。不出现第五个汇总格。
- 给 `waiting` 加只读 `waitWhy`：`next`（默认）/ `choose` / `allow`。
- 牛不出现任何批准按钮。点行 = 现有 `focusSession`，人去原 App 里点允许。
- 没有铁证就不标「等允许」。未完成的 tool 继续当拉犁。宁可漏叫，不要把出力误说成等你。

**用户看见 / 听见：**

| `waitWhy` | 副行 | 哞 |
|---|---|---|
| `next` | 停犁 | `{项目} 停犁了，正等你。` |
| `choose` | 停犁 · 等你选 | `{项目} 停犁了，在等你选一下。` |
| `allow` | 停犁 · 等允许 | `{项目} 停犁了，在等你点允许。` |

- 有 `allow` / `choose` 时：牛用已有 `attention` 抬头盯；头顶可变成 `1 头停犁等你点允许`。
- 普通停犁：休息姿态，不新画审批脸，不贴红点。
- 只在状态或 `waitWhy` 变化时叫一声，不要每 2.5s 重复。
- 检测：只吃日志里的高置信提问 / 权限事件。找不到就保持现在的「最近一轮已完成」，不要假装看见了允许。
- Claude 允许框可能只活在 TTY，jsonl 要批准后才有下一条——认不出就诚实。

**代码入口：** `electron/scan.js`（`inferJsonlActivity`、`STATUS_LABEL`）、`renderer/app.js`（`STATUS_TEXT` / `STATUS_CHANGE` / `MOOD_COPY`、悬停 caption、列表副行）。

---

### 2. 停了太久再哞一声

**用户感到的：** 刚停下那一声他可以当没听见；过一阵还停着，牛再抱怨一句。不是闹钟，是「你还没理我」。

**现在的问题：** 碎嘴只在 **刚停下** 时叫（`announceStatusChanges`）。二十分钟后牛还在歇，他早忘了。

**合同：**

- 每轮停犁最多再催一声。普通停犁约 **20 分钟**，`waitWhy=allow` 约 **5 分钟**。
- 走现有「允许牛碎嘴」开关（`niulai.chatter`）。不另开开关。关掉碎嘴则整项消失。
- 牛在场：只姿态 + 哞，不弹系统通知。
- 牛被 ⌘⇧U 藏起：才用已有「牛来提醒你」系统通知；点通知把牛唤回。
- 他点过那一行、或该 session 又开始拉犁：不再催这一轮。
- 不催吃草、回棚。不 3/10/20 分钟连催三次。不推手机。

**用户听见：**

- 普通：`{项目} 都停了二十分钟了。`
- 等允许：`{项目} 等你点允许，都五分钟了。`
- 多头同时等：只叫最急的一头（allow > choose > next），尾巴：`另外 N 头也还在等。`

和第一项分工：第一声是报告，第二声是催。每轮停犁最多这两声。

**代码入口：** `renderer/app.js`（`announceStatusChanges`、`chatterEnabled`）、`electron/main.js`（`Notification` 标题已是「牛来提醒你」，目前只用于 Memo）。

---

### 3. 一行「正在犁什么」

**用户感到的：** 六个都在拉犁时，不用点开也能看出哪头在改文件、哪头在低头、哪头只是忙。那一行不再像标签，像牛刚抬眼看了一下地。

**现在的问题：** 列表主行是 `cwdName`，副行是 `Cursor · 拉犁 · 3 分钟前`。`title` 常被目录名盖住。悬停说「Cursor · 出力」——出力是牛的姿势，不是活。

**合同：**

- 只改现有副行和悬停那句牛话。不新开活动面板，行不改厚。
- 有文件：`正在改 middleware.ts` / `正在翻 schema.prisma` / 类似「正在跑测试」。
- 没有文件：沿用 拉犁 / 出力 / 低头，不编文件名。
- 不把 `Read` `Edit` `Bash`、diff、日志原文露出来。
- 停犁仍归第 1–2 项，不抢那一行。

**用户看见（拉犁时）：**

```
niul.ai
Cursor · 正在改 middleware.ts · 3 分钟前
```

看不清时仍是 `Cursor · 低头 · 1 分钟前`。悬停与副行同一句。

Grok 等已有 `generated_title` 的会话：标题可以当这一轮的名字，目录仍用来认路（未要求标题压过 `cwdName`，不要擅自改主行层级）。

**代码入口：** `electron/scan.js`（`title`、`statusText` 已有「出力」「低头」）、`renderer/app.js` `renderSessionRows`、`pointCowAt` caption。

---

### 4. Token 条「Codex 还剩 N%」（已收窄）

**用户感到的：** 今日烧了多少还在；若某家 CLI 已经把班次写进日志，旁边多半句人话，告诉他会不会被窗口拦住。没有这张表的 Runtime，条上不会突然冒出百分比。

**现在的问题：** 今日 Token 是日历日合计，推不出滚动窗口。示例「Claude 14% · 4 小时」来自对面营销图，不是牛来能从 jsonl 加总出来的数。

**事实：**

- Codex：`token_count` 事件里已有 `rate_limits.primary.used_percent` / `window_minutes` / `resets_at`。就在 `tokens.js` 已经解析的那些行上，目前被丢掉了。本机样例是 7 天窗（`window_minutes: 10080`），不是 5 小时。
- Claude：`~/.claude/projects/**/*.jsonl` 只有每轮 `message.usage`，没有 5h/7d 剩余。官方窗口在 Anthropic 服务器；要数字就得 OAuth 联网。
- Cursor / Grok：没有可核对的订阅窗口。Grok `signals.json` 只有本会话上下文占用，不是套餐班次。

**合同：**

- 只加在现有 Token 条上，最多多半句。不新开用量页，不画进度条/饼图。
- **只展示本机日志里已经写明的窗口**（当下即 Codex `rate_limits`）。剩余百分比用 `100 - used_percent`，倒计时用 `resets_at`。
- **不为 Claude（或任何没有窗口字段的 Runtime）估算 5 小时。** 没有字段就不显示剩余百分比。Cursor 继续「Token 未公开」。
- 不为剩余额度新增网络请求。若以后要官方 Claude 窗口，另开一项，做成像大盘一样的可关偶发联网，不混进本次。
- 快没了（已用约 ≥80%，或重置不到约 1 小时）才哞一声；可关；不打断拉犁 / 等允许。窗口重置不报喜。
- 数字挂在现有 Token **30 秒缓存**上，不跟 2.5s session 轮询绑死。Codex 不另扫盘。

**用户看见（有 Codex 窗口时）：**

```
今日 Token
438k
Codex 还剩 70%
```

没有窗口的家：条上仍只是今日合计。快没了才哞：「Codex 额度快用完了。」

**代码入口：** `electron/tokens.js`（`codexTokens` 已读 `token_count`，加读 `payload.rate_limits`）、`renderer/app.js` `renderTokenUsage`、`renderer/index.html` `#tokenStrip`。

---

### 5. 点谁落到更准（已收窄）

**用户感到的：** 还是点那一行。IDE 尽量落到这个项目的窗口；终端里的 CLI 尽量唤起正在跑它的那个终端 App，而不是错的桌面端。不保证 tab/分屏。

**合同：**

- 不新开跳转 UI。失败不打开 Finder（有 App 目标时）。
- IDE：有 `cwd` 时用已有、却未使用的 `openBin` 打开该项目；失败退回 `open -a`。
- CLI：点击时用已有 `ps` 认父进程终端（iTerm / Ghostty / Warp / Terminal 等），前置那个终端 App，而不是 Claude.app。
- 做不到 tab/pane 就退回现在的唤起 App，不报假成功。
- 不在 2.5s 扫描里为跳转跑 AppleScript / 辅助功能轮询。精确 tab 明确不做。

**代码入口：** `electron/focus.js`（`openBin` 已在 `config/runtimes.default.json` 但未使用）、`test/focus.test.js`。扫描若需带 pid，只多存字段，不增轮询。

---

### 6. 看不清就说看不清（已收窄）

**用户感到的：** 这一行是猜的时候，副行写「看不太清」，悬停牛说「这头 Cursor 我看不太清」。进程在、列表空时，空态点名，仍进齿轮。看清了不说话。

**合同：**

- 只把已有 `statusConfidence === "low"` 说出来：副行 + 悬停牛话。四态不变。medium 不当看不清。
- 已启用 Runtime 进程在、该 runtime 行数为 0：空态点名，按钮打开现有齿轮。
- 没有 Doctor、不修 hook、不新画挠头图。
- 不新增扫描或网络；不每 2.5 秒碎嘴。

**代码入口：** `electron/scan.js`（`statusConfidence` 已算）、`renderer/app.js` 列表与空态。

---

### 7. 小牛跟着犁（已收窄）

**用户感到的：** 父行仍是一行。有子代理正在干活时，副行/悬停多「带着 N 头小牛」。点的还是父会话。小牛停了这半句消失。

**合同：**

- N = 此刻 working 的子代理 jsonl 数（Cursor 已 walk 的那些，不含父文件）。N 为 0 不写。
- 不展开列表，不新画小牛，不点小行。
- 不扩大扫描；沿用 Cursor `slice(0, 12)`。其他 Runtime 仅当已有「子目录不单列、卷进父行」的合同时才跟。

**代码入口：** `electron/scan.js` `detectCursor`、`renderer/app.js` 副行与悬停 caption。

---

### 不做：头数影响牛有多忙

用户 2026-08-20 明确说「这个不需要」。不按拉犁头数调节出力频率，不贴数字，不 hide-when-idle。气泡上已有「N 头在拉犁」足够。心情继续只分 working / waiting / offline。

---

### 8. 新 CLI 只读接入（政策，本轮不实现）

**用户感到的：** 日常为零。只有真的在跑、且本机有会话文件的新家，才会多一行。不为「26 个」改对方 config。

**合同：**

- 不为对标 26 加 hook 或一批新内置。本轮实现包不含名单扩张。
- 有稳定家目录 + 进程名 + jsonl/json（事件或诚实 mtime）的，**按需**再升内置；否则继续齿轮自定义 glob。
- 必须 hook 才能看见的 CLI，不接入。
- 新内置路径必须收紧，默认可关，没有事件就 `low`，不估状态。SQLite / VS Code globalStorage 要专用探测器，不塞进 glob。

**代码入口（将来按需）：** `config/runtimes.default.json`、`electron/scan.js`、`docs/runtime-monitoring.md`。现有 `detectCustom` 已覆盖逃生门。

---

## 「值得借」过完

本轮三刀见文首「本轮要实现」。下面两条不是本轮代码：头数（否决）、新 CLI（政策）。

---

## 只能借一层 / 明确不借

详见会话结论。签名（Developer ID）是体验债，不是调性，可做。菜单栏当第二监控不要做。

---

## 仓库事实（实现前先读）

| 文件 | 干什么 |
|---|---|
| `PRODUCT.md` | 定位、四态、原则、禁区 |
| `README.md` | 用户语言、安装、Runtime 名单 |
| `docs/runtime-monitoring.md` | 各家路径、事件优先、跳转顺序 |
| `electron/scan.js` | 扫描与四态 |
| `electron/tokens.js` | 今日 Token，不估算 |
| `electron/focus.js` | 前置 App；禁止把项目名当 App |
| `electron/memos.js` / `main.js` | 便签与系统通知 |
| `renderer/app.js` | 气泡、碎嘴、筛选、悬停看向哪一行 |
| `config/runtimes.default.json` | 内置 Runtime |

关键现状：

- 轮询约 2.5s；有事件合同的 Runtime 事件优先，否则 90s 热写入。
- 默认筛选只看「拉犁」。
- `mood`：有 working → working；否则 waiting+idle → waiting；否则 offline。
- 未签名；安装到 `~/Applications/牛来.app`。
- 版本 `0.1.3`。MIT。形象是电影《牛来》二创。

---

## 给实现 agent 的工作方式

1. 只实现已锁定且纳入打包的项。头数已否决。新 CLI 是政策，本轮不加名单。
2. 改动保持 Electron 桌宠，不引入 hook 安装器。
3. 文案用牛话，与现有碎嘴同一嗓子。
4. 检测边界写进 `docs/runtime-monitoring.md`，尤其是「无铁证不标 allow」、Codex 窗口只读本地。
5. 有测试的扫描/碎嘴/跳转逻辑补 `test/`。

产品过项已结束。用户要动手时按上面三刀实现，不要再把未锁定形状做进去。
