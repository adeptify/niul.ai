const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createWaitingTransitionTracker,
  notificationCopy,
  trayPresentation,
  waitingRows,
} = require("../electron/menu-bar-state");

function row(id, status, waitWhy = "", activityAt = 1_000) {
  return { id, status, waitWhy, activityAt, cwdName: id, label: "Codex" };
}

test("menu bar view prioritizes authorization, choice, then ordinary waits", () => {
  const rows = waitingRows([
    row("next", "waiting", "next", 100),
    row("choose", "waiting", "choose", 300),
    row("allow-later", "waiting", "allow", 400),
    row("allow-earlier", "waiting", "allow", 200),
    row("working", "working"),
  ]);
  assert.deepEqual(
    rows.map((item) => item.id),
    ["allow-earlier", "allow-later", "choose", "next"]
  );
});

test("tray attention reflects pending work until the session leaves waiting", () => {
  assert.deepEqual(trayPresentation({ rows: [] }), {
    attention: false,
    waitingCount: 0,
    tooltip: "牛来",
  });
  assert.deepEqual(trayPresentation({ rows: [row("a", "waiting")] }), {
    attention: true,
    waitingCount: 1,
    tooltip: "牛来 · 1 个任务等你",
  });
});

test("the first observation establishes a baseline without a notification storm", () => {
  const tracker = createWaitingTransitionTracker();
  assert.deepEqual(tracker.observe([row("already", "waiting")]), []);
  assert.deepEqual(tracker.observe([row("already", "waiting")]), []);
});

test("entering waiting and upgrading to an explicit decision each notify once", () => {
  const tracker = createWaitingTransitionTracker();
  tracker.observe([row("a", "working")]);
  assert.deepEqual(
    tracker.observe([row("a", "waiting", "next")]).map((item) => item.id),
    ["a"]
  );
  assert.deepEqual(tracker.observe([row("a", "waiting", "next")]), []);
  assert.deepEqual(
    tracker.observe([row("a", "waiting", "allow")]).map((item) => item.id),
    ["a"]
  );
  assert.deepEqual(tracker.observe([row("a", "waiting", "allow")]), []);
});

test("new sessions appearing after initialization can request attention", () => {
  const tracker = createWaitingTransitionTracker();
  tracker.observe([]);
  const events = tracker.observe([row("new", "waiting", "choose")]);
  assert.equal(events.length, 1);
  assert.match(notificationCopy(events[0], 2), /等你选一下/);
  assert.match(notificationCopy(events[0], 2), /另外 2 个任务/);
});
