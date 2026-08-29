# Claude / Codex 订阅额度

## 背景与目标

牛来已经能从本机 Session 日志统计 Codex、Claude Code、Grok Build 和 Gemini CLI 的“今日 Token”，但订阅额度仍是一个写死为 Codex 的单窗口字段：只能展示一项剩余百分比，也只能播报“Codex 额度快用完了”。

本轮参考 [ZaynJarvis/agent-usage](https://github.com/ZaynJarvis/agent-usage) 在 2026-08-30 的公开实现，按牛来的 JavaScript / Electron 边界重新实现 Claude 与 Codex 的订阅额度采集。参考项目 README 声明 MIT，但仓库当前未包含独立 LICENSE 文件，因此只复刻数据来源、字段合同和容错思路，不逐段复制 Rust 源码。

完成等级为 **内部完整**：真实凭据、请求、缓存、失败恢复、首次启用、详情呈现和低额度提醒形成闭环；不把 Mock 或静态卡片当成真实可用。

## 当前证据

- `electron/tokens.js` 只读取 `rate_limits.primary`，输出单个 `rateLimit`。
- `renderer/app.js` 的 Token 条和 tooltip 只认 Codex；`renderer/grass-alert.js` 的提醒文案同样写死 Codex。
- 今日 Token 采集运行在扫描 Worker 中；远程额度请求不能阻塞 5 秒一次的 Session 扫描。
- Claude Code 官方状态数据包含 5 小时和 7 天窗口；参考项目通过 Claude OAuth usage 响应额外识别 Fable 的 model-scoped 周窗口。
- Codex 官方 Usage 页面和 `/status` 展示额度；参考项目通过 `chatgpt.com/backend-api/wham/usage` 获取 5 小时及周窗口。该端点不是公开稳定 API。
- 基线 `npm test` 为 195/195 通过。

## 用户场景

1. 用户在设置中主动开启“订阅额度”，牛来说明会读取本机 Claude Code / Codex 登录凭据，并只把凭据发送给对应供应商域名。
2. 今日 Token 条同时承担额度入口；用户不打开详情时可扫到 Claude 与 Codex 各自最紧张窗口的剩余百分比。
3. 点击 Token 条，在同一气泡内打开“订阅额度”工作区，看到 Claude 5 小时、7 天、Fable 独立额度，以及 Codex 5 小时、7 天额度和重置时间。
4. 某一 Provider 未登录、凭据过期、网络失败或响应字段变化时，另一家仍正常展示；有旧数据时保留并标记“上次数据”，没有旧数据时给出可操作提示。
5. 任一当前窗口剩余不高于 20%，或距重置不足 1 小时时，牛只按 Provider + 窗口 + 重置时间提醒一次。

## 范围

### 采集

- Claude：
  - 从 macOS Keychain 的 `Claude Code-credentials[-<config-dir-sha8>]` 读取 OAuth access token；旧安装回退到 `$CLAUDE_CONFIG_DIR/.credentials.json`。
  - 请求 `https://api.anthropic.com/api/oauth/usage`。
  - 标准化 `five_hour`、`seven_day`，并从明确命名的 model-scoped weekly limit 识别 Fable；不猜测实验字段。
- Codex：
  - 从 `$CODEX_HOME/auth.json` 只读 access token 与 account id。
  - 请求 `https://chatgpt.com/backend-api/wham/usage`。
  - 标准化 `primary_window`、`secondary_window`，优先按窗口秒数确定 5 小时或 7 天标签。
- 两个 Provider 并行请求，单次超时 8 秒；成功后 5 分钟内复用缓存。
- 失败按 1、2、5 分钟退避；保留最后一次成功数据，超过 15 分钟标 stale。
- 不刷新、不覆盖任何供应商凭据；401/403 只提示用户重新运行对应 CLI 登录。

### 数据合同

主进程向 Renderer 返回：

```js
{
  status: "fresh" | "stale" | "unavailable" | "disabled",
  fetchedAt,
  nextPollMs,
  providers: [{
    id, label, planType,
    status, errorCode, error, observedAt,
    windows: [{
      id, role, label,
      usedPercent, remainingPercent, resetsAt
    }]
  }]
}
```

任何凭据都不得进入该合同、Renderer、日志、缓存文件、错误消息或测试快照。

### 呈现

- 把现有 Token 条改成可点击入口，保留“今日 Token”主信息；右侧在有额度时显示每家最紧张窗口，如 `Claude 53% · Codex 83%`。
- 新增与大盘、牛记同级的 `quotaBoard` 气泡工作区：
  - 标题区：订阅额度、更新时间、手动刷新、关闭。
  - Provider 分组：Claude / Codex 作为一级扫描单位。
  - 窗口卡：标签、剩余百分比、进度轨、自然语言重置时间；高、中、低额度有颜色差异，但始终保留文字和数值。
  - Disabled / loading / missing credentials / unauthorized / network / stale / partial provider 均有明确状态。
- 设置新增“额度”页：总开关、Claude、Codex 两个 Provider 开关，以及隐私和“不公开稳定 API”说明。默认关闭，升级不静默读取钥匙串。
- Preview API 提供完整额度快照，以便不触碰真实账号即可做视觉 QA。

## 非目标

- 本轮不实现 Gemini、Cursor、Grok 或其他供应商的订阅额度。
- 不统计或推算订阅对应的绝对 Token 数；上游只提供百分比时只展示百分比。
- 不购买额度、不自动刷新登录、不写供应商凭据、不上传 Session 或 Prompt。
- 不读取 Claude Desktop 的 Chromium 登录、Cookies 或子进程临时 token；Claude Desktop 登录与独立 Claude Code 登录不共享时，明确引导 `claude auth login`。
- 不把额度做成新的 Dashboard 或常驻大型区域；它仍是 Session 监控下的次级信息。
- 不制作 DMG/ZIP、不发布版本、不改版本号。

## 模块与调用链

```text
Renderer quota IPC
  -> electron/main.js
  -> quota/quota-service.js（缓存、并发、退避、stale）
  -> quota/providers.js（凭据只读、请求、字段标准化）
  -> Claude / Codex 官方域名
```

额度服务独立于 `scan-worker.js`。5 秒 Session 扫描不等待网络；Renderer 使用独立低频额度轮询，并把最新额度快照交给 Token 条、详情工作区和提醒逻辑消费。

```text
quota snapshot
  -> renderer/quota-view.js（纯格式化、摘要、最低窗口选择）
  -> renderer/app.js（DOM、工作区、刷新和设置接线）
  -> renderer/grass-alert.js（跨 Provider 的一次性低额度提醒）
```

## 配置与兼容性

默认配置新增：

```json
{
  "quota": {
    "enabled": false,
    "providers": { "claude": true, "codex": true }
  }
}
```

- 配置版本递增；旧用户升级后保持关闭，现有 Runtime、外观、大盘和牛群偏好不变。
- Provider 开关只决定远程额度采集，不影响 Session 扫描和今日 Token。
- 关闭总开关时停止请求并清掉内存中的额度快照，不删除用户凭据。

## 验收标准

1. Claude normalizer 覆盖 5 小时、7 天、Fable、缺字段、非法百分比和过期窗口。
2. Codex normalizer 覆盖 primary/secondary、按秒数识别窗口、计划名和缺字段。
3. 凭据读取只返回所需字段；错误消息不包含 token；实现不写 `auth.json` 或 Claude credentials。
4. QuotaService 覆盖并发单飞、5 分钟缓存、部分 Provider 失败、退避、最后有效值和 stale。
5. Session 扫描在额度请求超时/失败时仍按原节奏返回。
6. 默认升级后额度关闭；开启、Provider 开关和保存重扫均工作。
7. Token 条在 fresh/stale/disabled/unavailable 下使用正确摘要，并可键盘打开详情。
8. 详情页完整展示 Claude、Fable、Codex 窗口；加载、未登录、过期凭据、网络失败和旧数据状态可辨认。
9. 低额度提醒按 Provider + 窗口 + resetsAt 去重，不再写死 Codex。
10. 所有 JavaScript 通过 `node --check`；定向测试和 `npm test` 全绿；`npm run pack` 成功。
11. 真实 Electron Preview smoke 覆盖深/浅色、448px 桌面气泡和窄菜单栏气泡；一次视觉检查后的修正通过第二次确认。

## 风险与处理

- **非公开端点变化**：Provider 层隔离字段，未知响应变成 `BAD_RESPONSE`；UI 明示暂不可用，不影响 Session。
- **钥匙串权限提示**：默认关闭，只有用户显式启用 Claude 时才读取；读取失败不反复弹窗，遵守服务退避。
- **Claude Desktop 边界**：桌面 App 会把短期 OAuth token 私下注入自己启动的 Claude Code 子进程，不提供可供牛来安全复用的标准凭据；牛来只支持独立 Claude Code 的标准登录，并在错误文案中区分“正在运行”和“已登录”。
- **安全边界**：access token 仅存在于主进程请求栈；不自动 refresh，避免修改其他 App 的登录状态。
- **信息密度**：Token 条只显示 Provider 最低余量；所有窗口放在点击后的工作区，保持日常界面低干扰。
- **百分比语义**：上游多为 `used`，内部统一换算并展示 `remaining`；测试固定这条转换，避免把 88% 已用误写成还剩。

## 验收结果（2026-08-30）

- `node --check`：Renderer、Provider 与 QuotaService 全部通过。
- `npm test`：230/230 通过；额度新增覆盖 Provider 正常化、只读凭据、请求头安全、缓存/单飞/退避/stale、摘要格式、设置迁移和跨 Provider 提醒。
- `npm run pack`：macOS arm64 目录包成功生成于 `dist/mac-arm64/牛来.app`；首次沙箱内尝试被本机代理权限拦截，获准后在沙箱外重跑成功。
- 真实 Electron 隐藏窗口 smoke：2 个 Provider、5 个窗口均渲染，摘要为 `Claude 53% · Codex 76%`，无横向溢出。
- 浏览器视觉 QA：深色、浅色、448px 桌面宽度和窄宽度通过；fresh、disabled、设置开关、Provider 禁用、入口跳转、关闭后焦点回退和 `aria-expanded` 均验证。
- Impeccable 静态检测返回 0 条 finding；因本地缺少 HTML parser 模块而使用降级正则模式，视觉与 DOM 实测补足了布局、状态和溢出检查。
- 没有用本机真实 Claude / Codex 凭据发起联网 smoke：额度能力默认关闭，QA 使用同合同 Preview 与 mocked fetch，避免在未经用户显式开启时读取钥匙串。
- 实机诊断确认 `/Applications/Claude.app` 正在运行并启动了内置 Claude Code，但独立 `claude auth status` 为 `loggedIn: false`；发布文案已明确 Claude Desktop 登录不共享，避免把“运行中”误报成“已具备可读取登录”。
