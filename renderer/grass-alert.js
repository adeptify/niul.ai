(() => {
  const STORAGE_KEY = "niulai.grassAlertWindow";

  function grassAlert(rateLimit, now = Date.now()) {
    if (!rateLimit || !Number.isFinite(Number(rateLimit.remainingPercent))) return null;
    const remaining = Number(rateLimit.remainingPercent);
    const resetsAt = Number(rateLimit.resetsAt);
    if (!Number.isFinite(resetsAt) || resetsAt <= now) return null;
    const untilReset = resetsAt - now;
    if (remaining > 20 && untilReset > 60 * 60 * 1000) return null;
    return {
      key: `${rateLimit.limitId || "codex"}|${resetsAt}`,
      text: "Codex 额度快用完了。",
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
