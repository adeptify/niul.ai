# 大盘指数与牛的行情反应

## 背景与目标

牛来目前只用本机 AI Session 驱动桌宠状态。第一期行情能力需要在不改变产品主任务的前提下，使用东方财富免 Key 接口展示中、港、美主要指数，并让牛在指数日涨跌幅跨过指定门槛时做一次克制的临时反应。

行情是 Session 监控的次级信息。Agent 完成、等待用户等事件必须始终优先，行情失败也不能影响本机 Session 扫描。

## 当前行为与问题证据

- `electron/main.js` 只注册 Session、配置、Memo 和窗口相关 IPC，没有独立的远程数据服务。
- `renderer/app.js` 的 `mood` 由 Session snapshot 决定；状态变化直接调用 `showCaption`，尚无跨来源事件优先级。
- `renderer/index.html` 的气泡只展示 Session 汇总、Token、筛选和列表，没有行情区域。
- 用户配置通过 `electron/config.js` 合并 `config/runtimes.default.json`，适合增加向后兼容的 `market` 配置。

## 范围

1. 定义可替换的 `IndexProvider` 数据合同。
2. 实现无 Key 的 `EastmoneyIndexProvider`，一次获取 8 个指数。
3. 实现独立的 `MarketService`：超时、缓存、轮询建议、失败退避和过期判断。
4. 通过 Electron IPC 向 Renderer 提供标准化行情 snapshot。
5. 在展开的现有气泡中展示 4×2 指数牌。
6. 增加显示大盘、行情反应和灵敏度设置；默认门槛为 `0.1%`。
7. 实现跨档触发、回滞、冷却、聚合与 Agent 优先级。
8. 为 Provider、Service、反应规则和配置迁移补测试。

## 非目标

- 自选股、个股搜索、K 线、分时图、成交量、新闻和投资建议。
- Apple「股市」App 对接。
- 系统级行情通知、登录、云同步或用户自定义指数代码。
- 本期不实现第二个 Provider，也不在普通设置中暴露 API 地址。

## 用户场景

1. 用户展开气泡，可直接看到上证、深证、创业板、沪深300、恒生、标普500、纳指100和道琼斯的点位与日涨跌幅。
2. 某指数的日涨跌幅首次跨过 `+0.1%` 或 `-0.1%`，牛短暂抬头并播报一次；后续同档小幅波动不重复播报。
3. 行情事件与 Agent 等待事件同时发生，Agent 事件先播，行情只保留短时间内最新且最重要的一条。
4. 东财请求失败时继续显示最后成功数据及过期时间，且 Session 功能正常。
5. 用户关闭“显示大盘”后停止行情请求；关闭“行情反应”后仍展示数据但不主动播报。

## 方案与关键决策

### 数据合同

Provider 输出统一为：

```js
{
  provider: "eastmoney",
  fetchedAt: 0,
  quotes: [{
    id, symbol, name, region,
    price, change, changePct,
    marketTime, status
  }]
}
```

Renderer 不读取东财字段名，也不拼接第三方 URL。Provider 必须允许部分指数成功，异常值不能覆盖上一份有效 quote。

### 内置指数

| id | 名称 | 东财 secid |
| --- | --- | --- |
| sse | 上证指数 | `1.000001` |
| szse | 深证成指 | `0.399001` |
| chinext | 创业板指 | `0.399006` |
| csi300 | 沪深300 | `1.000300` |
| hsi | 恒生指数 | `100.HSI` |
| spx | 标普500 | `100.SPX` |
| ndx | 纳指100 | `100.NDX` |
| djia | 道琼斯 | `100.DJIA` |

### 请求和容错

- 初始轮询间隔 60 秒；连续行情时间不变化后可退到 5 分钟。
- 单次请求超时 4 秒，同一时刻只允许一个请求在途。
- 失败后按 1、2、5 分钟退避；成功后恢复正常节奏。
- 保留最后成功 snapshot；最后一次成功请求超过 10 分钟标记为 stale，单个缺失指数保留上一笔并单独标记 stale。
- 首次 snapshot 只展示，不触发反应；stale/unavailable 数据不触发反应。

### 反应规则

- 基于“日涨跌幅跨档”而非单次轮询变化量。
- 档位为 `0.1%`、`0.5%`、`1%`、`2%`；设置的灵敏度决定最低启用档位。
- `0.1%` 档必须回到 `±0.05%` 内才重新武装，防止边界抖动。
- 同一指数、方向、档位冷却 20 分钟；全局行情台词间隔至少 90 秒。
- 多个事件同时出现时选绝对涨跌幅最大的一个，并附加“另外 N 个指数也有动静”。
- 行情只触发临时 expression/caption，不修改 Session 决定的 base `mood`。
- 优先级：Memo 到期 > Agent 等待/状态变化 > 用户主动交互 > 行情 > 环境动作。
- 行情事件排队最多 3 分钟；过期直接丢弃。

### 展示

- 行情牌继承现有黑色牧场观察牌视觉，位于展开气泡的 Session 汇总下方、Token 与筛选区域上方。
- 4×2 网格；每格显示短名称、点位、箭头和带正负号的涨跌幅。
- 中国用户习惯采用红涨绿跌，但同时保留箭头和符号，不能只依赖颜色。
- 标题显示数据源和更新时间；过期时降低对比并显示“数据可能延迟”。
- 悬停行情格时复用牛的 attention 行为，展示该指数的完整读数，不改变筛选或打开外链。

## 输入、输出与依赖

- 输入：东财 `ulist.np/get` JSON、用户 `market` 配置、前后两个有效 snapshot、当前 UI/Agent 事件状态。
- 输出：标准化行情 snapshot、零或多个行情 reaction candidate、行情牌 DOM 和临时牛反应。
- 外部依赖：Node/Electron 内置 `fetch` 与 `AbortController`，不新增 npm 依赖。

## 文件与模块边界

- `electron/market/index-provider.js`：Provider 合同、指数清单和标准错误。
- `electron/market/eastmoney-provider.js`：东财 URL、字段映射和响应校验。
- `electron/market/market-service.js`：缓存、并发去重、stale 与轮询/退避状态。
- `electron/market/reactions.js`：纯函数形式的跨档、回滞和事件选择。
- `electron/main.js`、`electron/preload.js`：IPC 接线；不得让 Renderer 直接联网。
- `electron/config.js`、`config/runtimes.default.json`：默认值和版本迁移。
- `renderer/index.html`、`renderer/styles.css`、`renderer/app.js`：行情牌、设置和事件优先级接入。
- `test/market-*.test.js`、`test/config.test.js`：核心行为验证。

## 验收标准

- [x] 一次请求可标准化返回 8 个指数，字段缺失和部分失败有确定行为。
- [x] 行情请求不阻塞、不改变 Session snapshot；关闭大盘后不请求。
- [x] 展开气泡能看到 8 个指数，加载、成功、过期和错误状态可读。
- [x] 首次加载不播报；跨过 `±0.1%` 只触发一次，回滞与冷却有效。
- [x] Agent 状态播报期间行情不打断；行情结束后恢复原 Session mood。
- [x] 设置保存后生效，旧配置自动获得安全默认值。
- [x] `prefers-reduced-motion` 下不增加非必要动画。
- [x] 全部自动测试通过，并完成真实东财响应和 Electron 界面检查。

## 完成证据

- `npm test`：39 项通过，0 失败。
- 真实东财请求：一次返回 8 个预期指数，snapshot 状态为 `fresh`。
- 浏览器 Preview（Electron 同一套 HTML/CSS）：720×960 下完成展开气泡、8 指数完整读数、设置滚动、禁用联动和指数聚焦播报检查。
- Impeccable detector：0 条机械界面问题。
- `npm run pack`：macOS arm64 应用打包成功，并从 `dist/mac-arm64/牛来.app` 正常启动。

## 验证命令

```bash
npm test
node --test test/market-provider.test.js test/market-service.test.js test/market-reactions.test.js test/config.test.js
npm start
```

## 假设与开放问题

- `0.1%` 被解释为指数“当日涨跌幅”的最低跨档触发阈值。
- 第一版只显示东财 Provider 名称，不显示只有一个选项的 Provider 下拉框。
- 东方财富端点缺少正式开发者 SLA；Provider 隔离是必要的替换边界，公开分发行情授权另行确认。
