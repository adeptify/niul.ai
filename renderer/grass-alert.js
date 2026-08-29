(() => {
  const STORAGE_KEY = "niulai.grassAlertWindow";

  function quotaWindows(input) {
    if (Array.isArray(input?.providers)) {
      return input.providers.flatMap((provider) =>
        (provider.windows || []).map((window) => ({
          ...window,
          providerId: provider.id,
          providerLabel: provider.label || provider.id,
        }))
      );
    }
    return input
      ? [{ ...input, providerId: input.limitId || "codex", providerLabel: "Codex" }]
      : [];
  }

  function grassAlert(rateLimit, now = Date.now()) {
    const candidates = quotaWindows(rateLimit)
      .filter((window) => {
        const remaining = Number(window.remainingPercent);
        const resetsAt = Number(window.resetsAt);
        if (!Number.isFinite(remaining) || !Number.isFinite(resetsAt) || resetsAt <= now) {
          return false;
        }
        return remaining <= 20 || resetsAt - now <= 60 * 60 * 1000;
      })
      .sort(
        (a, b) =>
          Number(a.remainingPercent) - Number(b.remainingPercent) ||
          Number(a.resetsAt) - Number(b.resetsAt)
      );
    const urgent = candidates[0];
    if (!urgent) return null;
    const resetsAt = Number(urgent.resetsAt);
    const windowLabel = urgent.label ? ` ${urgent.label}` : "";
    return {
      key: `${urgent.providerId}:${urgent.id || "quota"}|${resetsAt}`,
      text: `${urgent.providerLabel}${windowLabel}额度快用完了。`,
    };
  }

  function createGrassAlertTracker(storage) {
    let lastKey = storage?.getItem?.(STORAGE_KEY) || "";
    return {
      candidate(rateLimit, now = Date.now()) {
        const alert = grassAlert(rateLimit, now);
        return alert && alert.key !== lastKey ? alert : null;
      },
      commit(key) {
        if (!key) return;
        lastKey = key;
        storage?.setItem?.(STORAGE_KEY, key);
      },
    };
  }

  const api = Object.freeze({ createGrassAlertTracker, grassAlert });
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.niulGrassAlert = api;
})();
