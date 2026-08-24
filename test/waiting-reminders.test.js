const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createWaitingReminderEngine,
  withWaitingReminder,
} = require("../electron/waiting-reminders");

function waiting(id, waitWhy, activityAt = 0) {
  return {
    id,
    status: "waiting",
    waitWhy,
    activityAt,
    cwdName: id,
  };
}

test("claims one reminder after the waiting threshold", () => {
  const engine = createWaitingReminderEngine();
  const startedAt = 1_000;
  engine.observe([waiting("session-a", "next", startedAt)], startedAt);

  assert.equal(engine.claimDue(startedAt + 19 * 60 * 1000), null);
  const due = engine.claimDue(startedAt + 20 * 60 * 1000);
  assert.equal(due.id, "session-a");
  assert.match(due.text, /二十分钟/);

  engine.complete(due.id, true);
  assert.equal(engine.claimDue(startedAt + 30 * 60 * 1000), null);
});

test("waitWhy changes preserve acknowledgement and reminder state", () => {
  const engine = createWaitingReminderEngine();
  const startedAt = 1_000;
  engine.observe([waiting("session-a", "next", startedAt)], startedAt);
  assert.equal(engine.acknowledge("session-a"), true);

  engine.observe([waiting("session-a", "allow", startedAt + 1_000)], startedAt + 1_000);
  assert.equal(engine.claimDue(startedAt + 30 * 60 * 1000), null);
  assert.equal(engine.stateFor("session-a").acknowledged, true);
});

test("failed delivery can retry but successful delivery cannot", () => {
  const engine = createWaitingReminderEngine();
  const startedAt = 1_000;
  engine.observe([waiting("session-a", "allow", startedAt)], startedAt);

  const first = engine.claimDue(startedAt + 5 * 60 * 1000);
  engine.complete(first.id, false);
  const retry = engine.claimDue(startedAt + 5 * 60 * 1000 + 1);
  assert.equal(retry.id, "session-a");

  engine.complete(retry.id, true);
  assert.equal(engine.claimDue(startedAt + 10 * 60 * 1000), null);
});

test("leaving waiting starts a new reminder round", () => {
  const engine = createWaitingReminderEngine();
  const startedAt = 1_000;
  engine.observe([waiting("session-a", "allow", startedAt)], startedAt);
  const first = engine.claimDue(startedAt + 5 * 60 * 1000);
  engine.complete(first.id, true);

  engine.observe([{ id: "session-a", status: "working" }], startedAt + 6 * 60 * 1000);
  const restartedAt = startedAt + 7 * 60 * 1000;
  engine.observe([waiting("session-a", "allow", restartedAt)], restartedAt);
  assert.equal(engine.claimDue(restartedAt + 5 * 60 * 1000).id, "session-a");
});

test("reminder copy counts all other waiting sessions", () => {
  const engine = createWaitingReminderEngine();
  const startedAt = 1_000;
  engine.observe(
    [
      waiting("session-a", "allow", startedAt),
      waiting("session-b", "next", startedAt),
      waiting("session-c", "choose", startedAt),
    ],
    startedAt
  );

  const due = engine.claimDue(startedAt + 20 * 60 * 1000);
  assert.equal(due.id, "session-a");
  assert.equal(due.extraCount, 2);
  assert.match(due.text, /另外 2 头/);
  engine.complete(due.id, true);
  assert.equal(engine.claimDue(startedAt + 20 * 60 * 1000 + 1), null);
});

test("visible reminder metadata never mutates the cached snapshot", () => {
  const cached = { scannedAt: 1, rows: [] };
  const response = withWaitingReminder(cached, { id: "session-a", text: "提醒" });
  assert.notEqual(response, cached);
  assert.equal(cached.waitingReminder, undefined);
  assert.equal(response.waitingReminder.id, "session-a");
  assert.equal(withWaitingReminder(cached, null), cached);
});

test("an immediate notification can suppress the same waiting row for one claim", () => {
  const engine = createWaitingReminderEngine();
  const startedAt = 1_000;
  engine.observe([waiting("session-a", "allow", startedAt)], startedAt);

  assert.equal(
    engine.claimDue(startedAt + 5 * 60 * 1000, ["session-a"]),
    null
  );
  assert.equal(engine.claimDue(startedAt + 5 * 60 * 1000 + 1).id, "session-a");
});
