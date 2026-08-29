const fs = require("node:fs");
const path = require("node:path");

const { MARKET_INDICES } = require("./index-provider");

const MARKET_CACHE_VERSION = 1;
const DEFINITIONS_BY_ID = new Map(MARKET_INDICES.map((definition) => [definition.id, definition]));
const PROVIDER_LABELS = Object.freeze({
  tencent: "腾讯行情",
  eastmoney: "东方财富",
  "tencent+eastmoney": "腾讯行情 + 东方财富",
  "eastmoney+tencent": "东方财富 + 腾讯行情",
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === "" || value === "-") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sanitizeQuote(value) {
  const definition = DEFINITIONS_BY_ID.get(String(value?.id || ""));
  if (!definition || value?.symbol !== definition.symbol) return null;
  const price = finiteNumber(value.price);
  const changePct = finiteNumber(value.changePct);
  if (price === null || changePct === null) return null;
  const change = value.change === null ? null : finiteNumber(value.change);
  const marketTime = value.marketTime === null ? null : finiteNumber(value.marketTime);
  return {
    id: definition.id,
    symbol: definition.symbol,
    name: definition.name,
    shortName: definition.shortName,
    region: definition.region,
    price,
    change,
    changePct,
    marketTime,
    status: value.status === "stale" ? "stale" : "fresh",
  };
}

function sanitizeMarketCache(value) {
  const fetchedAt = finiteNumber(value?.fetchedAt);
  if (!value || fetchedAt === null || fetchedAt <= 0 || !Array.isArray(value.quotes)) return null;
  const quotes = value.quotes.map(sanitizeQuote).filter(Boolean);
  if (!quotes.length) return null;
  const provider = Object.hasOwn(PROVIDER_LABELS, value.provider) ? value.provider : "market-auto";
  return {
    provider,
    providerLabel: PROVIDER_LABELS[provider] || "实时行情",
    fetchedAt,
    quotes,
  };
}

function readMarketCache(file) {
  try {
    const stored = JSON.parse(fs.readFileSync(file, "utf8"));
    if (stored?.version !== MARKET_CACHE_VERSION) return null;
    return sanitizeMarketCache(stored.snapshot);
  } catch {
    return null;
  }
}

function writeMarketCache(file, snapshot) {
  const sanitized = sanitizeMarketCache(snapshot);
  if (!sanitized) throw new TypeError("Market snapshot is not cacheable");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.tmp`;
  fs.writeFileSync(
    temporaryFile,
    JSON.stringify({ version: MARKET_CACHE_VERSION, snapshot: sanitized }, null, 2)
  );
  fs.renameSync(temporaryFile, file);
  return sanitized;
}

module.exports = {
  MARKET_CACHE_VERSION,
  readMarketCache,
  sanitizeMarketCache,
  writeMarketCache,
};
