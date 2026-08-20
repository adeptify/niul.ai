const { assertProvider } = require("./index-provider");

const DEFAULT_BACKOFF_MS = Object.freeze([60_000, 120_000, 300_000]);

function errorMessage(error) {
  return String(error?.message || error || "行情请求失败");
}

class MarketService {
  constructor({
    provider,
    now = () => Date.now(),
    timeoutMs = 4_000,
    pollMs = 60_000,
    quietPollMs = 300_000,
    staleAfterMs = 600_000,
    unchangedBeforeQuiet = 3,
    backoffMs = DEFAULT_BACKOFF_MS,
  }) {
    this.provider = assertProvider(provider);
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.pollMs = pollMs;
    this.quietPollMs = quietPollMs;
    this.staleAfterMs = staleAfterMs;
    this.unchangedBeforeQuiet = unchangedBeforeQuiet;
    this.backoffMs = backoffMs;
    this.cache = null;
    this.inFlight = null;
    this.nextFetchAt = 0;
    this.lastSuccessAt = 0;
    this.lastError = "";
    this.failureCount = 0;
    this.unchangedCount = 0;
    this.lastMarketClock = null;
  }

  disabledSnapshot() {
    return {
      provider: this.provider.id,
      providerLabel: this.provider.label,
      fetchedAt: null,
      status: "disabled",
      stale: false,
      error: "",
      nextPollMs: this.quietPollMs,
      quotes: [],
    };
  }

  unavailableSnapshot(now = this.now()) {
    return {
      provider: this.provider.id,
      providerLabel: this.provider.label,
      fetchedAt: null,
      status: "unavailable",
      stale: false,
      error: this.lastError,
      nextPollMs: Math.max(1_000, this.nextFetchAt - now || this.backoffMs[0]),
      quotes: [],
    };
  }

  decorate(snapshot, now = this.now()) {
    const stale = Boolean(this.lastSuccessAt && now - this.lastSuccessAt > this.staleAfterMs);
    return {
      ...snapshot,
      status: stale ? "stale" : "fresh",
      stale,
      error: this.lastError,
      nextPollMs: Math.max(1_000, this.nextFetchAt - now),
      quotes: snapshot.quotes.map((quote) => ({
        ...quote,
        status: stale || quote.status === "stale" ? "stale" : "fresh",
      })),
    };
  }

  async getSnapshot({ enabled = true, force = false } = {}) {
    if (!enabled) return this.disabledSnapshot();
    if (this.inFlight) return this.inFlight;
    const now = this.now();
    if (!force && now < this.nextFetchAt) {
      return this.cache ? this.decorate(this.cache, now) : this.unavailableSnapshot(now);
    }
    this.inFlight = this.refresh().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async refresh() {
    const controller = new AbortController();
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error("行情请求超时"));
      }, this.timeoutMs);
    });

    try {
      const incoming = await Promise.race([
        this.provider.fetchQuotes({ signal: controller.signal }),
        timeout,
      ]);
      const now = this.now();
      const marketClock = Math.max(
        0,
        ...incoming.quotes.map((quote) => Number(quote.marketTime || 0))
      );
      this.unchangedCount =
        this.lastMarketClock !== null && marketClock === this.lastMarketClock
          ? this.unchangedCount + 1
          : 0;
      this.lastMarketClock = marketClock;
      this.failureCount = 0;
      this.lastError = "";
      this.lastSuccessAt = now;
      const incomingIds = new Set(incoming.quotes.map((quote) => quote.id));
      const retainedQuotes = (this.cache?.quotes || [])
        .filter((quote) => !incomingIds.has(quote.id))
        .map((quote) => ({ ...quote, status: "stale" }));
      this.cache = {
        ...incoming,
        fetchedAt: now,
        quotes: [
          ...incoming.quotes.map((quote) => ({ ...quote, status: "fresh" })),
          ...retainedQuotes,
        ],
      };
      const nextInterval =
        this.unchangedCount >= this.unchangedBeforeQuiet ? this.quietPollMs : this.pollMs;
      this.nextFetchAt = now + nextInterval;
      return this.decorate(this.cache, now);
    } catch (error) {
      const now = this.now();
      this.failureCount += 1;
      this.lastError = errorMessage(error);
      const backoff = this.backoffMs[Math.min(this.failureCount - 1, this.backoffMs.length - 1)];
      this.nextFetchAt = now + backoff;
      return this.cache ? this.decorate(this.cache, now) : this.unavailableSnapshot(now);
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = {
  DEFAULT_BACKOFF_MS,
  MarketService,
};
