const assert = require("node:assert/strict");
const test = require("node:test");

const { FallbackIndexProvider } = require("../electron/market/fallback-provider");
const { MARKET_INDICES } = require("../electron/market/index-provider");

function quote(definition, price) {
  return { ...definition, price, change: 1, changePct: 0.1, marketTime: 1, status: "fresh" };
}

test("FallbackIndexProvider asks the fallback only for missing indices", async () => {
  const definitions = MARKET_INDICES.slice(0, 2);
  let fallbackSymbols;
  const provider = new FallbackIndexProvider({
    providers: [
      {
        id: "primary",
        label: "Primary",
        fetchQuotes: async () => ({
          provider: "primary",
          providerLabel: "Primary",
          quotes: [quote(definitions[0], 100)],
        }),
      },
      {
        id: "fallback",
        label: "Fallback",
        fetchQuotes: async ({ symbols }) => {
          fallbackSymbols = symbols;
          return {
            provider: "fallback",
            providerLabel: "Fallback",
            quotes: [quote(symbols[0], 200)],
          };
        },
      },
    ],
  });

  const snapshot = await provider.fetchQuotes({ symbols: definitions });
  assert.deepEqual(fallbackSymbols.map((definition) => definition.id), [definitions[1].id]);
  assert.deepEqual(snapshot.quotes.map((item) => item.price), [100, 200]);
  assert.equal(snapshot.provider, "primary+fallback");
  assert.equal(snapshot.providerLabel, "Primary + Fallback");
});

test("FallbackIndexProvider does not call fallback after a complete primary response", async () => {
  const definitions = MARKET_INDICES.slice(0, 2);
  let fallbackCalls = 0;
  const provider = new FallbackIndexProvider({
    providers: [
      {
        id: "primary",
        label: "Primary",
        fetchQuotes: async () => ({
          provider: "primary",
          providerLabel: "Primary",
          quotes: definitions.map((definition, index) => quote(definition, index)),
        }),
      },
      { id: "fallback", label: "Fallback", fetchQuotes: async () => { fallbackCalls += 1; } },
    ],
  });
  const snapshot = await provider.fetchQuotes({ symbols: definitions });
  assert.equal(snapshot.quotes.length, 2);
  assert.equal(snapshot.provider, "primary");
  assert.equal(fallbackCalls, 0);
});

test("FallbackIndexProvider recovers a complete snapshot after primary failure", async () => {
  const definitions = MARKET_INDICES.slice(0, 2);
  const provider = new FallbackIndexProvider({
    providers: [
      { id: "primary", label: "Primary", fetchQuotes: async () => { throw new Error("offline"); } },
      {
        id: "fallback",
        label: "Fallback",
        fetchQuotes: async ({ symbols }) => ({
          provider: "fallback",
          providerLabel: "Fallback",
          quotes: symbols.map((definition, index) => quote(definition, index + 10)),
        }),
      },
    ],
  });
  const snapshot = await provider.fetchQuotes({ symbols: definitions });
  assert.equal(snapshot.provider, "fallback");
  assert.equal(snapshot.providerLabel, "Fallback");
  assert.deepEqual(snapshot.quotes.map((item) => item.price), [10, 11]);
});

test("FallbackIndexProvider reports one safe error when every source fails", async () => {
  const provider = new FallbackIndexProvider({
    providers: [
      { id: "one", label: "One", fetchQuotes: async () => { throw new Error("one offline"); } },
      { id: "two", label: "Two", fetchQuotes: async () => { throw new Error("two offline"); } },
    ],
  });
  await assert.rejects(
    () => provider.fetchQuotes(),
    (error) => error.code === "ALL_PROVIDERS_FAILED" && /one offline/.test(error.message)
  );
});
