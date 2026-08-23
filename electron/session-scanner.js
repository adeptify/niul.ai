const { Worker } = require("node:worker_threads");
const { cachedSnapshotAfterFailure } = require("./scan-recovery");

function createSessionScanner({
  workerPath,
  getConfig,
  onSnapshot = (snapshot) => snapshot,
  createWorker = (filename) => new Worker(filename),
  recoverSnapshot = cachedSnapshotAfterFailure,
}) {
  let worker = null;
  let inFlight = null;
  let requestId = 0;
  let lastSnapshot = null;

  function finish(message = {}) {
    if (!inFlight || message.id !== inFlight.id) return;
    const { resolve, reject } = inFlight;
    inFlight = null;
    if (message.snapshot) {
      lastSnapshot = message.snapshot;
      try {
        resolve(onSnapshot(lastSnapshot));
      } catch (error) {
        reject(error);
      }
      return;
    }
    const error = new Error(message.error?.message || "Session scan failed");
    const fallback = recoverSnapshot(lastSnapshot, error);
    if (fallback) resolve(fallback);
    else reject(error);
  }

  function ensureWorker() {
    if (worker) return worker;
    worker = createWorker(workerPath);
    worker.on("message", finish);
    worker.on("error", (error) => {
      if (inFlight) finish({ id: inFlight.id, error: { message: error.message } });
    });
    worker.on("exit", () => {
      worker = null;
      if (inFlight) {
        finish({ id: inFlight.id, error: { message: "Session scan worker stopped" } });
      }
    });
    return worker;
  }

  function scan() {
    if (inFlight) return inFlight.promise;
    const id = ++requestId;
    let resolve;
    let reject;
    const promise = new Promise((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    inFlight = { id, promise, resolve, reject };
    try {
      ensureWorker().postMessage({ id, config: getConfig() });
    } catch (error) {
      finish({ id, error: { message: error.message } });
    }
    return promise;
  }

  function stop() {
    const current = worker;
    worker = null;
    return current?.terminate();
  }

  return {
    getLastSnapshot: () => lastSnapshot,
    isScanning: () => Boolean(inFlight),
    scan,
    stop,
  };
}

module.exports = { createSessionScanner };
