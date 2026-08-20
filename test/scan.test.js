const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  countWorkingSubagents,
  describeToolActivity,
  inferJsonlActivity,
} = require("../electron/scan");

function fixture(records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "niulai-scan-"));
  const file = path.join(dir, "session.jsonl");
  fs.writeFileSync(file, records.map((record) => JSON.stringify(record)).join("\n"));
  return { dir, file };
}

function infer(runtime, file, online = true) {
  return inferJsonlActivity(runtime, file, {
    online,
    now: Date.now(),
    workingWindowMs: 90000,
  });
}

test("Cursor user turn stays working until turn_ended", (t) => {
  const { dir, file } = fixture([
    { role: "user", message: { content: [{ type: "text", text: "request" }] } },
  ]);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const state = infer("cursor", file);
  assert.equal(state.status, "working");
  assert.equal(state.confidence, "high");
});

test("Cursor turn_ended becomes waiting", (t) => {
  const { dir, file } = fixture([
    { role: "user", message: { content: [{ type: "text", text: "request" }] } },
    { role: "assistant", message: { content: [{ type: "text", text: "done" }] } },
    { type: "turn_ended" },
  ]);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(infer("cursor", file).status, "waiting");
});

test("Codex lifecycle distinguishes running and complete turns", (t) => {
  const running = fixture([{ type: "event_msg", payload: { type: "task_started" } }]);
  const complete = fixture([
    { type: "event_msg", payload: { type: "task_started" } },
    { type: "event_msg", payload: { type: "task_complete" } },
  ]);
  t.after(() => {
    fs.rmSync(running.dir, { recursive: true, force: true });
    fs.rmSync(complete.dir, { recursive: true, force: true });
  });
  assert.equal(infer("codex", running.file).status, "working");
  assert.equal(infer("codex", complete.file).status, "waiting");
});

test("missing runtime process is offline even for a hot file", (t) => {
  const { dir, file } = fixture([
    { role: "user", message: { content: [{ type: "text", text: "request" }] } },
  ]);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.equal(infer("cursor", file, false).status, "offline");
});

test("unanswered AskUserQuestion is waiting to choose, not working", (t) => {
  const { dir, file } = fixture([
    {
      type: "assistant",
      message: {
        content: [{ type: "tool_use", id: "call_1", name: "AskUserQuestion", input: { questions: [] } }],
      },
    },
  ]);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const state = infer("claude-code", file);
  assert.equal(state.status, "waiting");
  assert.equal(state.waitWhy, "choose");
});

test("answered AskUserQuestion does not stay on choose", (t) => {
  const { dir, file } = fixture([
    {
      type: "assistant",
      message: {
        content: [{ type: "tool_use", id: "call_1", name: "AskUserQuestion", input: { questions: [] } }],
      },
    },
    {
      type: "user",
      message: { content: [{ type: "tool_result", tool_use_id: "call_1", content: "ok" }] },
    },
    { type: "assistant", message: { content: [{ type: "text", text: "done" }] } },
  ]);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const state = infer("claude-code", file);
  assert.equal(state.waitWhy === "choose", false);
});

test("unanswered Edit stays working and is not marked allow", (t) => {
  const { dir, file } = fixture([
    {
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", id: "call_2", name: "Edit", input: { file_path: "/tmp/middleware.ts" } },
        ],
      },
    },
  ]);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const state = infer("claude-code", file);
  assert.equal(state.status, "working");
  assert.notEqual(state.waitWhy, "allow");
  assert.equal(state.label, "正在改 middleware.ts");
});

test("activity copy exposes only a basename and hides raw tool names", () => {
  assert.equal(
    describeToolActivity({
      name: "ReadFile",
      input: { path: "/Users/secret/project/schema.prisma" },
    }),
    "正在翻 schema.prisma"
  );
  assert.equal(
    describeToolActivity({ name: "Shell", input: { command: "npm test" } }),
    "正在跑测试"
  );
  assert.equal(
    describeToolActivity({ name: "Shell", input: { command: "git status" } }),
    ""
  );
});

test("Cursor child count includes only working subagents", () => {
  assert.equal(
    countWorkingSubagents(
      [
        { file: "parent.jsonl", state: { status: "working" } },
        { file: "child-a.jsonl", state: { status: "working" } },
        { file: "child-b.jsonl", state: { status: "waiting" } },
        { file: "child-c.jsonl", state: { status: "working" } },
      ],
      "parent.jsonl"
    ),
    2
  );
});

test("Codex approval event is waiting allow", (t) => {
  const { dir, file } = fixture([
    { type: "event_msg", payload: { type: "task_started" } },
    { type: "event_msg", payload: { type: "exec_approval_request", request_id: "approval-1" } },
  ]);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const state = infer("codex", file);
  assert.equal(state.status, "waiting");
  assert.equal(state.waitWhy, "allow");
});

test("completed Codex approval does not remain waiting allow", (t) => {
  const { dir, file } = fixture([
    { type: "event_msg", payload: { type: "task_started" } },
    { type: "event_msg", payload: { type: "exec_approval_request", request_id: "approval-1" } },
    { type: "event_msg", payload: { type: "task_complete" } },
  ]);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const state = infer("codex", file);
  assert.equal(state.status, "waiting");
  assert.equal(state.waitWhy, "next");
});

test("resolved approval request does not remain waiting allow", (t) => {
  const { dir, file } = fixture([
    { type: "event_msg", payload: { type: "task_started" } },
    { type: "event_msg", payload: { type: "exec_approval_request", request_id: "approval-1" } },
    {
      type: "event_msg",
      payload: { type: "exec_approval_response", request_id: "approval-1" },
    },
  ]);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const state = infer("codex", file);
  assert.equal(state.status, "working");
  assert.notEqual(state.waitWhy, "allow");
});

test("unkeyed approval resolution clears the latest request conservatively", (t) => {
  const { dir, file } = fixture([
    { type: "event_msg", payload: { type: "task_started" } },
    { type: "event_msg", payload: { type: "exec_approval_request", request_id: "approval-1" } },
    { type: "event_msg", payload: { type: "permission_resolved" } },
  ]);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const state = infer("codex", file);
  assert.equal(state.status, "working");
  assert.notEqual(state.waitWhy, "allow");
});

test("new Codex turn does not inherit an older approval request", (t) => {
  const { dir, file } = fixture([
    { type: "event_msg", payload: { type: "exec_approval_request" } },
    { type: "event_msg", payload: { type: "task_started" } },
  ]);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const state = infer("codex", file);
  assert.equal(state.status, "working");
  assert.notEqual(state.waitWhy, "allow");
});

test("mtime-only waiting stays low confidence", (t) => {
  const { dir, file } = fixture([{ type: "note", text: "no contract" }]);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const stale = Date.now() - 2 * 60 * 1000;
  fs.utimesSync(file, new Date(stale), new Date(stale));
  const state = infer("unknown-runtime", file);
  assert.equal(state.status, "waiting");
  assert.equal(state.confidence, "low");
  assert.equal(state.waitWhy, "next");
});
