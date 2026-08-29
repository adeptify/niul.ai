const assert = require("node:assert/strict");
const test = require("node:test");

const { QuotaService } = require("../electron/quota/quota-service");

function provider(id, behavior) {
  return { id, label: id.toUpperCase(), fetchQuota: behavior };
}

function quota(id, remainingPercent = 75) {
  return {
    id,
    label: id.toUpperCase(),
    windows: [
      {
        id: "five-hour",
        role: "five_hour",
        label: "5 小时",
        usedPercent: 100 - remainingPercent,
        remainingPercent,
        resetsAt: 9_999_999,
      },
    ],
  };
}

test("QuotaService shares concurrent provider requests and reuses the five-minute cache", async () => {
  let now = 1_000_000;
  let calls = 0;
  let resolveFetch;
  const pending = new Promise((resolve) => {
    resolveFetch = resolve;
  });
  const service = new QuotaService({
    providers: [
      provider("claude", async () => {
        calls += 1;
        await pending;
        return quota("claude");
      }),
    ],
    now: () => now,
  });
  const first = service.getSnapshot();
  const second = service.getSnapshot();
  resolveFetch();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  assert.deepEqual(a, b);
  now += 60_000;
  const cached = await service.getSnapshot();
  assert.equal(calls, 1);
  assert.equal(cached.status, "fresh");
});

test("QuotaService isolates a failed provider and preserves successful windows", async () => {
  const service = new QuotaService({
    providers: [
      provider("claude", async () => quota("claude", 53)),
      provider("codex", async () => {
        const error = new Error("Codex unavailable");
        error.code = "NETWORK";
        throw error;
      }),
    ],
    now: () => 1_000_000,
  });
  const snapshot = await service.getSnapshot();
  assert.equal(snapshot.providers.find((item) => item.id === "claude").status, "fresh");
  assert.equal(snapshot.providers.find((item) => item.id === "codex").status, "unavailable");
  assert.equal(snapshot.providers.find((item) => item.id === "codex").errorCode, "NETWORK");
  assert.equal(snapshot.status, "stale");
});

test("QuotaService keeps the last valid provider data after a refresh failure", async () => {
  let now = 1_000_000;
  let fail = false;
  const service = new QuotaService({
    providers: [
      provider("claude", async () => {
        if (fail) throw Object.assign(new Error("offline"), { code: "NETWORK" });
        return quota("claude", 42);
      }),
    ],
    now: () => now,
  });
  await service.getSnapshot();
  now += 300_001;
  fail = true;
  const stale = await service.getSnapshot();
  assert.equal(stale.status, "stale");
  assert.equal(stale.providers[0].windows[0].remainingPercent, 42);
  assert.equal(stale.providers[0].errorCode, "NETWORK");
});

test("QuotaService backs off failures and marks old cached data stale", async () => {
  let now = 1_000_000;
  let fail = false;
  let calls = 0;
  const service = new QuotaService({
    providers: [
      provider("codex", async () => {
        calls += 1;
        if (fail) throw Object.assign(new Error("offline"), { code: "NETWORK" });
        return quota("codex");
      }),
    ],
    now: () => now,
    staleAfterMs: 900_000,
  });
  await service.getSnapshot();
  now += 300_001;
  fail = true;
  const failed = await service.getSnapshot();
  assert.ok(failed.nextPollMs <= 60_000);
  const withinBackoff = await service.getSnapshot();
  assert.equal(calls, 2);
  assert.equal(withinBackoff.status, "stale");
  now += 1_000_000;
  const old = await service.getSnapshot();
  assert.equal(old.status, "stale");
});

test("QuotaService clears in-memory provider state when disabled", async () => {
  let calls = 0;
  const service = new QuotaService({
    providers: [provider("claude", async () => (calls += 1, quota("claude")))],
    now: () => 1_000_000,
  });
  await service.getSnapshot();
  assert.equal(service.states.size, 1);
  const disabled = await service.getSnapshot({ enabled: false });
  assert.equal(disabled.status, "disabled");
  assert.equal(service.states.size, 0);
});
