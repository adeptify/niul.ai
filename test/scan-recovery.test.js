const test = require("node:test");
const assert = require("node:assert/strict");
const { cachedSnapshotAfterFailure } = require("../electron/scan-recovery");

test("scan failure keeps the last trusted snapshot without mutating the cache", () => {
  const cached = {
    scannedAt: 100,
    rows: [{ id: "session-one", status: "working" }],
  };

  const fallback = cachedSnapshotAfterFailure(cached, new Error("worker stopped"));

  assert.notEqual(fallback, cached);
  assert.deepEqual(fallback.rows, cached.rows);
  assert.equal(fallback.scanError, "worker stopped");
  assert.equal(cached.scanError, undefined);
});

test("first scan failure has no invented Session snapshot", () => {
  assert.equal(cachedSnapshotAfterFailure(null, new Error("offline")), null);
});
