const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createFileWalker, readJson, safeExists, safeStat } = require("../electron/files");

test("safe file helpers preserve fallbacks for missing or malformed input", () => {
  const missing = path.join(os.tmpdir(), `niulai-missing-${process.pid}`);
  assert.equal(safeExists(missing), false);
  assert.equal(safeStat(missing), null);
  assert.deepEqual(readJson(missing, { fallback: true }), { fallback: true });
});

test("file walkers share depth and count limits without escaping their root", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "niulai-files-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "nested"));
  fs.writeFileSync(path.join(root, "one.jsonl"), "{}\n");
  fs.writeFileSync(path.join(root, "nested", "two.jsonl"), "{}\n");
  fs.writeFileSync(path.join(root, "nested", "skip.txt"), "skip");

  const walkFiles = createFileWalker({ maxDepth: 2, maxFiles: 1 });
  const files = walkFiles(root, (file) => file.endsWith(".jsonl"));
  assert.equal(files.length, 1);
  assert.equal(files[0].startsWith(root), true);
});
