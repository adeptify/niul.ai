const {
  MARKET_INDICES,
  IndexProviderError,
} = require("./index-provider");

const EASTMONEY_ENDPOINT = "https://push2.eastmoney.com/api/qt/stock/get";
const EASTMONEY_FIELDS = "f57,f58,f43,f169,f170,f107,f86";
const EASTMONEY_UNSUPPORTED_IDS = new Set(["ndx"]);

function finiteNumber(value) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function eastmoneySymbol(row) {
  const market = String(row?.f107 ?? row?.f13 ?? "").trim();
  const code = String(row?.f57 ?? row?.f12 ?? "").trim();
  return market && code ? `${market}.${code}` : "";
}

function normalizeQuote(row, definition) {
  if (eastmoneySymbol(row) !== definition.symbol) return null;
  const price = finiteNumber(row?.f43 ?? row?.f2);
  const changePct = finiteNumber(row?.f170 ?? row?.f3);
  const change = finiteNumber(row?.f169 ?? row?.f4);
  if (price === null || changePct === null) return null;
  const marketTimeSeconds = finiteNumber(row?.f86 ?? row?.f124);
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
  constructor({
    fetchImpl = globalThis.fetch,
    endpoint = EASTMONEY_ENDPOINT,
    requestTimeoutMs = 1_800,
  } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
    this.id = "eastmoney";
    this.label = "东方财富";
    this.fetchImpl = fetchImpl;
    this.endpoint = endpoint;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async fetchQuote(definition, signal) {
    const url = new URL(this.endpoint);
    url.searchParams.set("fltt", "2");
    url.searchParams.set("invt", "2");
    url.searchParams.set("fields", EASTMONEY_FIELDS);
    url.searchParams.set("secid", definition.symbol);

    const controller = new AbortController();
    const abortRequest = () => controller.abort();
    if (signal?.aborted) abortRequest();
    else signal?.addEventListener("abort", abortRequest, { once: true });
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        abortRequest();
        reject(new IndexProviderError(
          `东方财富 ${definition.shortName} 行情请求超时`,
          "TIMEOUT"
        ));
      }, this.requestTimeoutMs);
    });

    let response;
    try {
      response = await Promise.race([
        this.fetchImpl(url, {
          signal: controller.signal,
          headers: {
            Accept: "application/json,text/plain,*/*",
            Referer: "https://quote.eastmoney.com/",
            "User-Agent": "niul.ai/0.1 (+https://github.com/adeptify/niul.ai)",
          },
        }),
        timeout,
      ]);
    } catch (error) {
      if (error instanceof IndexProviderError) throw error;
      if (controller.signal.aborted) {
        throw new IndexProviderError(
          `东方财富 ${definition.shortName} 行情请求超时`,
          "TIMEOUT",
          { cause: error }
        );
      }
      throw new IndexProviderError(
        `无法连接东方财富 ${definition.shortName} 行情`,
        "NETWORK",
        { cause: error }
      );
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortRequest);
    }

    if (!response?.ok) {
      throw new IndexProviderError(
        `东方财富 ${definition.shortName} 行情返回 ${response?.status || "未知状态"}`,
        "HTTP_ERROR"
      );
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new IndexProviderError(
        `东方财富 ${definition.shortName} 行情不是有效 JSON`,
        "BAD_RESPONSE",
        { cause: error }
      );
    }

    const quote = normalizeQuote(payload?.data, definition);
    if (!quote) {
      throw new IndexProviderError(
        `东方财富 ${definition.shortName} 行情没有有效数据`,
        "EMPTY_RESPONSE"
      );
    }
    return quote;
  }

  async fetchQuotes({ symbols = MARKET_INDICES, signal } = {}) {
    const definitions = Array.isArray(symbols) && symbols.length ? symbols : MARKET_INDICES;
    const supported = definitions.filter((definition) => !EASTMONEY_UNSUPPORTED_IDS.has(definition.id));
    if (!supported.length) {
      throw new IndexProviderError(
        "东方财富不提供可验证的纳指100行情",
        "UNSUPPORTED_SYMBOL"
      );
    }
    const results = await Promise.allSettled(
      supported.map((definition) => this.fetchQuote(definition, signal))
    );
    const quotes = results
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);

    if (!quotes.length) {
      const errors = results
        .filter((result) => result.status === "rejected")
        .map((result) => result.reason);
      const codes = new Set(errors.map((error) => error?.code).filter(Boolean));
      const code = codes.size === 1 ? [...codes][0] : "EMPTY_RESPONSE";
      const detail = String(errors[0]?.message || "没有返回有效指数");
      throw new IndexProviderError(
        `东方财富行情全部失败（${errors.length}/${supported.length}）：${detail}`,
        code,
        { cause: new AggregateError(errors, "Eastmoney quote requests failed") }
      );
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
  EASTMONEY_UNSUPPORTED_IDS,
  EastmoneyIndexProvider,
  finiteNumber,
  normalizeQuote,
};
