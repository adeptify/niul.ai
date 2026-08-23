const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createSessionScanner } = require("../electron/session-scanner");

function fixture() {
  const workers = [];
  class FakeWorker extends EventEmitter {
    postMessage(message) {
      this.lastMessage = message;
    }
    terminate() {
      this.terminated = true;
      return Promise.resolve(0);
    }
  }
  const scanner = createSessionScanner({
    workerPath: "/tmp/scan-worker.js",
    getConfig: () => ({ pollMs: 5000 }),
    onSnapshot: (snapshot) => ({ ...snapshot, accepted: true }),
    createWorker: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  });
  return { scanner, workers };
}

test("concurrent scans share one worker request and accept the successful snapshot once", async () => {
  const { scanner, workers } = fixture();
  const first = scanner.scan();
  const second = scanner.scan();
  assert.equal(first, second);
  assert.equal(workers.length, 1);
  assert.deepEqual(workers[0].lastMessage, { id: 1, config: { pollMs: 5000 } });
  workers[0].emit("message", { id: 1, snapshot: { rows: [], scannedAt: 10 } });
  assert.deepEqual(await first, { rows: [], scannedAt: 10, accepted: true });
  assert.equal(scanner.getLastSnapshot().scannedAt, 10);
});

test("a failed later scan returns the last trusted snapshot with recovery metadata", async () => {
  const { scanner, workers } = fixture();
  const first = scanner.scan();
  workers[0].emit("message", { id: 1, snapshot: { rows: [{ id: "one" }], scannedAt: 10 } });
  await first;
  const second = scanner.scan();
  workers[0].emit("error", new Error("worker failed"));
  const fallback = await second;
  assert.equal(fallback.rows[0].id, "one");
  assert.equal(fallback.scanError, "worker failed");
});

test("a first scan failure rejects and stop terminates the worker", async () => {
  const { scanner, workers } = fixture();
  const pending = scanner.scan();
  workers[0].emit("error", new Error("no first snapshot"));
  await assert.rejects(pending, /no first snapshot/);
  await scanner.stop();
  assert.equal(workers[0].terminated, true);
});
