const assert = require("node:assert/strict");
const test = require("node:test");

const { MarketReactionEngine } = require("../electron/market/reactions");

function snapshot(changePct, overrides = {}) {
  return {
    status: "fresh",
    stale: false,
    quotes: [
      {
        id: "sse",
        name: "上证指数",
        shortName: "上证",
        changePct,
        status: "fresh",
      },
    ],
    ...overrides,
  };
}

test("reaction engine primes the first snapshot and triggers on a 0.1% crossing", () => {
  const engine = new MarketReactionEngine({ globalCooldownMs: 0, perIndexCooldownMs: 0 });
  assert.equal(engine.process(snapshot(0.04), { now: 1_000 }), null);
  const event = engine.process(snapshot(0.11), { now: 2_000, thresholdPct: 0.1 });
  assert.equal(event.id, "sse");
  assert.equal(event.direction, "up");
  assert.equal(event.band, 0.1);
});

test("0.1% reaction rearms only after returning inside 0.05%", () => {
  const engine = new MarketReactionEngine({ globalCooldownMs: 0, perIndexCooldownMs: 0 });
  engine.process(snapshot(0.04), { now: 1_000 });
  assert.ok(engine.process(snapshot(0.11), { now: 2_000 }));
  assert.equal(engine.process(snapshot(0.09), { now: 3_000 }), null);
  assert.equal(engine.process(snapshot(0.12), { now: 4_000 }), null);
  assert.equal(engine.process(snapshot(0.04), { now: 5_000 }), null);
  assert.ok(engine.process(snapshot(0.11), { now: 6_000 }));
});

test("reaction engine selects the strongest simultaneous move", () => {
  const engine = new MarketReactionEngine({ globalCooldownMs: 0, perIndexCooldownMs: 0 });
  engine.process({
    status: "fresh",
    quotes: [
      { id: "sse", name: "上证指数", changePct: 0.04, status: "fresh" },
      { id: "hsi", name: "恒生指数", changePct: -0.03, status: "fresh" },
    ],
  }, { now: 1_000 });
  const event = engine.process({
    status: "fresh",
    quotes: [
      { id: "sse", name: "上证指数", changePct: 0.12, status: "fresh" },
      { id: "hsi", name: "恒生指数", changePct: -0.62, status: "fresh" },
    ],
  }, { now: 2_000 });
  assert.equal(event.id, "hsi");
  assert.equal(event.band, 0.5);
  assert.equal(event.additionalCount, 1);
});

test("stale snapshots never trigger reactions", () => {
  const engine = new MarketReactionEngine({ globalCooldownMs: 0, perIndexCooldownMs: 0 });
  engine.process(snapshot(0.04), { now: 1_000 });
  assert.equal(engine.process(snapshot(0.4, { status: "stale", stale: true }), { now: 2_000 }), null);
});
