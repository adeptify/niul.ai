const assert = require("node:assert/strict");
const test = require("node:test");

const { MarketService } = require("../electron/market/market-service");

function quote(marketTime = 1_770_000_000_000) {
  return {
    id: "sse",
    name: "上证指数",
    shortName: "上证",
    price: 3316.42,
    changePct: 0.18,
    marketTime,
    status: "fresh",
  };
}

test("MarketService caches successful data until the next poll", async () => {
  let now = 10_000;
  let calls = 0;
  const provider = {
    id: "test",
    label: "Test",
    async fetchQuotes() {
      calls += 1;
      return { provider: "test", providerLabel: "Test", fetchedAt: now, quotes: [quote()] };
    },
  };
  const service = new MarketService({ provider, now: () => now, timeoutMs: 100, pollMs: 60_000 });

  const first = await service.getSnapshot();
  now += 10_000;
  const cached = await service.getSnapshot();
  assert.equal(calls, 1);
  assert.equal(first.status, "fresh");
  assert.equal(cached.fetchedAt, first.fetchedAt);
  assert.equal(cached.nextPollMs, 50_000);
});

test("MarketService keeps the last snapshot and marks it stale after failures", async () => {
  let now = 20_000;
  let fail = false;
  const provider = {
    id: "test",
    label: "Test",
    async fetchQuotes() {
      if (fail) throw new Error("offline");
      return { provider: "test", providerLabel: "Test", fetchedAt: now, quotes: [quote()] };
    },
  };
  const service = new MarketService({
    provider,
    now: () => now,
    timeoutMs: 100,
    pollMs: 1_000,
    staleAfterMs: 10_000,
    backoffMs: [1_000],
  });

  await service.getSnapshot();
  fail = true;
  now += 11_000;
  const stale = await service.getSnapshot({ force: true });
  assert.equal(stale.status, "stale");
  assert.equal(stale.quotes[0].price, 3316.42);
  assert.match(stale.error, /offline/);
});

test("MarketService returns a disabled snapshot without fetching", async () => {
  let calls = 0;
  const service = new MarketService({
    provider: { id: "test", label: "Test", fetchQuotes: async () => { calls += 1; } },
  });
  const snapshot = await service.getSnapshot({ enabled: false });
  assert.equal(snapshot.status, "disabled");
  assert.equal(calls, 0);
});

test("MarketService retains the last valid quote when a later response is partial", async () => {
  let now = 30_000;
  let calls = 0;
  const provider = {
    id: "test",
    label: "Test",
    async fetchQuotes() {
      calls += 1;
      return {
        provider: "test",
        providerLabel: "Test",
        fetchedAt: now,
        quotes: calls === 1
          ? [quote(), { ...quote(), id: "hsi", name: "恒生指数", price: 25000 }]
          : [quote(1_770_000_001_000)],
      };
    },
  };
  const service = new MarketService({ provider, now: () => now, timeoutMs: 100, pollMs: 1_000 });

  await service.getSnapshot();
  now += 2_000;
  const partial = await service.getSnapshot();
  assert.equal(partial.quotes.length, 2);
  assert.equal(partial.quotes.find((item) => item.id === "hsi").status, "stale");
});
