const assert = require("node:assert/strict");
const test = require("node:test");

const {
  EastmoneyIndexProvider,
} = require("../electron/market/eastmoney-provider");

test("EastmoneyIndexProvider requests all symbols and normalizes valid quotes", async () => {
  let requestedUrl;
  const provider = new EastmoneyIndexProvider({
    fetchImpl: async (url) => {
      requestedUrl = url;
      return {
        ok: true,
        json: async () => ({
          data: {
            diff: [
              { f13: 1, f12: "000001", f14: "上证指数", f2: 3316.42, f3: 0.18, f4: 5.93, f124: 1770000000 },
              { f13: 100, f12: "SPX", f14: "标普500", f2: 6800.2, f3: -0.21, f4: -14.3, f124: 1770000010 },
            ],
          },
        }),
      };
    },
  });

  const snapshot = await provider.fetchQuotes();
  assert.match(requestedUrl.searchParams.get("secids"), /1\.000001/);
  assert.match(requestedUrl.searchParams.get("secids"), /100\.DJIA/);
  assert.equal(snapshot.provider, "eastmoney");
  assert.equal(snapshot.quotes.length, 2);
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

test("EastmoneyIndexProvider rejects a response with no usable quotes", async () => {
  const provider = new EastmoneyIndexProvider({
    fetchImpl: async () => ({ ok: true, json: async () => ({ data: { diff: [] } }) }),
  });
  await assert.rejects(() => provider.fetchQuotes(), (error) => error.code === "EMPTY_RESPONSE");
});
