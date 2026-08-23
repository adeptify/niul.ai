(function exposePreviewApi(global, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else global.niulaiPreviewApi = api;
})(typeof globalThis === "object" ? globalThis : this, function createPreviewApiModule() {
  const PREVIEW_CONFIG = {
    pollMs: 5000,
    petMode: "cow",
    herdMode: false,
    showPetVisuals: true,
    cowScale: 1,
    bubbleScale: 1,
    soundEnabled: true,
    market: {
      enabled: true,
      provider: "eastmoney",
      reactionsEnabled: true,
      thresholdPct: 0.1,
    },
    runtimes: {
      cursor: { enabled: true, label: "Cursor" },
      "claude-code": { enabled: true, label: "Claude Code" },
      codex: { enabled: true, label: "Codex" },
      grok: { enabled: true, label: "Grok Build" },
      opencode: { enabled: true, label: "OpenCode" },
    },
    custom: [],
  };

  const PREVIEW_SNAPSHOT = {
    mood: "working",
    scannedAt: Date.now(),
    counts: { working: 2, waiting: 2, idle: 1, offline: 1 },
    tokenUsage: {
      tokens: 438420,
      sources: [
        { id: "codex", label: "Codex", tokens: 301200, confidence: "high" },
        { id: "grok", label: "Grok Build", tokens: 137220, confidence: "high" },
      ],
      supportedRuntimes: ["codex", "claude-code", "grok", "gemini"],
      unsupportedReasons: { cursor: "Cursor 本机 Session 暂未暴露实际 usage；不做估算" },
    },
    rows: [
      {
        id: "preview-cursor",
        runtime: "cursor",
        label: "Cursor",
        status: "working",
        cwdName: "niul.ai",
        cwd: "/Users/you/code/niul.ai",
        mtime: Date.now() - 3000,
      },
      {
        id: "preview-claude",
        runtime: "claude-code",
        label: "Claude Code",
        status: "working",
        cwdName: "runtime-lab",
        cwd: "/Users/you/code/runtime-lab",
        mtime: Date.now() - 8000,
      },
      {
        id: "preview-codex",
        runtime: "codex",
        label: "Codex",
        status: "waiting",
        statusReason: "Codex 已完成最近一轮",
        cwdName: "desktop-agent",
        cwd: "/Users/you/code/desktop-agent",
        mtime: Date.now() - 180000,
        tokensToday: 301200,
        tokenTracked: true,
      },
      {
        id: "grok:preview-grok",
        runtime: "grok",
        label: "Grok Build",
        status: "waiting",
        statusReason: "Grok 已完成最近一轮",
        cwdName: "agent-lab",
        cwd: "/Users/you/code/agent-lab",
        mtime: Date.now() - 240000,
        tokensToday: 137220,
        tokenTracked: true,
      },
      {
        id: "preview-opencode",
        runtime: "opencode",
        label: "OpenCode",
        status: "idle",
        cwdName: "playground",
        cwd: "/Users/you/code/playground",
        mtime: Date.now() - 480000,
      },
      {
        id: "preview-offline",
        runtime: "pi",
        label: "Pi",
        status: "offline",
        cwdName: "scratch",
        cwd: "/Users/you/scratch",
        mtime: Date.now() - 7200000,
      },
    ],
  };

  const PREVIEW_MARKET_SNAPSHOT = {
    provider: "eastmoney",
    providerLabel: "东方财富",
    fetchedAt: Date.now(),
    status: "fresh",
    stale: false,
    error: "",
    nextPollMs: 60_000,
    reaction: null,
    quotes: [
      { id: "sse", name: "上证指数", shortName: "上证", price: 3742.31, changePct: 0.18, status: "fresh" },
      { id: "szse", name: "深证成指", shortName: "深证", price: 11824.6, changePct: 0.42, status: "fresh" },
      { id: "chinext", name: "创业板指", shortName: "创业板", price: 2459.18, changePct: -0.16, status: "fresh" },
      { id: "csi300", name: "沪深300", shortName: "沪深300", price: 4321.07, changePct: 0.09, status: "fresh" },
      { id: "hsi", name: "恒生指数", shortName: "恒生", price: 25214.42, changePct: -0.31, status: "fresh" },
      { id: "spx", name: "标普500", shortName: "标普500", price: 6812.04, changePct: 0.27, status: "fresh" },
      { id: "ndx", name: "纳斯达克100", shortName: "纳指100", price: 24861.7, changePct: 0.54, status: "fresh" },
      { id: "djia", name: "道琼斯指数", shortName: "道琼斯", price: 49122.08, changePct: -0.08, status: "fresh" },
    ],
  };

  function createPreviewApi() {
    let config = structuredClone(PREVIEW_CONFIG);
    let memos = [];
    const noop = () => {};
    return {
      scan: async () => ({ ...PREVIEW_SNAPSHOT, scannedAt: Date.now() }),
      getMarketSnapshot: async () => ({ ...PREVIEW_MARKET_SNAPSHOT, fetchedAt: Date.now() }),
      getConfig: async () => config,
      saveConfig: async (next) => {
        config = next;
        return config;
      },
      chooseDirectory: async () => "/Users/you/.my-agent/sessions",
      hideApp: async () => true,
      quitApp: async () => true,
      listMemos: async () => memos,
      saveMemo: async (memo) => {
        const saved = { id: `preview-${Date.now()}`, createdAt: Date.now(), ...memo };
        memos = [saved, ...memos];
        return saved;
      },
      completeMemo: async (id) => {
        memos = memos.filter((memo) => memo.id !== id);
        return true;
      },
      focusSession: async () => true,
      ackWaitingSession: noop,
      completeWaitingNudge: noop,
      setChatterEnabled: noop,
      setIgnoreMouse: noop,
      setInteractiveRegions: noop,
      startWindowDrag: noop,
      moveWindowDrag: noop,
      endWindowDrag: noop,
      onRequestScan: () => noop,
      onMemoDue: () => noop,
    };
  }

  return { createPreviewApi, PREVIEW_CONFIG, PREVIEW_MARKET_SNAPSHOT, PREVIEW_SNAPSHOT };
});
