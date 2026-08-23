(function exposeSessionView(global, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.niulaiSessionView = api;
})(typeof globalThis === "object" ? globalThis : this, function createSessionViewModule() {
  const STATUS_TEXT = Object.freeze({
    working: "拉犁",
    waiting: "停犁",
    idle: "吃草",
    offline: "回棚",
  });

  const STATUS_HEADING = Object.freeze({
    working: "拉犁",
    waiting: "停犁优先",
    idle: "吃草",
    offline: "回棚",
    all: "所有会话",
  });

  function waitWhyOf(row) {
    return row?.status === "waiting" ? row.waitWhy || "next" : "";
  }

  function sessionName(row) {
    return row?.cwdName || row?.title || row?.label || "这头";
  }

  function compactDisplayPath(value) {
    return String(value || "").replace(/^\/Users\/[^/]+/, "~");
  }

  function sessionWorkSummary(row, displayName, fallbackText) {
    const label = String(row?.label || "").trim();
    const runtime = String(row?.runtime || "").trim();
    const prefixes = [label, label.split(/\s+/)[0], runtime, "Agent"]
      .filter(Boolean)
      .sort((left, right) => right.length - left.length);
    const clean = (value) => {
      let result = String(value || "").trim();
      for (const prefix of prefixes) {
        const lowerResult = result.toLocaleLowerCase();
        const lowerPrefix = prefix.toLocaleLowerCase();
        if (lowerResult === lowerPrefix) return "";
        if (!lowerResult.startsWith(lowerPrefix)) continue;
        const tail = result.slice(prefix.length);
        if (!/^[\s·:：|/\\_-]/.test(tail)) continue;
        result = tail.replace(/^[\s·:：|/\\_-]+/, "").trim();
        break;
      }
      return result;
    };
    const title = String(row?.title || "").trim();
    const completed = String(row?.workSummary || "").trim();
    const source = completed || (title && title !== displayName ? title : fallbackText);
    let summary = clean(source);
    if (!summary || /^(running|active|working)$/i.test(summary)) summary = clean(fallbackText);
    if (!summary || /^(running|active|working)$/i.test(summary)) return "状态更新";
    return summary;
  }

  function waitingCopy(row) {
    const name = sessionName(row);
    if (waitWhyOf(row) === "allow") return `${name} 停犁了，在等你点允许。`;
    if (waitWhyOf(row) === "choose") return `${name} 停犁了，在等你选一下。`;
    return `${name} 停犁了，正等你。`;
  }

  function rowStateText(row) {
    const parts = [];
    if (row.status === "waiting") {
      if (waitWhyOf(row) === "allow") parts.push("停犁 · 等允许");
      else if (waitWhyOf(row) === "choose") parts.push("停犁 · 等你选");
      else parts.push(row.statusText || STATUS_TEXT.waiting);
    } else {
      parts.push(row.statusText || STATUS_TEXT[row.status] || row.status);
    }
    if (row.statusConfidence === "low") parts.push("看不太清");
    if (row.subagentsWorking > 0) parts.push(`带着 ${row.subagentsWorking} 头小牛`);
    return parts.join(" · ");
  }

  function runtimeQuality(id) {
    if (["claude-code", "codex", "grok"].includes(id)) return "事件状态 · Token";
    if (id === "cursor") return "事件级状态";
    if (["claude-desktop", "gemini", "opencode", "pi"].includes(id)) return "Session 活动";
    return "基础检测";
  }

  function timeAgo(timestamp, now = Date.now()) {
    const delta = Math.max(0, now - Number(timestamp || 0));
    if (delta < 15000) return "刚刚";
    if (delta < 60000) return `${Math.floor(delta / 1000)} 秒前`;
    if (delta < 3600000) return `${Math.floor(delta / 60000)} 分前`;
    if (delta < 86400000) return `${Math.floor(delta / 3600000)} 小时前`;
    return `${Math.floor(delta / 86400000)} 天前`;
  }

  function formatTokens(tokens) {
    const value = Math.max(0, Number(tokens || 0));
    if (value >= 1000000000) {
      return `${(value / 1000000000).toFixed(value >= 10000000000 ? 1 : 2)}B`;
    }
    if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 1 : 2)}M`;
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}K`;
    return String(Math.round(value));
  }

  return {
    STATUS_HEADING,
    STATUS_TEXT,
    compactDisplayPath,
    formatTokens,
    rowStateText,
    runtimeQuality,
    sessionName,
    sessionWorkSummary,
    timeAgo,
    waitingCopy,
    waitWhyOf,
  };
});
