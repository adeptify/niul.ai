const test = require("node:test");
const assert = require("node:assert/strict");
const {
  compactDisplayPath,
  formatTokens,
  rowStateText,
  sessionWorkSummary,
  timeAgo,
} = require("../renderer/session-view");

test("generic Agent running title falls back to the session state", () => {
  assert.equal(
    sessionWorkSummary(
      { title: "ChatGPT running", label: "ChatGPT", runtime: "chatgpt" },
      "未知目录",
      "拉犁"
    ),
    "拉犁"
  );
});

test("Agent prefix is removed while the useful work summary remains", () => {
  assert.equal(
    sessionWorkSummary(
      { title: "Grok 返修 B3 A3 六个 P1 阻断", label: "Grok Build", runtime: "grok" },
      "mcp",
      "拉犁"
    ),
    "返修 B3 A3 六个 P1 阻断"
  );
});

test("work summary without an Agent prefix stays unchanged", () => {
  assert.equal(
    sessionWorkSummary(
      { title: "Desktop Cleanup Delete Scripts", label: "Grok Build", runtime: "grok" },
      "oreal",
      "拉犁"
    ),
    "Desktop Cleanup Delete Scripts"
  );
});

test("completed work summary wins over the generic waiting reason", () => {
  assert.equal(
    sessionWorkSummary(
      {
        workSummary: "完成主页与牛记布局调整",
        title: "",
        label: "Codex",
        runtime: "codex",
      },
      "niul.ai",
      "Codex 已完成最近一轮"
    ),
    "完成主页与牛记布局调整"
  );
});

test("session view helpers keep paths, state, token, and relative-time formatting stable", () => {
  assert.equal(compactDisplayPath("/Users/yijunwang/code/niul.ai"), "~/code/niul.ai");
  assert.equal(
    rowStateText({
      status: "waiting",
      waitWhy: "allow",
      statusConfidence: "low",
      subagentsWorking: 2,
    }),
    "停犁 · 等允许 · 看不太清 · 带着 2 头小牛"
  );
  assert.equal(formatTokens(12500), "12.5K");
  assert.equal(timeAgo(1_000, 41_000), "40 秒前");
});
