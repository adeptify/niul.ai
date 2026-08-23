const port = Number(process.argv[2] || 9334);
const durationMs = Number(process.argv[3] || 600_000);
const intervalMs = Number(process.argv[4] || 30_000);
const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = pages.find((entry) => entry.type === "page");
if (!page) throw new Error(`No Electron page found on port ${port}`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
let nextId = 0;
const pending = new Map();
const protocolErrors = [];

socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message);
    pending.delete(message.id);
    return;
  }
  if (message.method === "Runtime.exceptionThrown") {
    protocolErrors.push(message.params?.exceptionDetails?.text || "Runtime exception");
  }
};

await new Promise((resolve) => {
  socket.onopen = resolve;
});

function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

await send("Runtime.enable");
await send("Runtime.evaluate", {
  expression: `(() => {
    window.__herdQaErrors = [];
    window.addEventListener("error", (event) => {
      window.__herdQaErrors.push(String(event.error?.stack || event.message || event.error));
    });
    window.addEventListener("unhandledrejection", (event) => {
      window.__herdQaErrors.push(String(event.reason?.stack || event.reason));
    });
  })()`,
});

const startedAt = Date.now();
const samples = [];
const sampleExpression = `JSON.stringify((() => {
  const nodes = [...document.querySelectorAll(".herd-actor")];
  const ids = nodes.map((node) => node.dataset.herdActorId);
  const fractions = [0.08, 0.22, 0.5, 0.78, 0.92];
  const unreachable = [];
  for (const node of nodes) {
    const hit = node.querySelector(".herd-hit");
    const rect = hit?.getBoundingClientRect();
    let reachable = false;
    if (rect && rect.width > 0 && rect.height > 0) {
      for (const fx of fractions) {
        for (const fy of fractions) {
          const x = rect.left + rect.width * fx;
          const y = rect.top + rect.height * fy;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          const actor = document.elementFromPoint(x, y)?.closest?.("[data-herd-actor-id]");
          if (actor?.dataset.herdActorId === node.dataset.herdActorId) reachable = true;
        }
      }
    }
    if (!reachable) unreachable.push(node.dataset.herdActorId);
  }
  return {
    elapsedMs: Date.now() - ${startedAt},
    actorCount: nodes.length,
    sessionCount: nodes.filter((node) => node.dataset.herdKind === "session").length,
    readyCount: nodes.filter((node) => node.classList.contains("is-ready")).length,
    uniqueIds: new Set(ids).size,
    unreachable,
    keyboardUnavailable: nodes
      .filter((node) => node.disabled || node.tabIndex < 0)
      .map((node) => node.dataset.herdActorId),
    rendererErrors: window.__herdQaErrors || [],
    firstReadyMs: Number(document.getElementById("cowStage")?.dataset.herdFirstReadyMs || 0),
  };
})())`;

while (Date.now() - startedAt <= durationMs) {
  const evaluated = await send("Runtime.evaluate", {
    expression: sampleExpression,
    returnByValue: true,
    awaitPromise: true,
  });
  const sample = JSON.parse(evaluated.result?.result?.value || "{}");
  const heap = await send("Runtime.getHeapUsage");
  sample.cdpHeap = heap.result;
  samples.push(sample);
  const remaining = durationMs - (Date.now() - startedAt);
  if (remaining <= 0) break;
  await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, remaining)));
}

const first = samples[0] || {};
const last = samples.at(-1) || {};
const heapSizes = samples.map((sample) => sample.cdpHeap?.usedSize || 0);
const summary = {
  durationMs: Date.now() - startedAt,
  samples: samples.length,
  actorCounts: [...new Set(samples.map((sample) => sample.actorCount))],
  readyCounts: [...new Set(samples.map((sample) => sample.readyCount))],
  uniqueIdCounts: [...new Set(samples.map((sample) => sample.uniqueIds))],
  unreachableSamples: samples
    .filter((sample) => sample.unreachable?.length)
    .map((sample) => ({ elapsedMs: sample.elapsedMs, ids: sample.unreachable })),
  keyboardFailures: samples
    .filter((sample) => sample.keyboardUnavailable?.length)
    .map((sample) => ({ elapsedMs: sample.elapsedMs, ids: sample.keyboardUnavailable })),
  rendererErrors: [...new Set(samples.flatMap((sample) => sample.rendererErrors || []))],
  protocolErrors: [...new Set(protocolErrors)],
  heapUsedStart: first.cdpHeap?.usedSize,
  heapUsedEnd: last.cdpHeap?.usedSize,
  heapUsedMax: Math.max(...heapSizes),
  firstReadyMs: first.firstReadyMs,
};

console.log(JSON.stringify(summary, null, 2));
socket.close();
