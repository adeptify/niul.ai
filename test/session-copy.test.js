const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const appSource = fs.readFileSync(
  path.resolve(__dirname, "../renderer/app.js"),
  "utf8"
);

function loadFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `missing ${name}`);
  const open = appSource.indexOf("{", start);
  let depth = 0;
  for (let index = open; index < appSource.length; index += 1) {
    if (appSource[index] === "{") depth += 1;
    if (appSource[index] === "}") depth -= 1;
    if (depth === 0) {
      return vm.runInNewContext(`(${appSource.slice(start, index + 1)})`);
    }
  }
  throw new Error(`unterminated ${name}`);
}

test("generic Agent running title falls back to the session state", () => {
  const sessionWorkSummary = loadFunction("sessionWorkSummary");
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
  const sessionWorkSummary = loadFunction("sessionWorkSummary");
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
  const sessionWorkSummary = loadFunction("sessionWorkSummary");
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
  const sessionWorkSummary = loadFunction("sessionWorkSummary");
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
