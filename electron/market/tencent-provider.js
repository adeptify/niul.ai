const {
  MARKET_INDICES,
  IndexProviderError,
} = require("./index-provider");

const TENCENT_ENDPOINT = "https://qt.gtimg.cn/q=";
const TENCENT_SYMBOLS = Object.freeze({
  sse: "sh000001",
  szse: "sz399001",
  chinext: "sz399006",
  csi300: "sh000300",
  hsi: "r_hkHSI",
  spx: "usINX",
  ndx: "usNDX",
  djia: "usDJI",
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function firstSunday(year, monthIndex) {
  return 1 + ((7 - new Date(Date.UTC(year, monthIndex, 1)).getUTCDay()) % 7);
}

function easternOffsetHours(year, monthIndex, day, hour) {
  const secondSundayInMarch = firstSunday(year, 2) + 7;
  const firstSundayInNovember = firstSunday(year, 10);
  const afterDstStart = monthIndex > 2
    || (monthIndex === 2 && (day > secondSundayInMarch || (day === secondSundayInMarch && hour >= 2)));
  const beforeDstEnd = monthIndex < 10
    || (monthIndex === 10 && (day < firstSundayInNovember || (day === firstSundayInNovember && hour < 2)));
  return afterDstStart && beforeDstEnd ? -4 : -5;
}

function parseMarketTime(value, region = "") {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length !== 14) return null;
  const parts = [
    digits.slice(0, 4),
    digits.slice(4, 6),
    digits.slice(6, 8),
    digits.slice(8, 10),
    digits.slice(10, 12),
    digits.slice(12, 14),
  ].map(Number);
  const monthIndex = parts[1] - 1;
  const offsetHours = region === "CN" || region === "HK"
    ? 8
    : region === "US"
      ? easternOffsetHours(parts[0], monthIndex, parts[2], parts[3])
      : 0;
  const timestamp = Date.UTC(parts[0], monthIndex, parts[2], parts[3], parts[4], parts[5])
    - offsetHours * 60 * 60 * 1000;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function parseTencentQuotes(text, definitions = MARKET_INDICES) {
  const byKey = new Map(
    definitions
      .map((definition) => [TENCENT_SYMBOLS[definition.id], definition])
      .filter(([key]) => Boolean(key))
  );
  const quotesById = new Map();
  const pattern = /v_([^=]+)="([^"]*)";/g;
  for (const match of String(text || "").matchAll(pattern)) {
    const definition = byKey.get(match[1]);
    if (!definition) continue;
    const fields = match[2].split("~");
    const price = finiteNumber(fields[3]);
    const change = finiteNumber(fields[31]);
    const changePct = finiteNumber(fields[32]);
    if (price === null || changePct === null) continue;
    quotesById.set(definition.id, {
      id: definition.id,
      symbol: definition.symbol,
      name: definition.name,
      shortName: definition.shortName,
      region: definition.region,
      price,
      change,
      changePct,
      marketTime: parseMarketTime(fields[30], definition.region),
      status: "fresh",
    });
  }
  return definitions.map((definition) => quotesById.get(definition.id)).filter(Boolean);
}

class TencentIndexProvider {
  constructor({
    fetchImpl = globalThis.fetch,
    endpoint = TENCENT_ENDPOINT,
    requestTimeoutMs = 1_800,
  } = {}) {
    if (typeof fetchImpl !== "function") throw new TypeError("A fetch implementation is required");
    this.id = "tencent";
    this.label = "腾讯行情";
    this.fetchImpl = fetchImpl;
    this.endpoint = endpoint;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  async fetchQuotes({ symbols = MARKET_INDICES, signal } = {}) {
    const definitions = Array.isArray(symbols) && symbols.length ? symbols : MARKET_INDICES;
    const supported = definitions.filter((definition) => TENCENT_SYMBOLS[definition.id]);
    if (!supported.length) {
      throw new IndexProviderError("腾讯行情不支持请求的指数", "UNSUPPORTED_SYMBOL");
    }
    const keys = supported.map((definition) => TENCENT_SYMBOLS[definition.id]).join(",");
    const url = new URL(`${this.endpoint}${keys}`);

    const controller = new AbortController();
    const abortRequest = () => controller.abort();
    if (signal?.aborted) abortRequest();
    else signal?.addEventListener("abort", abortRequest, { once: true });
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        abortRequest();
        reject(new IndexProviderError("腾讯行情请求超时", "TIMEOUT"));
      }, this.requestTimeoutMs);
    });

    let response;
    try {
      response = await Promise.race([
        this.fetchImpl(url, {
          signal: controller.signal,
          headers: {
            Accept: "text/plain,*/*",
            Referer: "https://gu.qq.com/",
            "User-Agent": "niul.ai/0.1 (+https://github.com/adeptify/niul.ai)",
          },
        }),
        timeout,
      ]);
    } catch (error) {
      if (error instanceof IndexProviderError) throw error;
      if (controller.signal.aborted) {
        throw new IndexProviderError("腾讯行情请求超时", "TIMEOUT", { cause: error });
      }
      throw new IndexProviderError("无法连接腾讯行情", "NETWORK", { cause: error });
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abortRequest);
    }

    if (!response?.ok) {
      throw new IndexProviderError(
        `腾讯行情返回 ${response?.status || "未知状态"}`,
        "HTTP_ERROR"
      );
    }

    let text;
    try {
      const bytes = await response.arrayBuffer();
      text = new TextDecoder("gb18030").decode(bytes);
    } catch (error) {
      throw new IndexProviderError("腾讯行情不是有效文本", "BAD_RESPONSE", { cause: error });
    }
    const quotes = parseTencentQuotes(text, supported);
    if (!quotes.length) {
      throw new IndexProviderError("腾讯行情没有返回有效指数", "EMPTY_RESPONSE");
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
  TENCENT_ENDPOINT,
  TENCENT_SYMBOLS,
  TencentIndexProvider,
  parseMarketTime,
  parseTencentQuotes,
};
