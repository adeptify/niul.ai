const {
  MARKET_INDICES,
  IndexProviderError,
  assertProvider,
} = require("./index-provider");

class FallbackIndexProvider {
  constructor({ providers } = {}) {
    if (!Array.isArray(providers) || !providers.length) {
      throw new TypeError("At least one IndexProvider is required");
    }
    this.providers = providers.map(assertProvider);
    this.id = "market-auto";
    this.label = "实时行情";
  }

  async fetchQuotes({ symbols = MARKET_INDICES, signal } = {}) {
    const definitions = Array.isArray(symbols) && symbols.length ? symbols : MARKET_INDICES;
    const quotesById = new Map();
    const sources = [];
    const errors = [];

    for (const provider of this.providers) {
      const missing = definitions.filter((definition) => !quotesById.has(definition.id));
      if (!missing.length) break;
      try {
        const snapshot = await provider.fetchQuotes({ symbols: missing, signal });
        let accepted = 0;
        for (const quote of snapshot?.quotes || []) {
          if (!missing.some((definition) => definition.id === quote.id)) continue;
          if (quotesById.has(quote.id)) continue;
          quotesById.set(quote.id, quote);
          accepted += 1;
        }
        if (accepted) {
          sources.push({
            id: snapshot.provider || provider.id,
            label: snapshot.providerLabel || provider.label,
          });
        }
      } catch (error) {
        errors.push(error);
      }
    }

    const quotes = definitions.map((definition) => quotesById.get(definition.id)).filter(Boolean);
    if (!quotes.length) {
      const detail = String(errors[0]?.message || "没有返回有效指数");
      throw new IndexProviderError(
        `所有行情源都不可用：${detail}`,
        "ALL_PROVIDERS_FAILED",
        { cause: new AggregateError(errors, "Index providers failed") }
      );
    }
    const uniqueSources = sources.filter(
      (source, index) => sources.findIndex((candidate) => candidate.id === source.id) === index
    );
    return {
      provider: uniqueSources.map((source) => source.id).join("+"),
      providerLabel: uniqueSources.map((source) => source.label).join(" + "),
      fetchedAt: Date.now(),
      quotes,
    };
  }
}

module.exports = { FallbackIndexProvider };
