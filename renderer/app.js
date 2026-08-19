const STATUS_TEXT = {
  working: "工作中",
  waiting: "等你",
  idle: "闲置",
  offline: "不在线",
};

const COW_SKINS = [
  {
    id: "original",
    name: "原版牛来",
    src: "../assets/niulai-neutral-animated-v1.png",
    expressions: {
      speaking: "../assets/niulai-speaking-v1.png",
      attention: "../assets/niulai-attention-v1.png",
      "attention-speaking": "../assets/niulai-attention-speaking-v1.png",
      blink: "../assets/niulai-blink-v1.png",
    },
  },
  { id: "skirt", name: "小裙子牛来", src: "../assets/niulai-skirt-v1.png" },
  { id: "headband", name: "头箍牛来", src: "../assets/niulai-headband-v1.png" },
  { id: "butt", name: "翘屁股牛来", src: "../assets/niulai-butt-v1.png" },
  { id: "study", name: "认真学习的牛来", src: "../assets/niulai-study-v1.png" },
  { id: "backpack", name: "背书包的牛来", src: "../assets/niulai-backpack-v1.png" },
  { id: "dance", name: "跳舞的牛来", src: "../assets/niulai-dance-v1.png" },
  { id: "football", name: "踢足球的牛来", src: "../assets/niulai-football-v1.png" },
  {
    id: "old-friend",
    name: "不是牛来的牛",
    src: {
      working: "../assets/cow-working.png",
      waiting: "../assets/cow-waiting.png",
      offline: "../assets/cow-offline.png",
    },
  },
];

const MOOD_COPY = {
  working: (counts) => `${counts.working} 个 Session 正在工作`,
  waiting: (counts) =>
    counts.waiting ? `${counts.waiting} 个 Session 在等你` : `${counts.idle} 个 Session 当前闲置`,
  offline: () => "现在很安静",
};

const PREVIEW_CONFIG = {
  pollMs: 5000,
  cowScale: 1,
  bubbleScale: 1,
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
      statusText: "等你",
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
      statusText: "等你",
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

function previewApi() {
  let previewConfig = structuredClone(PREVIEW_CONFIG);
  let previewMemos = [];
  return {
    scan: async () => ({ ...PREVIEW_SNAPSHOT, scannedAt: Date.now() }),
    getConfig: async () => previewConfig,
    saveConfig: async (next) => {
      previewConfig = next;
      return previewConfig;
    },
    chooseDirectory: async () => "/Users/you/.my-agent/sessions",
    hideApp: async () => true,
    quitApp: async () => true,
    listMemos: async () => previewMemos,
    saveMemo: async (memo) => {
      const saved = { id: `preview-${Date.now()}`, createdAt: Date.now(), ...memo };
      previewMemos = [saved, ...previewMemos];
      return saved;
    },
    completeMemo: async (id) => {
      previewMemos = previewMemos.filter((memo) => memo.id !== id);
      return true;
    },
    focusSession: async () => true,
    setIgnoreMouse: () => {},
    moveWindow: () => {},
    onRequestScan: () => () => {},
    onMemoDue: () => () => {},
  };
}

const api = window.niulai || previewApi();
const imageCache = new Map();
const processedImageCache = new Map();
let activeCanvas = "cowA";
let mood = "";
let currentSkinId = localStorage.getItem("niulai.cowSkin") || "original";
let activeRuntimeFilter = localStorage.getItem("niulai.runtimeFilter") || "all";
let activeStatusFilter = localStorage.getItem("niulai.statusFilter") || "working";
let config;
let latestRows = [];
let latestSnapshot = null;
let draftCustom = [];
let scanTimer;
let captionTimer;
let speakingTimer;
let blinkTimer;
let expressionTimer;
let toastTimer;
let cowClickTimer;
let pointerDown = null;
let suppressClick = false;
let memoReminder = "0";
let hasInitialSnapshot = false;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function imageFor(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const promise = new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
  imageCache.set(src, promise);
  return promise;
}

async function chromaDraw(src, canvas) {
  let processed = processedImageCache.get(src);
  if (!processed) {
    processed = (async () => {
      const image = await imageFor(src);
      const prepared = document.createElement("canvas");
      prepared.width = canvas.width;
      prepared.height = canvas.height;
      const preparedContext = prepared.getContext("2d", { willReadFrequently: true });
      preparedContext.drawImage(image, 0, 0, prepared.width, prepared.height);
      const imageData = preparedContext.getImageData(0, 0, prepared.width, prepared.height);
      const pixels = imageData.data;
      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index];
        const green = pixels[index + 1];
        const blue = pixels[index + 2];
        const magenta = Math.min(red, blue) - green;
        if (red > 145 && blue > 145 && magenta > 52) {
          const removal = Math.min(1, Math.max(0, (magenta - 52) / 54));
          pixels[index + 3] = Math.round(pixels[index + 3] * (1 - removal));
          if (removal < 1) {
            const clean = Math.max(green, Math.min(red, blue) * 0.56);
            pixels[index] = Math.round(red * (1 - removal) + clean * removal);
            pixels[index + 2] = Math.round(blue * (1 - removal) + clean * removal);
          }
        }
      }
      preparedContext.putImageData(imageData, 0, 0);
      return prepared;
    })();
    processedImageCache.set(src, processed);
  }
  const prepared = await processed;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(prepared, 0, 0, canvas.width, canvas.height);
}

function currentSkin() {
  return COW_SKINS.find((skin) => skin.id === currentSkinId) || COW_SKINS[0];
}

function cowSource(skin, nextMood) {
  if (typeof skin.src === "string") return skin.src;
  return skin.src[nextMood] || skin.src.waiting;
}

async function swapCowFrame(src) {
  const nextCanvas = activeCanvas === "cowA" ? "cowB" : "cowA";
  const incoming = document.getElementById(nextCanvas);
  const outgoing = document.getElementById(activeCanvas);
  await chromaDraw(src, incoming);
  incoming.classList.add("is-active");
  outgoing.classList.remove("is-active");
  activeCanvas = nextCanvas;
}

async function setCowExpression(expression = "base") {
  const skin = currentSkin();
  const source =
    expression === "base"
      ? cowSource(skin, mood || "waiting")
      : skin.expressions?.[expression] || cowSource(skin, mood || "waiting");
  await swapCowFrame(source);
  document.getElementById("pet").dataset.expression = expression;
}

async function setCow(nextMood, force = false) {
  if (!force && mood === nextMood) return;
  const previousMood = mood;
  mood = nextMood;
  await swapCowFrame(cowSource(currentSkin(), mood));
  const pet = document.getElementById("pet");
  pet.dataset.mood = mood;
  pet.dataset.skin = currentSkinId;
  pet.dataset.expression = "base";

  if (previousMood) {
    const stage = document.getElementById("cowStage");
    stage.classList.remove("is-state-changing");
    requestAnimationFrame(() => stage.classList.add("is-state-changing"));
    window.setTimeout(() => stage.classList.remove("is-state-changing"), 460);
  }
}

async function rollCow() {
  const candidates = COW_SKINS.filter((skin) => skin.id !== currentSkinId);
  const next = candidates[Math.floor(Math.random() * candidates.length)] || COW_SKINS[0];
  const button = document.getElementById("rollCow");
  const stage = document.getElementById("cowStage");
  button.classList.remove("is-rolling");
  stage.classList.remove("is-rolling");
  requestAnimationFrame(() => {
    button.classList.add("is-rolling");
    stage.classList.add("is-rolling");
  });
  currentSkinId = next.id;
  localStorage.setItem("niulai.cowSkin", currentSkinId);
  await new Promise((resolve) => window.setTimeout(resolve, 150));
  await setCow(mood || "waiting", true);
  showCaption(`Roll 到：${next.name}`, 2200);
  window.setTimeout(() => {
    button.classList.remove("is-rolling");
    stage.classList.remove("is-rolling");
  }, 600);
}

function runtimeGlyph(row) {
  const explicit = {
    cursor: "C",
    "claude-code": "CL",
    "claude-desktop": "CL",
    codex: "CX",
    grok: "GR",
    gemini: "G",
    opencode: "OC",
    pi: "π",
    copilot: "GH",
  };
  return explicit[row.runtime] || String(row.label || row.runtime || "?").slice(0, 2);
}

function runtimeQuality(id) {
  if (["cursor", "claude-code", "codex", "grok"].includes(id)) {
    return ["claude-code", "codex", "grok"].includes(id) ? "事件状态 · Token" : "事件级状态";
  }
  if (["claude-desktop", "gemini", "opencode", "pi"].includes(id)) return "Session 活动";
  return "基础检测";
}

function timeAgo(timestamp) {
  const delta = Math.max(0, Date.now() - Number(timestamp || 0));
  if (delta < 15000) return "刚刚";
  if (delta < 60000) return `${Math.floor(delta / 1000)} 秒前`;
  if (delta < 3600000) return `${Math.floor(delta / 60000)} 分前`;
  if (delta < 86400000) return `${Math.floor(delta / 3600000)} 小时前`;
  return `${Math.floor(delta / 86400000)} 天前`;
}

function formatTokens(tokens) {
  const value = Math.max(0, Number(tokens || 0));
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(value >= 10000000000 ? 1 : 2)}B`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 1 : 2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}K`;
  return String(Math.round(value));
}

function spokenText(message) {
  const text = String(message || "").trim();
  return /^哞[，。～~、！？!?]/.test(text) ? text : `哞，${text}`;
}

function stopSpeaking({ restore = true } = {}) {
  window.clearInterval(speakingTimer);
  window.clearTimeout(expressionTimer);
  const stage = document.getElementById("cowStage");
  stage?.classList.remove("is-speaking");
  if (restore && stage && !stage.classList.contains("is-observing-session")) {
    setCowExpression("base");
  }
  scheduleBlink();
}

function startSpeaking(duration, attention = false) {
  const stage = document.getElementById("cowStage");
  if (!stage) return;
  window.clearInterval(speakingTimer);
  window.clearTimeout(expressionTimer);
  window.clearTimeout(blinkTimer);
  stage.classList.add("is-speaking");
  const closed = attention ? "attention" : "base";
  const open = attention ? "attention-speaking" : "speaking";
  let mouthOpen = true;
  setCowExpression(open);
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    speakingTimer = window.setInterval(() => {
      mouthOpen = !mouthOpen;
      setCowExpression(mouthOpen ? open : closed);
    }, 260);
  }
  if (duration > 0) {
    expressionTimer = window.setTimeout(() => stopSpeaking(), duration);
  }
}

function scheduleBlink() {
  window.clearTimeout(blinkTimer);
  blinkTimer = window.setTimeout(async () => {
    const stage = document.getElementById("cowStage");
    if (
      currentSkin().expressions?.blink &&
      !stage.classList.contains("is-speaking") &&
      !stage.classList.contains("is-observing-session")
    ) {
      await setCowExpression("blink");
      window.setTimeout(() => setCowExpression("base"), 135);
    }
    scheduleBlink();
  }, 4200 + Math.random() * 3600);
}

function showCaption(message, duration = 1800, options = {}) {
  const caption = document.getElementById("cowCaption");
  caption.textContent = spokenText(message);
  caption.classList.add("is-visible");
  caption.classList.toggle("is-attention", Boolean(options.attention));
  window.clearTimeout(captionTimer);
  startSpeaking(duration, Boolean(options.attention));
  if (duration > 0) {
    captionTimer = window.setTimeout(() => {
      caption.classList.remove("is-visible", "is-attention", "is-session-focus");
    }, duration);
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 1800);
}

function reminderTimestamp(value) {
  if (value === "tomorrow") {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(9, 0, 0, 0);
    return date.getTime();
  }
  const delay = Number(value || 0);
  return delay > 0 ? Date.now() + delay : null;
}

function memoTimeText(memo) {
  if (!memo.remindAt) return "仅记录";
  return `提醒 ${new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(memo.remindAt))}`;
}

function updateMemoReminder(value) {
  memoReminder = value;
  for (const button of document.querySelectorAll("[data-remind]")) {
    button.classList.toggle("is-active", button.dataset.remind === value);
  }
  const copy = {
    "0": "未设置提醒",
    "900000": "15 分钟后提醒",
    "3600000": "1 小时后提醒",
    tomorrow: "明早 9 点提醒",
  };
  document.getElementById("memoMessage").textContent = copy[value] || "未设置提醒";
}

async function renderMemos() {
  const memos = await api.listMemos();
  document.getElementById("memoCount").textContent = String(memos.length);
  const list = document.getElementById("memoList");
  if (!memos.length) {
    list.innerHTML = '<p class="memo-empty">还没有 Memo。</p>';
    return;
  }
  list.innerHTML = memos
    .map(
      (memo) => `
        <div class="memo-item">
          <span>
            <strong title="${escapeHtml(memo.text)}">${escapeHtml(memo.text)}</strong>
            <small>${escapeHtml(memoTimeText(memo))}</small>
          </span>
          <button class="memo-done" type="button" data-complete-memo="${escapeHtml(memo.id)}"
                  aria-label="完成这条 Memo" title="完成">✓</button>
        </div>`
    )
    .join("");
}

async function openMemoPanel() {
  const panel = document.getElementById("quickMemo");
  panel.hidden = false;
  setPetMenuOpen(false);
  api.setIgnoreMouse(false);
  await renderMemos();
  document.getElementById("memoText").focus();
  showCaption("记吧，我帮你想着。", 1500);
}

function closeMemoPanel() {
  document.getElementById("quickMemo").hidden = true;
}

async function saveQuickMemo() {
  const input = document.getElementById("memoText");
  const text = input.value.trim();
  if (!text) {
    document.getElementById("memoMessage").textContent = "先写点什么";
    input.focus();
    return;
  }
  const remindAt = reminderTimestamp(memoReminder);
  await api.saveMemo({ text, remindAt });
  input.value = "";
  updateMemoReminder("0");
  await renderMemos();
  showCaption(remindAt ? "到点我叫你。" : "记住了。", 1700);
  showToast(remindAt ? "Memo 已保存并设置提醒" : "Memo 已保存");
}

function renderSummary(snapshot) {
  const { counts, scannedAt } = snapshot;
  document.getElementById("workingCount").textContent = counts.working || 0;
  document.getElementById("waitingCount").textContent = counts.waiting || 0;
  document.getElementById("idleCount").textContent = counts.idle || 0;
  document.getElementById("offlineCount").textContent = counts.offline || 0;
  document.getElementById("lastScan").textContent = `${timeAgo(scannedAt)}扫描`;
  document.getElementById("statusLine").textContent =
    (MOOD_COPY[snapshot.mood] || MOOD_COPY.waiting)(counts);
}

function renderTokenUsage(snapshot) {
  const usage = snapshot.tokenUsage || { tokens: 0, sources: [] };
  const total = document.getElementById("todayTokens");
  const sources = document.getElementById("tokenSources");
  total.textContent = formatTokens(usage.tokens);
  sources.textContent = usage.sources?.length
    ? usage.sources.map((source) => `${source.label} ${formatTokens(source.tokens)}`).join(" · ")
    : "Codex、Claude、Grok、Gemini 暂无今日记录";
  document.getElementById("tokenStrip").title =
    "只读取可核对的本机 usage：Codex、Claude Code、Grok Build、Gemini CLI。Cursor 本机 Session 未暴露实际 usage，因此不估算。";
}

function renderRuntimeFilters(rows) {
  const filters = document.getElementById("runtimeFilters");
  const runtimes = new Map();
  for (const row of rows) {
    const current = runtimes.get(row.runtime) || { label: row.label || row.runtime, count: 0 };
    current.count += 1;
    runtimes.set(row.runtime, current);
  }
  if (activeRuntimeFilter !== "all" && !runtimes.has(activeRuntimeFilter)) {
    activeRuntimeFilter = "all";
    localStorage.setItem("niulai.runtimeFilter", activeRuntimeFilter);
  }
  const items = [
    { id: "all", label: "全部", count: rows.length },
    ...[...runtimes.entries()].map(([id, runtime]) => ({ id, ...runtime })),
  ];
  filters.innerHTML = items
    .map(
      (item) => `
        <button type="button" class="runtime-filter ${item.id === activeRuntimeFilter ? "is-active" : ""}"
                data-runtime-filter="${escapeHtml(item.id)}"
                aria-pressed="${item.id === activeRuntimeFilter}">
          ${escapeHtml(item.label)} <span>${item.count}</span>
        </button>`
    )
    .join("");
}

function renderStatusFilters(rows) {
  const filters = document.getElementById("statusFilters");
  const counts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  const items = [
    { id: "working", label: "工作中", count: counts.working || 0 },
    { id: "waiting", label: "等你", count: counts.waiting || 0 },
    { id: "idle", label: "闲置", count: counts.idle || 0 },
    { id: "offline", label: "离线", count: counts.offline || 0 },
    { id: "all", label: "全部", count: rows.length },
  ];
  filters.innerHTML = items
    .map(
      (item) => `
        <button type="button" class="status-filter ${item.id === activeStatusFilter ? "is-active" : ""}"
                data-status-filter="${item.id}" aria-pressed="${item.id === activeStatusFilter}">
          <i class="${item.id}" aria-hidden="true"></i>${item.label} <span>${item.count}</span>
        </button>`
    )
    .join("");
}

function renderSessionRows(snapshot) {
  const list = document.getElementById("list");
  stopCowPointing();
  const runtimeRows =
    activeRuntimeFilter === "all"
      ? snapshot.rows
      : snapshot.rows.filter((row) => row.runtime === activeRuntimeFilter);
  const rows =
    activeStatusFilter === "all"
      ? runtimeRows
      : runtimeRows.filter((row) => row.status === activeStatusFilter);
  document.getElementById("sessionTotal").textContent =
    activeRuntimeFilter === "all" && activeStatusFilter === "all"
      ? `${rows.length} 个`
      : `${rows.length} / ${snapshot.rows.length} 个`;

  if (!rows.length) {
    list.innerHTML = `
      <li class="empty-state">
        <div>
          <strong>${snapshot.rows.length ? "当前筛选下没有 Session" : "暂时没发现 Session"}</strong>
          <span>${snapshot.rows.length ? "默认只看工作中；可切到“全部”查看其他状态。" : "打开一个支持的 Runtime，牛来会在下一次巡视时看见它。"}</span>
        </div>
      </li>`;
    stopCowPointing();
    return;
  }

  list.innerHTML = rows
    .map((row) => {
      const displayName = row.cwdName || row.title || row.label || "未命名 Session";
      const detail = row.cwd || row.file || "未记录工作目录";
      const stateText = row.statusText || STATUS_TEXT[row.status] || row.status;
      const stateReason = row.statusReason || stateText;
      const tokenText =
        row.tokensToday > 0
          ? ` · 今日 ${formatTokens(row.tokensToday)} tok`
          : row.runtime === "cursor"
            ? " · Token 未公开"
            : "";
      return `
        <li class="session-row" data-id="${escapeHtml(row.id)}" tabindex="0" role="button"
            title="${escapeHtml(stateReason)}"
            aria-label="打开 ${escapeHtml(row.label)} ${escapeHtml(displayName)}，${escapeHtml(stateText)}">
          <span class="status-dot ${escapeHtml(row.status)}" title="${escapeHtml(stateReason)}"></span>
          <span class="runtime-glyph" aria-hidden="true">${escapeHtml(runtimeGlyph(row))}</span>
          <span class="session-copy">
            <span class="session-title">
              <strong>${escapeHtml(displayName)}</strong>
              <span>${escapeHtml(row.label)} · ${escapeHtml(stateText)} · ${escapeHtml(timeAgo(row.activityAt || row.mtime))}${escapeHtml(tokenText)}</span>
            </span>
            <span class="session-path">${escapeHtml(detail)}</span>
          </span>
          <span class="open-arrow" aria-hidden="true">›</span>
        </li>`;
    })
    .join("");

  for (const element of list.querySelectorAll(".session-row")) {
    const open = () => openSession(element.dataset.id, element);
    element.addEventListener("click", open);
    element.addEventListener("pointerenter", () => pointCowAt(element));
    element.addEventListener("pointerleave", stopCowPointing);
    element.addEventListener("focus", () => pointCowAt(element));
    element.addEventListener("blur", stopCowPointing);
    element.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  }
}

function renderList(snapshot) {
  latestSnapshot = snapshot;
  latestRows = snapshot.rows;
  renderSummary(snapshot);
  renderTokenUsage(snapshot);
  renderStatusFilters(snapshot.rows);
  renderRuntimeFilters(snapshot.rows);
  renderSessionRows(snapshot);
}

async function openSession(id, element) {
  const row = latestRows.find((item) => String(item.id) === String(id));
  if (!row) return;
  element.classList.add("is-opening");
  showCaption(`打开 ${row.label}。`);
  try {
    const opened = await api.focusSession(row);
    if (!opened) throw new Error("no target");
    showToast(`已切换到 ${row.label}`);
  } catch {
    showToast(`没找到 ${row.label} App，没有打开项目目录`);
  } finally {
    window.setTimeout(() => element.classList.remove("is-opening"), 480);
  }
}

function pointCowAt(element) {
  const bubble = document.getElementById("bubble");
  if (bubble.classList.contains("is-collapsed")) return;
  const pet = document.getElementById("pet");
  const stage = document.getElementById("cowStage");
  pet.classList.add("is-observing-session");
  stage.classList.add("is-observing-session");
  document.querySelector(".session-row.is-pointed-at")?.classList.remove("is-pointed-at");
  element.classList.add("is-pointed-at");
  const row = latestRows.find((item) => String(item.id) === String(element.dataset.id));
  if (row) {
    const caption = document.getElementById("cowCaption");
    showCaption(`${row.label} · ${row.statusText || STATUS_TEXT[row.status] || row.status}`, 0, {
      attention: true,
    });
    caption.classList.add("is-session-focus");
  }
}

function stopCowPointing() {
  const pet = document.getElementById("pet");
  pet?.classList.remove("is-observing-session");
  document.getElementById("cowStage")?.classList.remove("is-observing-session");
  document.querySelector(".session-row.is-pointed-at")?.classList.remove("is-pointed-at");
  const caption = document.getElementById("cowCaption");
  caption?.classList.remove("is-session-focus", "is-visible");
  stopSpeaking();
  if (!pointerDown) {
    pet?.style.setProperty("--look-x", "0px");
    pet?.style.setProperty("--look-y", "0px");
  }
}

function announceStatusChanges(previousRows, nextRows) {
  if (!hasInitialSnapshot) return;
  const previous = new Map(previousRows.map((row) => [String(row.id), row.status]));
  const priority = { working: 0, waiting: 1, idle: 2, offline: 3 };
  const changes = nextRows
    .filter((row) => previous.has(String(row.id)) && previous.get(String(row.id)) !== row.status)
    .sort((a, b) => (priority[a.status] ?? 9) - (priority[b.status] ?? 9));
  if (!changes.length) return;
  const row = changes[0];
  const name = row.cwdName || row.title || row.label;
  const copy = {
    working: `${name} 开始干活了。`,
    waiting: `${name} 做完这轮，在等你。`,
    idle: `${name} 歇下来了。`,
    offline: `${row.label} 下线了。`,
  };
  const suffix = changes.length > 1 ? ` 还有 ${changes.length - 1} 条也变了。` : "";
  showCaption(`${copy[row.status] || `${name} 状态变了。`}${suffix}`, 4200);
}

async function tick() {
  const beacon = document.getElementById("liveBeacon");
  beacon.classList.add("is-scanning");
  beacon.title = "正在扫描";
  try {
    const snapshot = await api.scan();
    const previousRows = latestRows;
    renderList(snapshot);
    await setCow(snapshot.mood);
    announceStatusChanges(previousRows, snapshot.rows);
    hasInitialSnapshot = true;
    beacon.title = "扫描正常";
  } catch (error) {
    document.getElementById("statusLine").textContent = "扫描暂时失败";
    document.getElementById("lastScan").textContent = "等待重试";
    beacon.title = "扫描失败";
    showToast(`扫描失败：${error.message || error}`);
  } finally {
    beacon.classList.remove("is-scanning");
  }
}

function syncMenuBubbleAction(collapsed) {
  const action = document.querySelector("#menuToggleBubble span");
  if (action) action.textContent = collapsed ? "展开气泡" : "收起气泡";
  document.getElementById("menuToggleBubble")?.classList.toggle("will-expand", collapsed);
}

function setPetMenuOpen(open) {
  const menu = document.getElementById("petMenu");
  const button = document.getElementById("petMenuButton");
  menu.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  button.classList.toggle("is-active", open);
  if (open) {
    const collapsed = document.getElementById("bubble").classList.contains("is-collapsed");
    syncMenuBubbleAction(collapsed);
  }
}

function setBubbleCollapsed(collapsed) {
  const bubble = document.getElementById("bubble");
  const toggle = document.getElementById("toggleBubble");
  bubble.classList.toggle("is-collapsed", collapsed);
  toggle.setAttribute("aria-expanded", String(!collapsed));
  localStorage.setItem("niulai.bubbleCollapsed", String(collapsed));
  syncMenuBubbleAction(collapsed);
  if (collapsed) stopCowPointing();
  showCaption(collapsed ? "我先收好。" : "都在这里。", 1200);
}

function toggleBubble() {
  const bubble = document.getElementById("bubble");
  setBubbleCollapsed(!bubble.classList.contains("is-collapsed"));
}

function petCow() {
  const stage = document.getElementById("cowStage");
  stage.classList.remove("is-petted");
  requestAnimationFrame(() => stage.classList.add("is-petted"));
  showCaption(mood === "working" ? "忙着呢，也可以摸一下。" : "哞～", 1800);
  window.setTimeout(() => stage.classList.remove("is-petted"), 720);
}

function bindCowInteraction() {
  const stage = document.getElementById("cowStage");
  const pet = document.getElementById("pet");

  stage.addEventListener("pointermove", (event) => {
    if (pointerDown) {
      const deltaX = event.screenX - pointerDown.screenX;
      const deltaY = event.screenY - pointerDown.screenY;
      const distance = Math.hypot(
        event.clientX - pointerDown.clientX,
        event.clientY - pointerDown.clientY
      );
      if (distance > 4) {
        pointerDown.dragging = true;
        stage.classList.add("is-dragging");
      }
      if (pointerDown.dragging && (deltaX || deltaY)) {
        api.moveWindow(deltaX, deltaY);
        pointerDown.screenX = event.screenX;
        pointerDown.screenY = event.screenY;
      }
      return;
    }

    const rect = stage.getBoundingClientRect();
    const lookX = ((event.clientX - rect.left) / rect.width - 0.5) * 7;
    const lookY = ((event.clientY - rect.top) / rect.height - 0.5) * 4;
    pet.style.setProperty("--look-x", `${lookX.toFixed(2)}px`);
    pet.style.setProperty("--look-y", `${lookY.toFixed(2)}px`);
  });

  stage.addEventListener("pointerleave", () => {
    if (!pointerDown) {
      pet.style.setProperty("--look-x", "0px");
      pet.style.setProperty("--look-y", "0px");
    }
  });

  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    stage.setPointerCapture(event.pointerId);
    pointerDown = {
      pointerId: event.pointerId,
      screenX: event.screenX,
      screenY: event.screenY,
      clientX: event.clientX,
      clientY: event.clientY,
      dragging: false,
    };
  });

  const finishPointer = (event) => {
    if (!pointerDown || pointerDown.pointerId !== event.pointerId) return;
    suppressClick = pointerDown.dragging;
    pointerDown = null;
    stage.classList.remove("is-dragging");
    window.setTimeout(() => {
      suppressClick = false;
    }, 0);
  };

  stage.addEventListener("pointerup", finishPointer);
  stage.addEventListener("pointercancel", finishPointer);

  stage.addEventListener("click", () => {
    if (suppressClick) return;
    window.clearTimeout(cowClickTimer);
    cowClickTimer = window.setTimeout(toggleBubble, 230);
  });

  stage.addEventListener("dblclick", () => {
    if (suppressClick) return;
    window.clearTimeout(cowClickTimer);
    petCow();
  });

  stage.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openMemoPanel();
  });

  stage.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      openMemoPanel();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (event.shiftKey) petCow();
      else toggleBubble();
    }
  });
}

function bindMemo() {
  const panel = document.getElementById("quickMemo");
  document.getElementById("memoButton").addEventListener("click", () => {
    if (panel.hidden) openMemoPanel();
    else closeMemoPanel();
  });
  document.getElementById("closeMemo").addEventListener("click", closeMemoPanel);
  document.getElementById("saveMemo").addEventListener("click", saveQuickMemo);
  document.getElementById("memoText").addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      saveQuickMemo();
    }
  });
  document.querySelector(".reminder-presets").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remind]");
    if (button) updateMemoReminder(button.dataset.remind);
  });
  document.getElementById("memoList").addEventListener("click", async (event) => {
    const button = event.target.closest("[data-complete-memo]");
    if (!button) return;
    await api.completeMemo(button.dataset.completeMemo);
    await renderMemos();
    showToast("Memo 已完成");
  });
  if (typeof api.onMemoDue === "function") {
    api.onMemoDue((memo) => {
      showCaption(`提醒：${memo.text}`, 5000);
      showToast("有一条 Memo 到时间了");
      if (!panel.hidden) renderMemos();
    });
  }
}

function normalizedScale(value, fallback = 1) {
  const scale = Number(value);
  return Number.isFinite(scale) ? Math.max(0.7, Math.min(1.3, scale)) : fallback;
}

function applyDisplayScale(nextConfig) {
  const pet = document.getElementById("pet");
  pet.style.setProperty("--cow-scale", String(normalizedScale(nextConfig?.cowScale)));
  pet.style.setProperty("--bubble-scale", String(normalizedScale(nextConfig?.bubbleScale)));
}

function syncScaleControls(nextConfig) {
  const cowPercent = Math.round(normalizedScale(nextConfig?.cowScale) * 100);
  const bubblePercent = Math.round(normalizedScale(nextConfig?.bubbleScale) * 100);
  document.getElementById("cowScale").value = String(cowPercent);
  document.getElementById("bubbleScale").value = String(bubblePercent);
  document.getElementById("cowScaleValue").textContent = `${cowPercent}%`;
  document.getElementById("bubbleScaleValue").textContent = `${bubblePercent}%`;
}

function fillSettings(nextConfig) {
  const box = document.getElementById("runtimeToggles");
  box.innerHTML = Object.entries(nextConfig.runtimes || {})
    .map(
      ([id, runtime]) => `
        <label class="runtime-toggle">
          <input type="checkbox" data-rt="${escapeHtml(id)}" ${runtime.enabled === false ? "" : "checked"} />
          <span class="runtime-toggle-copy">
            <strong>${escapeHtml(runtime.label || id)}</strong>
            <span>${escapeHtml(runtimeQuality(id))}</span>
          </span>
        </label>`
    )
    .join("");
  syncScaleControls(nextConfig);
  draftCustom = structuredClone(nextConfig.custom || []);
  renderCustomRuntimes();
  hideCustomEditor();
}

function renderCustomRuntimes() {
  const list = document.getElementById("customRuntimeList");
  if (!draftCustom.length) {
    list.innerHTML = '<p class="custom-empty">还没有添加其他 Runtime。</p>';
    return;
  }
  list.innerHTML = draftCustom
    .map(
      (item, index) => `
        <div class="custom-runtime-item">
          <span>
            <strong>${escapeHtml(item.label || item.id)}</strong>
            <small>${escapeHtml(item.glob || "未设置文件夹")}</small>
          </span>
          <button class="icon-button light remove-custom" type="button" data-remove-custom="${index}"
                  aria-label="移除 ${escapeHtml(item.label || item.id)}" title="移除">×</button>
        </div>`
    )
    .join("");
}

function setSettingsMessage(message, isError = false) {
  const element = document.getElementById("settingsError");
  element.textContent = message;
  element.classList.toggle("is-error", isError);
}

function showCustomEditor() {
  document.getElementById("customEditor").hidden = false;
  document.getElementById("customName").focus();
}

function hideCustomEditor() {
  document.getElementById("customEditor").hidden = true;
  document.getElementById("customName").value = "";
  document.getElementById("customPath").value = "";
  document.getElementById("customProcess").value = "";
}

function addCustomRuntime() {
  const label = document.getElementById("customName").value.trim();
  const glob = document.getElementById("customPath").value.trim();
  const processName = document.getElementById("customProcess").value.trim();
  if (!label) {
    setSettingsMessage("先给这个 Runtime 起个名字。", true);
    document.getElementById("customName").focus();
    return;
  }
  if (!glob) {
    setSettingsMessage("请选择它保存 Session 的文件夹。", true);
    document.getElementById("customPath").focus();
    return;
  }
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "") || "runtime";
  draftCustom.push({
    id: `custom-${slug}-${Date.now().toString(36)}`,
    label,
    enabled: true,
    glob,
    process: processName ? [processName] : [],
  });
  renderCustomRuntimes();
  hideCustomEditor();
  setSettingsMessage("已加入列表，保存后开始监控。");
}

function closeSettings() {
  const settings = document.getElementById("settings");
  if (settings.open) settings.close();
}

async function saveSettings() {
  const next = structuredClone(config);
  for (const input of document.querySelectorAll("#runtimeToggles input[data-rt]")) {
    next.runtimes[input.dataset.rt].enabled = input.checked;
  }
  next.cowScale = Number(document.getElementById("cowScale").value) / 100;
  next.bubbleScale = Number(document.getElementById("bubbleScale").value) / 100;
  next.custom = structuredClone(draftCustom);
  setSettingsMessage("正在保存…");
  config = await api.saveConfig(next);
  applyDisplayScale(config);
  closeSettings();
  showToast("巡视范围已更新");
  await tick();
}

function bindSettings() {
  const settings = document.getElementById("settings");
  document.getElementById("gear").addEventListener("click", () => {
    setPetMenuOpen(false);
    closeMemoPanel();
    fillSettings(config);
    settings.showModal();
    api.setIgnoreMouse(false);
  });
  document.getElementById("closeSettings").addEventListener("click", closeSettings);
  document.getElementById("cancelSettings").addEventListener("click", closeSettings);
  document.getElementById("saveSettings").addEventListener("click", saveSettings);
  document.getElementById("showCustomEditor").addEventListener("click", showCustomEditor);
  document.getElementById("cancelCustom").addEventListener("click", hideCustomEditor);
  document.getElementById("addCustom").addEventListener("click", addCustomRuntime);
  for (const id of ["cowScale", "bubbleScale"]) {
    document.getElementById(id).addEventListener("input", () => {
      const preview = {
        cowScale: Number(document.getElementById("cowScale").value) / 100,
        bubbleScale: Number(document.getElementById("bubbleScale").value) / 100,
      };
      syncScaleControls(preview);
      applyDisplayScale(preview);
    });
  }
  document.getElementById("pickCustomPath").addEventListener("click", async () => {
    const selected = await api.chooseDirectory();
    if (selected) document.getElementById("customPath").value = selected;
  });
  document.getElementById("customRuntimeList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-custom]");
    if (!button) return;
    draftCustom.splice(Number(button.dataset.removeCustom), 1);
    renderCustomRuntimes();
    setSettingsMessage("已从列表移除，保存后生效。");
  });
  settings.addEventListener("close", () => {
    applyDisplayScale(config);
    setSettingsMessage("开启你常用的 Runtime，列表会更安静也更准确。");
  });
}

function armMousePassthrough() {
  const interactive = [
    document.getElementById("bubble"),
    document.getElementById("cowStage"),
    document.getElementById("quickMemo"),
    document.getElementById("settings"),
  ];
  let leaveTimer;
  const enter = () => {
    window.clearTimeout(leaveTimer);
    api.setIgnoreMouse(false);
  };
  const leave = () => {
    window.clearTimeout(leaveTimer);
    leaveTimer = window.setTimeout(() => {
      if (!document.getElementById("settings").open) api.setIgnoreMouse(true);
    }, 80);
  };
  for (const element of interactive) {
    element.addEventListener("mouseenter", enter);
    element.addEventListener("mouseleave", leave);
  }
  api.setIgnoreMouse(true);
}

function scheduleScanning() {
  window.clearInterval(scanTimer);
  scanTimer = window.setInterval(() => {
    if (!document.hidden) tick();
  }, config.pollMs || 2500);
}

function bindTopControls() {
  document.getElementById("rollCow").addEventListener("click", (event) => {
    event.stopPropagation();
    setPetMenuOpen(false);
    rollCow();
  });
  document.getElementById("petMenuButton").addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = document.getElementById("petMenu");
    setPetMenuOpen(menu.hidden);
  });
  document.getElementById("menuToggleBubble").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleBubble();
    setPetMenuOpen(false);
  });
  document.getElementById("menuHideApp").addEventListener("click", async (event) => {
    event.stopPropagation();
    setPetMenuOpen(false);
    closeMemoPanel();
    showToast("已隐藏，按 ⌘⇧U 唤回");
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    await api.hideApp();
  });
  document.getElementById("menuQuitApp").addEventListener("click", async (event) => {
    event.stopPropagation();
    showToast("桌宠已退出");
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    await api.quitApp();
  });
  document.getElementById("runtimeFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-runtime-filter]");
    if (!button || !latestSnapshot) return;
    activeRuntimeFilter = button.dataset.runtimeFilter;
    localStorage.setItem("niulai.runtimeFilter", activeRuntimeFilter);
    renderRuntimeFilters(latestSnapshot.rows);
    renderSessionRows(latestSnapshot);
  });
  document.getElementById("statusFilters").addEventListener("click", (event) => {
    const button = event.target.closest("[data-status-filter]");
    if (!button || !latestSnapshot) return;
    activeStatusFilter = button.dataset.statusFilter;
    localStorage.setItem("niulai.statusFilter", activeStatusFilter);
    renderStatusFilters(latestSnapshot.rows);
    renderSessionRows(latestSnapshot);
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("#petMenu, #petMenuButton")) setPetMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") setPetMenuOpen(false);
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  if (!COW_SKINS.some((skin) => skin.id === currentSkinId)) currentSkinId = "original";
  const collapsed = localStorage.getItem("niulai.bubbleCollapsed") === "true";
  setBubbleCollapsed(collapsed);
  bindCowInteraction();
  bindMemo();
  bindSettings();
  bindTopControls();
  armMousePassthrough();
  document.getElementById("toggleBubble").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleBubble();
  });

  const cowSources = new Set(
    COW_SKINS.flatMap((skin) => [
      ...(typeof skin.src === "string" ? [skin.src] : Object.values(skin.src)),
      ...Object.values(skin.expressions || {}),
    ])
  );
  await Promise.all([...cowSources].map(imageFor));
  await setCow("waiting", true);
  config = await api.getConfig();
  applyDisplayScale(config);
  fillSettings(config);
  await tick();
  scheduleScanning();
  scheduleBlink();
  if (typeof api.onRequestScan === "function") api.onRequestScan(tick);
});
