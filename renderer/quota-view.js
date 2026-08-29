(function exposeQuotaView(global, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.niulQuotaView = api;
})(typeof globalThis === "object" ? globalThis : this, function createQuotaView() {
  function number(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function currentWindows(provider, now = Date.now()) {
    return (Array.isArray(provider?.windows) ? provider.windows : []).filter((window) => {
      const remaining = number(window?.remainingPercent);
      const resetsAt = number(window?.resetsAt) || 0;
      return remaining !== null && (!resetsAt || resetsAt > now);
    });
  }

  function providerMinimum(provider, now = Date.now()) {
    return currentWindows(provider, now).reduce((minimum, window) => {
      if (!minimum) return window;
      return Number(window.remainingPercent) < Number(minimum.remainingPercent) ? window : minimum;
    }, null);
  }

  function quotaSummary(snapshot, { enabled = true, now = Date.now() } = {}) {
    if (!enabled || snapshot?.status === "disabled") return "额度查询未开启";
    const summaries = (snapshot?.providers || [])
      .map((provider) => ({ provider, window: providerMinimum(provider, now) }))
      .filter((entry) => entry.window)
      .map(
        ({ provider, window }) =>
          `${provider.label || provider.id} ${Number(window.remainingPercent).toFixed(
            Number(window.remainingPercent) % 1 ? 1 : 0
          )}%`
      );
    if (!summaries.length) return "额度暂时没回来";
    return summaries.join(" · ");
  }

  function quotaTone(remainingPercent) {
    const remaining = number(remainingPercent);
    if (remaining === null) return "unknown";
    if (remaining <= 20) return "critical";
    if (remaining <= 40) return "low";
    return "healthy";
  }

  function formatResetTime(resetsAt, now = Date.now()) {
    const reset = number(resetsAt);
    if (!reset) return "重置时间未知";
    const remainingMs = reset - now;
    if (remainingMs <= 0) return "正在重置";
    const minutes = Math.ceil(remainingMs / 60_000);
    if (minutes < 60) return `${minutes} 分钟后重置`;
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    if (hours < 24) {
      return restMinutes ? `${hours} 小时 ${restMinutes} 分后重置` : `${hours} 小时后重置`;
    }
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return restHours ? `${days} 天 ${restHours} 小时后重置` : `${days} 天后重置`;
  }

  function quotaUpdatedText(snapshot, now = Date.now()) {
    const fetchedAt = number(snapshot?.fetchedAt);
    if (!fetchedAt) return "还没有可用数据";
    const elapsedMinutes = Math.max(0, Math.floor((now - fetchedAt) / 60_000));
    if (elapsedMinutes < 1) return "刚刚更新";
    if (elapsedMinutes < 60) return `${elapsedMinutes} 分钟前更新`;
    return `${Math.floor(elapsedMinutes / 60)} 小时前更新`;
  }

  return {
    currentWindows,
    formatResetTime,
    providerMinimum,
    quotaSummary,
    quotaTone,
    quotaUpdatedText,
  };
});
