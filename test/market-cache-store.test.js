const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  readMarketCache,
  sanitizeMarketCache,
  writeMarketCache,
} = require("../electron/market/cache-store");

function snapshot() {
  return {
    provider: "eastmoney",
    providerLabel: "东方财富",
    fetchedAt: 1_770_000_000_000,
    quotes: [{
      id: "sse",
      symbol: "1.000001",
      name: "untrusted name",
      shortName: "untrusted short name",
      region: "untrusted region",
      price: 3316.42,
      change: 5.93,
      changePct: 0.18,
      marketTime: 1_770_000_000_000,
      status: "stale",
    }],
  };
}

test("market cache round-trips validated quotes with canonical metadata", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "niulai-market-cache-"));
  const file = path.join(directory, "nested", "market-cache.json");
  writeMarketCache(file, snapshot());
  const restored = readMarketCache(file);

  assert.equal(restored.quotes.length, 1);
  assert.equal(restored.quotes[0].name, "上证指数");
  assert.equal(restored.quotes[0].region, "CN");
  assert.equal(restored.quotes[0].status, "stale");
});

test("market cache ignores malformed files and unknown symbols", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "niulai-market-cache-"));
  const file = path.join(directory, "market-cache.json");
  fs.writeFileSync(file, "not json");
  assert.equal(readMarketCache(file), null);
  assert.equal(sanitizeMarketCache({
    fetchedAt: 1,
    quotes: [{ ...snapshot().quotes[0], id: "unknown" }],
  }), null);
});
