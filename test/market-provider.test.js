const assert = require("node:assert/strict");
const test = require("node:test");

const {
  EastmoneyIndexProvider,
} = require("../electron/market/eastmoney-provider");

const ROWS = {
  "1.000001": { f107: 1, f57: "000001", f58: "上证指数", f43: 3316.42, f170: 0.18, f169: 5.93, f86: 1770000000 },
  "0.399001": { f107: 0, f57: "399001", f58: "深证成指", f43: 10654.22, f170: 0.22, f169: 23.4, f86: 1770000001 },
  "0.399006": { f107: 0, f57: "399006", f58: "创业板指", f43: 2200.1, f170: -0.1, f169: -2.2, f86: 1770000002 },
  "1.000300": { f107: 1, f57: "000300", f58: "沪深300", f43: 3900.2, f170: 0.08, f169: 3.1, f86: 1770000003 },
  "100.HSI": { f107: 100, f57: "HSI", f58: "恒生指数", f43: 25000.5, f170: 0.5, f169: 124.3, f86: 1770000004 },
  "100.SPX": { f107: 100, f57: "SPX", f58: "标普500", f43: 6800.2, f170: -0.21, f169: -14.3, f86: 1770000005 },
  "100.NDX": { f107: 100, f57: "NDX", f58: "纳斯达克100", f43: 24000.1, f170: 0.3, f169: 71.8, f86: 1770000006 },
  "100.DJIA": { f107: 100, f57: "DJIA", f58: "道琼斯指数", f43: 46000.8, f170: -0.12, f169: -55.4, f86: 1770000007 },
};

test("EastmoneyIndexProvider requests every symbol and normalizes stock quotes", async () => {
  const requestedUrls = [];
  const provider = new EastmoneyIndexProvider({
    fetchImpl: async (url) => {
      requestedUrls.push(url);
      const secid = url.searchParams.get("secid");
      return {
        ok: true,
        json: async () => ({ rc: 0, data: ROWS[secid] }),
      };
    },
  });

  const snapshot = await provider.fetchQuotes();
  const supportedSymbols = Object.keys(ROWS).filter((symbol) => symbol !== "100.NDX");
  assert.equal(requestedUrls.length, 7);
  assert.deepEqual(requestedUrls.map((url) => url.searchParams.get("secid")), supportedSymbols);
  assert.match(requestedUrls[0].searchParams.get("fields"), /f43/);
  assert.equal(snapshot.provider, "eastmoney");
  assert.equal(snapshot.quotes.length, 7);
  assert.equal(snapshot.quotes.some((quote) => quote.id === "ndx"), false);
  assert.deepEqual(snapshot.quotes[0], {
    id: "sse",
    symbol: "1.000001",
    name: "上证指数",
    shortName: "上证",
    region: "CN",
    price: 3316.42,
    change: 5.93,
    changePct: 0.18,
    marketTime: 1770000000000,
    status: "fresh",
  });
});

test("EastmoneyIndexProvider keeps successful quotes when other symbols fail", async () => {
  const provider = new EastmoneyIndexProvider({
    fetchImpl: async (url) => {
      const secid = url.searchParams.get("secid");
      if (secid === "1.000001") {
        return { ok: true, json: async () => ({ rc: 0, data: ROWS[secid] }) };
      }
      return { ok: false, status: 502 };
    },
  });
  const snapshot = await provider.fetchQuotes();
  assert.deepEqual(snapshot.quotes.map((quote) => quote.id), ["sse"]);
});

test("EastmoneyIndexProvider rejects when every response has no usable quote", async () => {
  const provider = new EastmoneyIndexProvider({
    fetchImpl: async () => ({ ok: true, json: async () => ({ rc: 0, data: null }) }),
  });
  await assert.rejects(
    () => provider.fetchQuotes(),
    (error) => error.code === "EMPTY_RESPONSE" && /全部失败（7\/7）/.test(error.message)
  );
});

test("EastmoneyIndexProvider preserves HTTP failure details when every request fails", async () => {
  const provider = new EastmoneyIndexProvider({
    fetchImpl: async () => ({ ok: false, status: 502 }),
  });
  await assert.rejects(
    () => provider.fetchQuotes(),
    (error) => error.code === "HTTP_ERROR" && /返回 502/.test(error.message)
  );
});

test("EastmoneyIndexProvider returns partial data without waiting forever on one symbol", async () => {
  const provider = new EastmoneyIndexProvider({
    requestTimeoutMs: 5,
    fetchImpl: async (url) => {
      const secid = url.searchParams.get("secid");
      if (secid === "1.000001") {
        return { ok: true, json: async () => ({ rc: 0, data: ROWS[secid] }) };
      }
      return new Promise(() => {});
    },
  });
  const snapshot = await provider.fetchQuotes();
  assert.deepEqual(snapshot.quotes.map((quote) => quote.id), ["sse"]);
});

test("EastmoneyIndexProvider refuses to mislabel its NDX symbol as Nasdaq 100", async () => {
  let calls = 0;
  const provider = new EastmoneyIndexProvider({
    fetchImpl: async () => { calls += 1; },
  });
  await assert.rejects(
    () => provider.fetchQuotes({ symbols: [{ id: "ndx", symbol: "100.NDX", shortName: "纳指100" }] }),
    (error) => error.code === "UNSUPPORTED_SYMBOL"
  );
  assert.equal(calls, 0);
});
