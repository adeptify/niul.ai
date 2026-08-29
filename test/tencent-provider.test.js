const assert = require("node:assert/strict");
const test = require("node:test");

const {
  TencentIndexProvider,
  parseMarketTime,
  parseTencentQuotes,
} = require("../electron/market/tencent-provider");
const { MARKET_INDICES } = require("../electron/market/index-provider");

function line(key, { price, change, changePct, marketTime }) {
  const fields = Array(33).fill("");
  fields[3] = String(price);
  fields[30] = marketTime;
  fields[31] = String(change);
  fields[32] = String(changePct);
  return `v_${key}="${fields.join("~")}";`;
}

const PAYLOAD = [
  line("sh000001", { price: 3952.18, change: -4.39, changePct: -0.11, marketTime: "20260828161402" }),
  line("sz399001", { price: 13953.07, change: -95.81, changePct: -0.68, marketTime: "20260828161424" }),
  line("sz399006", { price: 3424.4, change: -48.95, changePct: -1.41, marketTime: "20260828161439" }),
  line("sh000300", { price: 4609.18, change: -21.1, changePct: -0.46, marketTime: "20260828161414" }),
  line("r_hkHSI", { price: 25584.79, change: 19.05, changePct: 0.07, marketTime: "2026/08/28 18:31:31" }),
  line("usINX", { price: 7711.76, change: -19.23, changePct: -0.25, marketTime: "2026-08-28 16:37:00" }),
  line("usNDX", { price: 29433.43, change: -208.13, changePct: -0.7, marketTime: "2026-08-28 17:15:59" }),
  line("usDJI", { price: 53559.99, change: -9.45, changePct: -0.02, marketTime: "2026-08-28 16:37:09" }),
].join("\n");

test("TencentIndexProvider fetches and normalizes all eight indices in one request", async () => {
  let requestedUrl;
  const provider = new TencentIndexProvider({
    fetchImpl: async (url) => {
      requestedUrl = url;
      return { ok: true, arrayBuffer: async () => Buffer.from(PAYLOAD, "ascii") };
    },
  });
  const snapshot = await provider.fetchQuotes();

  assert.match(requestedUrl.href, /\/q=sh000001,sz399001/);
  assert.match(requestedUrl.href, /usNDX/);
  assert.equal(snapshot.provider, "tencent");
  assert.equal(snapshot.quotes.length, 8);
  assert.deepEqual(snapshot.quotes.find((quote) => quote.id === "ndx"), {
    id: "ndx",
    symbol: "100.NDX",
    name: "纳斯达克100",
    shortName: "纳指100",
    region: "US",
    price: 29433.43,
    change: -208.13,
    changePct: -0.7,
    marketTime: Date.UTC(2026, 7, 28, 21, 15, 59),
    status: "fresh",
  });
});

test("Tencent quote parser keeps valid partial data and ignores malformed lines", () => {
  const definitions = MARKET_INDICES.slice(0, 2);
  const quotes = parseTencentQuotes(`${PAYLOAD.split("\n")[0]}\nv_sz399001="bad";`, definitions);
  assert.deepEqual(quotes.map((quote) => quote.id), ["sse"]);
});

test("Tencent market clock accepts all source date separators", () => {
  const expected = Date.UTC(2026, 7, 28, 8, 14, 2);
  assert.equal(parseMarketTime("20260828161402", "CN"), expected);
  assert.equal(parseMarketTime("2026/08/28 16:14:02", "HK"), expected);
  assert.equal(
    parseMarketTime("2026-08-28 16:14:02", "US"),
    Date.UTC(2026, 7, 28, 20, 14, 2)
  );
  assert.equal(
    parseMarketTime("2026-01-28 16:14:02", "US"),
    Date.UTC(2026, 0, 28, 21, 14, 2)
  );
});

test("TencentIndexProvider preserves HTTP errors without response bodies", async () => {
  const provider = new TencentIndexProvider({
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  await assert.rejects(
    () => provider.fetchQuotes(),
    (error) => error.code === "HTTP_ERROR" && /503/.test(error.message)
  );
});

test("TencentIndexProvider gives the fallback time by enforcing its own timeout", async () => {
  const provider = new TencentIndexProvider({
    requestTimeoutMs: 5,
    fetchImpl: async () => new Promise(() => {}),
  });
  await assert.rejects(
    () => provider.fetchQuotes(),
    (error) => error.code === "TIMEOUT"
  );
});
