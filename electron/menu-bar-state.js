(function exposeMenuBarState(global, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.niulaiMenuBarState = api;
})(typeof globalThis === "object" ? globalThis : this, function createMenuBarState() {
const WAIT_REASON_PRIORITY = Object.freeze({ allow: 0, choose: 1, next: 2 });

function waitWhy(row) {
  return row?.status === "waiting" ? row.waitWhy || "next" : "";
}

function waitingRows(rows = []) {
  return rows
    .filter((row) => row?.status === "waiting")
    .sort(
      (left, right) =>
        (WAIT_REASON_PRIORITY[waitWhy(left)] ?? 9) -
          (WAIT_REASON_PRIORITY[waitWhy(right)] ?? 9) ||
        Number(left.activityAt || left.mtime || 0) - Number(right.activityAt || right.mtime || 0)
    );
}

function trayPresentation(snapshot = {}) {
  const count = waitingRows(snapshot.rows || []).length;
  return {
    attention: count > 0,
    waitingCount: count,
    tooltip: count > 0 ? `牛来 · ${count} 个任务等你` : "牛来",
  };
}

function transitionKey(row) {
  return `${row?.status || ""}:${waitWhy(row)}`;
}

function shouldNotify(previous, current) {
  if (!current || current.status !== "waiting") return false;
  if (!previous) return true;
  if (previous.status !== "waiting") return true;
  const before = waitWhy(previous);
  const after = waitWhy(current);
  return before !== after && (after === "allow" || after === "choose");
}

function createWaitingTransitionTracker() {
  let initialized = false;
  let previousRows = new Map();

  function observe(rows = []) {
    const currentRows = new Map((rows || []).map((row) => [String(row.id), row]));
    if (!initialized) {
      initialized = true;
      previousRows = currentRows;
      return [];
    }

    const events = [];
    for (const [id, row] of currentRows) {
      const previous = previousRows.get(id);
      if (shouldNotify(previous, row) && transitionKey(previous) !== transitionKey(row)) {
        events.push(row);
      }
    }
    previousRows = currentRows;
    return waitingRows(events);
  }

  function reset() {
    initialized = false;
    previousRows = new Map();
  }

  return { observe, reset };
}

function notificationCopy(row, extraCount = 0) {
  const name = row?.cwdName || row?.title || row?.label || "这头";
  const reason =
    waitWhy(row) === "allow"
      ? "等你点允许"
      : waitWhy(row) === "choose"
        ? "等你选一下"
        : "完成了，等你继续";
  return `${name} ${reason}。${extraCount > 0 ? ` 另外 ${extraCount} 个任务也在等。` : ""}`;
}

return {
  WAIT_REASON_PRIORITY,
  createWaitingTransitionTracker,
  notificationCopy,
  trayPresentation,
  waitingRows,
  waitWhy,
};
});
