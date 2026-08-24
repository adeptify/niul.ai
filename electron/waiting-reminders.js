const DEFAULT_WAIT_NUDGE_MS = Object.freeze({
  next: 20 * 60 * 1000,
  choose: 20 * 60 * 1000,
  allow: 5 * 60 * 1000,
});

const WAIT_PRIORITY = Object.freeze({ allow: 0, choose: 1, next: 2 });

function waitWhy(row) {
  return row?.status === "waiting" ? row.waitWhy || "next" : "";
}

function initialSince(row, now) {
  const activityAt = Number(row?.activityAt || row?.mtime);
  return Number.isFinite(activityAt) && activityAt > 0 && activityAt <= now
    ? activityAt
    : now;
}

function reminderCopy(row, extraCount = 0) {
  const name = row.cwdName || row.title || row.label || "这头";
  let text =
    waitWhy(row) === "allow"
      ? `${name} 等你点允许，都五分钟了。`
      : `${name} 都停了二十分钟了。`;
  if (extraCount > 0) text += ` 另外 ${extraCount} 头也还在等。`;
  return text;
}

function withWaitingReminder(snapshot, reminder) {
  return reminder ? { ...snapshot, waitingReminder: reminder } : snapshot;
}

function createWaitingReminderEngine({
  thresholds = DEFAULT_WAIT_NUDGE_MS,
  now = () => Date.now(),
} = {}) {
  const watches = new Map();
  const pendingBatches = new Map();
  let waitingRows = new Map();

  function observe(rows = [], observedAt = now()) {
    waitingRows = new Map(
      rows
        .filter((row) => row?.status === "waiting")
        .map((row) => [String(row.id), row])
    );

    for (const id of watches.keys()) {
      if (!waitingRows.has(id)) watches.delete(id);
    }

    for (const [id, row] of waitingRows) {
      const why = waitWhy(row);
      const existing = watches.get(id);
      if (existing) {
        existing.waitWhy = why;
        existing.row = row;
        continue;
      }
      watches.set(id, {
        id,
        row,
        waitWhy: why,
        since: initialSince(row, observedAt),
        reminded: false,
        acknowledged: false,
        pending: false,
      });
    }
  }

  function claimDue(at = now(), excludedIds = []) {
    const excluded = new Set((excludedIds || []).map(String));
    const due = [...watches.values()]
      .filter((watch) => {
        if (excluded.has(watch.id)) return false;
        if (watch.reminded || watch.acknowledged || watch.pending) return false;
        const threshold = thresholds[watch.waitWhy] || thresholds.next;
        return at - watch.since >= threshold;
      })
      .sort(
        (a, b) =>
          (WAIT_PRIORITY[a.waitWhy] ?? 9) - (WAIT_PRIORITY[b.waitWhy] ?? 9) ||
          a.since - b.since
      );

    const watch = due[0];
    if (!watch) return null;
    const bundledIds = due.map((item) => item.id);
    for (const item of due) item.pending = true;
    pendingBatches.set(watch.id, bundledIds);
    const extraCount = Math.max(0, waitingRows.size - 1);
    return {
      id: watch.id,
      waitWhy: watch.waitWhy,
      text: reminderCopy(watch.row, extraCount),
      extraCount,
    };
  }

  function complete(id, delivered) {
    const key = String(id);
    const ids = pendingBatches.get(key) || [key];
    let changed = false;
    for (const bundledId of ids) {
      const watch = watches.get(bundledId);
      if (!watch) continue;
      watch.pending = false;
      if (delivered) watch.reminded = true;
      changed = true;
    }
    pendingBatches.delete(key);
    return changed;
  }

  function acknowledge(id) {
    const watch = watches.get(String(id));
    if (!watch) return false;
    watch.acknowledged = true;
    watch.pending = false;
    return true;
  }

  function stateFor(id) {
    const watch = watches.get(String(id));
    return watch ? { ...watch } : null;
  }

  return { acknowledge, claimDue, complete, observe, stateFor };
}

module.exports = {
  DEFAULT_WAIT_NUDGE_MS,
  createWaitingReminderEngine,
  reminderCopy,
  withWaitingReminder,
};
