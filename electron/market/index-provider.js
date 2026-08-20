const MARKET_INDICES = Object.freeze([
  Object.freeze({ id: "sse", symbol: "1.000001", name: "上证指数", shortName: "上证", region: "CN" }),
  Object.freeze({ id: "szse", symbol: "0.399001", name: "深证成指", shortName: "深证", region: "CN" }),
  Object.freeze({ id: "chinext", symbol: "0.399006", name: "创业板指", shortName: "创业板", region: "CN" }),
  Object.freeze({ id: "csi300", symbol: "1.000300", name: "沪深300", shortName: "沪深300", region: "CN" }),
  Object.freeze({ id: "hsi", symbol: "100.HSI", name: "恒生指数", shortName: "恒生", region: "HK" }),
  Object.freeze({ id: "spx", symbol: "100.SPX", name: "标普500", shortName: "标普500", region: "US" }),
  Object.freeze({ id: "ndx", symbol: "100.NDX", name: "纳斯达克100", shortName: "纳指100", region: "US" }),
  Object.freeze({ id: "djia", symbol: "100.DJIA", name: "道琼斯指数", shortName: "道琼斯", region: "US" }),
]);

class IndexProviderError extends Error {
  constructor(message, code = "INDEX_PROVIDER_ERROR", options = {}) {
    super(message, options);
    this.name = "IndexProviderError";
    this.code = code;
  }
}

function assertProvider(provider) {
  if (!provider || typeof provider.fetchQuotes !== "function") {
    throw new TypeError("IndexProvider must implement fetchQuotes({ symbols, signal })");
  }
  return provider;
}

module.exports = {
  MARKET_INDICES,
  IndexProviderError,
  assertProvider,
};
