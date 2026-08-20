const {
  MARKET_INDICES,
  IndexProviderError,
} = require("./index-provider");

const EASTMONEY_ENDPOINT = "https://push2.eastmoney.com/api/qt/ulist.np/get";
const EASTMONEY_FIELDS = "f12,f14,f2,f3,f4,f13,f124";

function finiteNumber(value) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function eastmoneySymbol(row) {
  const market = String(row?.f13 ?? "").trim();
  const code = String(row?.f12 ?? "").trim();
  return market && code ? `${market}.${code}` : "";
}

function normalizeQuote(row, definition) {
  const price = finiteNumber(row?.f2);
  const changePct = finiteNumber(row?.f3);
  const change = finiteNumber(row?.f4);
  if (price === null || changePct === null) return null;
  const marketTimeSeconds = finiteNumber(row?.f124);
  return {
    id: definition.id,
    symbol: definition.symbol,
    name: definition.name,
    shortName: definition.shortName,
    region: definition.region,
    price,
    change,
    changePct,
    marketTime: marketTimeSeconds === null ? null : marketTimeSeconds * 1000,
    status: "fresh",
  };
}

class EastmoneyIndexProvider {
  constructor({ fetchImpl = globalThis.fetch, endpoint = EASTMONEY_ENDPOINT } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
    this.id = "eastmoney";
    this.label = "东方财富";
    this.fetchImpl = fetchImpl;
    this.endpoint = endpoint;
  }

  async fetchQuotes({ symbols = MARKET_INDICES, signal } = {}) {
    const definitions = Array.isArray(symbols) && symbols.length ? symbols : MARKET_INDICES;
    const url = new URL(this.endpoint);
    url.searchParams.set("fltt", "2");
    url.searchParams.set("invt", "2");
    url.searchParams.set("fields", EASTMONEY_FIELDS);
    url.searchParams.set("secids", definitions.map((item) => item.symbol).join(","));

    let response;
    try {
      response = await this.fetchImpl(url, {
        signal,
        headers: {
          Accept: "application/json,text/plain,*/*",
          Referer: "https://quote.eastmoney.com/",
          "User-Agent": "niul.ai/0.1 (+https://github.com/adeptify/niul.ai)",
        },
      });
    } catch (error) {
      if (signal?.aborted) {
        throw new IndexProviderError("东方财富行情请求超时", "TIMEOUT", { cause: error });
      }
      throw new IndexProviderError("无法连接东方财富行情", "NETWORK", { cause: error });
    }

    if (!response?.ok) {
      throw new IndexProviderError(
        `东方财富行情返回 ${response?.status || "未知状态"}`,
        "HTTP_ERROR"
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new IndexProviderError("东方财富行情不是有效 JSON", "BAD_RESPONSE", { cause: error });
    }

    const rawDiff = payload?.data?.diff;
    const rows = Array.isArray(rawDiff)
      ? rawDiff
      : rawDiff && typeof rawDiff === "object"
        ? Object.values(rawDiff)
        : [];
    const bySymbol = new Map(rows.map((row) => [eastmoneySymbol(row), row]));
    const quotes = definitions
      .map((definition) => normalizeQuote(bySymbol.get(definition.symbol), definition))
      .filter(Boolean);

    if (!quotes.length) {
      throw new IndexProviderError("东方财富行情没有返回有效指数", "EMPTY_RESPONSE");
    }

    return {
      provider: this.id,
      providerLabel: this.label,
      fetchedAt: Date.now(),
      quotes,
    };
  }
}

module.exports = {
  EASTMONEY_ENDPOINT,
  EASTMONEY_FIELDS,
  EastmoneyIndexProvider,
  finiteNumber,
  normalizeQuote,
};
