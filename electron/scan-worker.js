const { parentPort } = require("node:worker_threads");
const { scan } = require("./scan");

parentPort.on("message", ({ id, config }) => {
  const startedAt = Date.now();
  try {
    const snapshot = scan(config);
    parentPort.postMessage({
      id,
      snapshot: {
        ...snapshot,
        scanDurationMs: Date.now() - startedAt,
      },
    });
  } catch (error) {
    parentPort.postMessage({
      id,
      error: {
        message: String(error?.message || error),
        stack: String(error?.stack || ""),
      },
    });
  }
});
