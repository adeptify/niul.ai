const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { createMemoStore } = require("../electron/memos");

test("memo store persists reminders and only announces them once", (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "niulai-memos-"));
  const file = path.join(dir, "memos.json");
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));

  const store = createMemoStore(file);
  const memo = store.add({ text: "check the build", remindAt: Date.now() + 1000 });
  assert.equal(store.list().length, 1);
  assert.equal(store.due(memo.remindAt + 1).length, 1);
  assert.equal(store.due(memo.remindAt + 2).length, 0);

  const reloaded = createMemoStore(file);
  assert.equal(reloaded.list()[0].text, "check the build");
  assert.equal(reloaded.complete(memo.id), true);
  assert.equal(reloaded.list().length, 0);
});
