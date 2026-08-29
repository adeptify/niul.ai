const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createGrassAlertTracker,
  grassAlert,
} = require("../renderer/grass-alert");

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
  };
}

test("grass alert requires a current low window", () => {
  const now = 1_000_000;
  assert.equal(
    grassAlert({ remainingPercent: 50, resetsAt: now + 2 * 60 * 60 * 1000 }, now),
    null
  );
  assert.equal(
    grassAlert({ remainingPercent: 10, resetsAt: now - 1 }, now),
    null
  );
  assert.match(
    grassAlert({ remainingPercent: 20, resetsAt: now + 2 * 60 * 60 * 1000 }, now).text,
    /额度快用完/
  );
});

test("grass alert fires once per rate-limit window across reloads", () => {
  const storage = memoryStorage();
  const now = 1_000_000;
  const rateLimit = {
    limitId: "codex",
    remainingPercent: 20,
    resetsAt: now + 2 * 60 * 60 * 1000,
  };
  const first = createGrassAlertTracker(storage);
  const alert = first.candidate(rateLimit, now);
  assert.ok(alert);
  first.commit(alert.key);

  rateLimit.remainingPercent = 15;
  assert.equal(first.candidate(rateLimit, now + 1000), null);
  const reloaded = createGrassAlertTracker(storage);
  assert.equal(reloaded.candidate(rateLimit, now + 2000), null);

  const nextWindow = { ...rateLimit, resetsAt: rateLimit.resetsAt + 7 * 86400000 };
  assert.ok(reloaded.candidate(nextWindow, now + 3000));
});

test("grass alert selects the tightest provider window and names it", () => {
  const now = 1_000_000;
  const alert = grassAlert(
    {
      providers: [
        {
          id: "claude",
          label: "Claude",
          windows: [
            { id: "weekly", label: "7 天", remainingPercent: 18, resetsAt: now + 3600_000 },
          ],
        },
        {
          id: "codex",
          label: "Codex",
          windows: [
            { id: "five-hour", label: "5 小时", remainingPercent: 9, resetsAt: now + 3600_000 },
          ],
        },
      ],
    },
    now
  );
  assert.match(alert.text, /Codex 5 小时额度快用完/);
  assert.match(alert.key, /codex:five-hour/);
});
