const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { inferJsonlActivity } = require("../electron/scan");

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
