# 贡献指南 / Contributing

先谢谢你来。牛来是个小项目，但值得修的地方不少：bug、新 Runtime 检测、文档、甚至一头新牛，都欢迎。

## 开始之前

项目采用 [MIT License](LICENSE)。你提交的贡献，默认按同一许可证发布。

## 我能做什么

- **报 bug**：开 Issue，附上 macOS 版本、`node -v` 结果、运行方式（`npm start` 还是安装包）和复现步骤。
- **加 Runtime**：先读 [docs/runtime-monitoring.md](docs/runtime-monitoring.md) 的「覆盖表」，再对照 [electron/scan.js](electron/scan.js) 现有实现。
- **改桌宠**：界面在 [renderer/](renderer)，形象资产在 `assets/`。
- **改文档**：直接提 PR 就行。

## 开发环境

- macOS + Node 18+
- 在**已经能执行 `node -v`** 的终端里操作（nvm 用户注意 PATH）
- 用自己的 fork：

```bash
git clone git@github.com:<你的用户名>/niul.ai.git
cd niul.ai
npm install
npm start
```

跑全部测试：

```bash
npm test
```

只想扫一次、不弹窗口，可以跑：

```bash
node electron/scan.js
```

## 项目结构

```
config/runtimes.default.json   默认 Runtime 清单
electron/scan.js               扫描、Runtime 事件解析与四态
electron/tokens.js             本机今日 Token 统计与去重
electron/memos.js              本地牛记（Memo）与到点提醒
electron/focus.js              点击跳转
electron/main.js               透明置顶窗口
docs/runtime-monitoring.md     各家监控方案
```

## 手写配置

用户配置在 `~/Library/Application Support/牛来/config.json`，会与内置默认清单合并，升级后新内置 Runtime 照样出现。自定义 Runtime 也可以手写：

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

字段含义：

- `glob`：Session 目录或文件树（实现会递归找 `.json` / `.jsonl`）
- `process`：`ps` 里用来判断「进程在不在」的名字
- `openBin`：点击时若 PATH 上有这个命令，用它打开 `cwd`
- `focusApp`：AppleScript 前置的进程名

## 提 PR 的流程

1. 从 `master` 拉一个分支，名字能看出意图就行：`fix/scan-crash`、`feat/gemini-cli` 这种。
2. 改完先跑 `npm test`，确认全绿。
3. PR 描述写清楚：
   - 改了什么、为什么改
   - 测试怎么跑的
   - 如果动了界面，贴一张截图
4. 等至少一位维护者 review 后合入。

CI 里 `npm test` 会跑一遍；只有维护者打 `v*` tag 时才会触发打包发布（[release.yml](.github/workflows/release.yml)）。

## 代码约定

### 扫描与状态（最重要）

- 四态语义不能破坏：🟢 拉犁 / 🔵 停犁 / 🟡 吃草 / ⚫ 回棚。
- 有事件合同的 Runtime **必须事件优先**，不能用统一 `mtime` 兜底冒充（详见 [docs/runtime-monitoring.md](docs/runtime-monitoring.md)）。
- Token 只读本机日志里**明确的 usage**：不按文本长度估算，不把历史上下文算成新增消耗。
- 新增一个 Runtime，至少同步改四处：
  - `config/runtimes.default.json`：默认清单
  - `docs/runtime-monitoring.md`：覆盖表
  - `test/`：对应测试
  - README 的支持列表（如适用）

### 交互与动效

- 动效必须解释状态或用户操作，不引入持续高强度装饰动画。
- 尊重系统的「减少动态效果」偏好。
- 彩蛋要可取消、不阻塞监控——「哞拉松」就是标准：能进，也能出。

### 隐私底线

- 不上传 Session 内容，不接第三方统计。扫描、状态判断、Token、牛记全部留在本机。

### 风格

- 现有代码是 CommonJS，测试用 Node 内置 `node:test`，保持一致。
- 标识符用英文；提交信息中英皆可，一篇 PR 里尽量统一。
- 尽量不加依赖；必须加时，在 PR 里说明理由。

## 文档

README 是门面，保持「人话」风格：不堆术语、不写八股。改了行为或配置，记得同步 README。

## 完成后

合入后维护者会打 `v*` tag，CI 自动产出 dmg/zip，发布在 [Releases](https://github.com/adeptify/niul.ai/releases)。

辛苦，给牛加颗草 🌱
