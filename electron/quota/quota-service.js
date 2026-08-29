const DEFAULT_BACKOFF_MS = Object.freeze([60_000, 120_000, 300_000]);

function safeError(error) {
  return {
    errorCode: String(error?.code || "UNKNOWN"),
    error: String(error?.message || "额度暂时不可用").slice(0, 180),
  };
}

class QuotaService {
  constructor({
    providers = [],
    now = () => Date.now(),
    timeoutMs = 8_000,
    pollMs = 300_000,
    staleAfterMs = 900_000,
    backoffMs = DEFAULT_BACKOFF_MS,
  } = {}) {
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
    this.now = now;
    this.timeoutMs = timeoutMs;
    this.pollMs = pollMs;
    this.staleAfterMs = staleAfterMs;
    this.backoffMs = backoffMs;
    this.states = new Map();
  }

  stateFor(id) {
    if (!this.states.has(id)) {
      this.states.set(id, {
        cache: null,
        inFlight: null,
        nextFetchAt: 0,
        lastSuccessAt: 0,
        failureCount: 0,
        lastError: null,
      });
    }
    return this.states.get(id);
  }

  disable() {
    this.states.clear();
  }

  disabledSnapshot() {
    return {
      status: "disabled",
      fetchedAt: null,
      nextPollMs: this.pollMs,
      providers: [],
    };
  }

  decorateCached(provider, state, now, error = state.lastError) {
    const age = now - state.lastSuccessAt;
    const stale = Boolean(error) || age > this.staleAfterMs;
    return {
      ...state.cache,
      status: stale ? "stale" : "fresh",
      observedAt: state.lastSuccessAt,
      ...(error ? safeError(error) : { errorCode: "", error: "" }),
    };
  }

  unavailable(provider, state, error) {
    return {
      id: provider.id,
      label: provider.label,
      planType: "",
      status: "unavailable",
      observedAt: null,
      windows: [],
      ...safeError(error),
      nextPollMs: Math.max(1_000, state.nextFetchAt - this.now()),
    };
  }

  async refreshProvider(provider, state) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const now = this.now();
      const incoming = await provider.fetchQuota({ signal: controller.signal, now });
      state.cache = {
        id: provider.id,
        label: incoming.label || provider.label,
        planType: incoming.planType || "",
        windows: Array.isArray(incoming.windows) ? incoming.windows : [],
      };
      state.lastSuccessAt = now;
      state.failureCount = 0;
      state.lastError = null;
      state.nextFetchAt = now + this.pollMs;
      return this.decorateCached(provider, state, now);
    } catch (error) {
      const now = this.now();
      state.failureCount += 1;
      state.lastError = error;
      const delay = this.backoffMs[Math.min(state.failureCount - 1, this.backoffMs.length - 1)];
      state.nextFetchAt = now + delay;
      return state.cache
        ? this.decorateCached(provider, state, now, error)
        : this.unavailable(provider, state, error);
    } finally {
      clearTimeout(timer);
      state.inFlight = null;
    }
  }

  getProviderSnapshot(provider, { force = false } = {}) {
    const state = this.stateFor(provider.id);
    if (state.inFlight) return state.inFlight;
    const now = this.now();
    if (!force && now < state.nextFetchAt) {
      return Promise.resolve(
        state.cache
          ? this.decorateCached(provider, state, now)
          : this.unavailable(
              provider,
              state,
              state.lastError || new Error("等待下一次额度重试")
            )
      );
    }
    state.inFlight = this.refreshProvider(provider, state);
    return state.inFlight;
  }

  async getSnapshot({ enabled = true, providerIds, force = false } = {}) {
    if (!enabled) {
      this.disable();
      return this.disabledSnapshot();
    }
    const selectedIds = Array.isArray(providerIds)
      ? providerIds
      : [...this.providers.keys()];
    const selected = selectedIds.map((id) => this.providers.get(id)).filter(Boolean);
    if (!selected.length) return this.disabledSnapshot();
    const providers = await Promise.all(
      selected.map((provider) => this.getProviderSnapshot(provider, { force }))
    );
    const now = this.now();
    const states = selected.map((provider) => this.stateFor(provider.id));
    const nextFetchAt = Math.min(...states.map((state) => state.nextFetchAt || now + this.pollMs));
    const usable = providers.filter((provider) => provider.windows.length);
    const status = !usable.length
      ? "unavailable"
      : providers.some((provider) => provider.status !== "fresh")
        ? "stale"
        : "fresh";
    return {
      status,
      fetchedAt: usable.length
        ? Math.max(...usable.map((provider) => Number(provider.observedAt) || 0))
        : null,
      nextPollMs: Math.max(1_000, nextFetchAt - now),
      providers,
    };
  }
}

module.exports = { DEFAULT_BACKOFF_MS, QuotaService, safeError };
