const { shouldIgnoreMouse } = window.niulMousePassthrough;
const { createGrassAlertTracker } = window.niulGrassAlert;
const {
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
} = window.niulaiSessionView;

const APPEARANCE_STORAGE_KEY = "niulai.appearance";

const STATUS_CHANGE = {
  working: (row) => `${sessionName(row)} 套上犁了。`,
  waiting: waitingCopy,
  idle: (row) => `${sessionName(row)} 去吃草了。`,
  offline: (row) => `${row.label} 回棚了。`,
};

const COW_SKINS = [
  {
    id: "original",
    name: "原版牛来",
    src: "../assets/niulai-neutral-animated-v1.png",
    expressions: {
      turning: "../assets/niulai-turning-v1.png",
      "speaking-half": "../assets/niulai-speaking-half-v1.png",
      speaking: "../assets/niulai-speaking-v1.png",
      attention: "../assets/niulai-attention-v1.png",
      "attention-speaking-half": "../assets/niulai-attention-speaking-half-v1.png",
      "attention-speaking": "../assets/niulai-attention-speaking-v1.png",
      blink: "../assets/niulai-blink-v1.png",
    },
  },
  {
    id: "skirt",
    name: "小裙子牛来",
    src: "../assets/niulai-skirt-v1.png",
    face: { eyes: [[39, 21], [50, 21]], mouth: [42, 31, 15] },
  },
  {
    id: "headband",
    name: "头箍牛来",
    src: "../assets/niulai-headband-v1.png",
    face: { eyes: [[39, 21], [50, 21]], mouth: [42, 31, 15] },
  },
  {
    id: "butt",
    name: "翘屁股牛来",
    src: "../assets/niulai-butt-v1.png",
    face: { eyes: [[28, 27], [40, 27]], mouth: [34, 37, 15] },
  },
  {
    id: "study",
    name: "认真学习的牛来",
    src: "../assets/niulai-study-v1.png",
    face: { eyes: [[38, 27], [49, 27]], mouth: [41, 38, 15] },
  },
  {
    id: "backpack",
    name: "背书包的牛来",
    src: "../assets/niulai-backpack-v1.png",
    face: { eyes: [[36, 21], [47, 21]], mouth: [39, 30, 15] },
  },
  {
    id: "dance",
    name: "跳舞的牛来",
    src: "../assets/niulai-dance-v1.png",
    face: { eyes: [[41, 21], [52, 21]], mouth: [46, 29, 15] },
  },
  {
    id: "football",
    name: "踢足球的牛来",
    src: "../assets/niulai-football-v1.png",
    face: { eyes: [[46, 24], [57, 24]], mouth: [50, 34, 15] },
  },
  {
    id: "old-friend",
    name: "不是牛来的牛",
    bothCompatible: false,
    src: {
      working: "../assets/cow-working.png",
      waiting: "../assets/cow-waiting.png",
      offline: "../assets/cow-offline.png",
    },
    face: {
      eyes: [[44.7, 24.2, 7.8, 8], [60.7, 24.6, 5.8, 7.5]],
      mouth: [54, 41, 13],
    },
  },
];

const HORSE_CHARACTER = {
  name: "马来",
  src: "../assets/malai-neutral-v1.png",
  expressions: {
    attention: "../assets/malai-attention-v1.png",
    turning: "../assets/malai-attention-v1.png",
    blink: "../assets/malai-blink-v1.png",
  },
};

const {
  normalizePetMode,
  petModeProfile,
  prefixPetSpeech,
} = window.niulPetMode;

const MOOD_COPY = {
  working: (counts) => `${counts.working} 头在拉犁`,
  waiting: (counts, rows = []) => {
    const allow = rows.filter((row) => waitWhyOf(row) === "allow").length;
    if (allow) return `${allow} 头停犁等你点允许`;
    return counts.waiting ? `${counts.waiting} 头停犁等你` : `${counts.idle} 头在吃草`;
  },
  offline: () => "牛棚里很安静",
};

const { createPreviewApi, PREVIEW_CONFIG, PREVIEW_SNAPSHOT } = window.niulaiPreviewApi;
const api = window.niulai || createPreviewApi();
const herdPreviewParams = new URLSearchParams(window.location.search);
let menuBarShellMode = herdPreviewParams.get("shell") === "menu-bar";
document.documentElement.dataset.shellMode = menuBarShellMode ? "menu-bar" : "desktop";
const herdPreviewActive =
  herdPreviewParams.get("herdPreview") === "1" && Boolean(window.niulaiHerdPreview);
const herdModeForced =
  herdPreviewParams.get("herdMode") === "1" &&
  Boolean(window.niulaiHerdMode) &&
  Boolean(window.niulaiHerdRuntime) &&
  Boolean(window.niulaiHerdPreview);
const imageCache = new Map();
const processedImageCache = new Map();
const characterFrames = {
  cow: { activeCanvas: "cowA", source: "", requestId: 0, canvases: ["cowA", "cowB"] },
  horse: { activeCanvas: "horseA", source: "", requestId: 0, canvases: ["horseA", "horseB"] },
};
let mood = "";
let petMode = "cow";
let currentSkinId = localStorage.getItem("niulai.cowSkin") || "original";
let activeRuntimeFilter = "all";
localStorage.setItem("niulai.runtimeFilter", activeRuntimeFilter);
const STATUS_FILTER_VERSION = "3";
const PERSISTED_STATUS_FILTERS = new Set(["working", "waiting", "idle", "offline"]);
function restoreStatusFilter() {
  const stored =
    localStorage.getItem("niulai.statusFilterVersion") === STATUS_FILTER_VERSION
      ? localStorage.getItem("niulai.statusFilter")
      : "";
  return PERSISTED_STATUS_FILTERS.has(stored) ? stored : "waiting";
}
let activeStatusFilter = restoreStatusFilter();
localStorage.setItem("niulai.statusFilter", activeStatusFilter);
localStorage.setItem("niulai.statusFilterVersion", STATUS_FILTER_VERSION);
let config;
let latestRows = [];
let latestSnapshot = null;
let pendingMenuBarFocusId = "";
let pendingMenuBarFocusExpiresAt = 0;
let activeBubbleOverlay = null;
let overlayReturnFocus = null;
let lastListRenderKey = "";
let draftCustom = [];
let scanTimer;
let marketTimer;
let tickInFlight = false;
let marketTickInFlight = false;
let captionTimer;
let speakingTimer;
let blinkTimer;
let ambientMotionTimer;
let ambientMotionEndTimer;
let expressionTimer;
let attentionTimer;
let stateChangeTimer;
let stateChangeFrame;
let marketReactionTimer;
let marketReactionFlushTimer;
let toastTimer;
let cowClickTimer;
let mooMarathonTimer;
let mooCountdownTimer;
let mooMarathonEndsAt = 0;
let cowClickBurst = [];
let pointerDown = null;
let suppressClick = false;
let memoReminder = "0";
let hasInitialSnapshot = false;
let chatterEnabled = localStorage.getItem("niulai.chatter") !== "false";
const grassAlerts = createGrassAlertTracker(localStorage);
let latestMarketSnapshot = null;
let pendingMarketReaction = null;
let priorityBusyUntil = 0;
let herdPreviewController = null;
let herdFocusedSessionId = "";
let herdRuntimeController = null;
let herdRuntimeState = window.niulaiHerdMode?.createEmptyHerdState?.() || null;
let herdModeActive = false;
let petVisualsVisible = false;
let cowInteractionCleanup = null;
let passthroughReady = false;
let lastScanError = "";

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

async function prepareCowFrame(src) {
  let processed = processedImageCache.get(src);
  if (!processed) {
    processed = (async () => {
      const image = await imageFor(src);
      const prepared = document.createElement("canvas");
      prepared.width = 420;
      prepared.height = 420;
      const preparedContext = prepared.getContext("2d", { willReadFrequently: true });
      preparedContext.drawImage(image, 0, 0, prepared.width, prepared.height);
      const imageData = preparedContext.getImageData(0, 0, prepared.width, prepared.height);
      const pixels = imageData.data;
      const rowStride = prepared.width * 4;
      for (let y = 0; y < prepared.height; y += 1) {
        const rowEnd = (y + 1) * rowStride;
        for (let index = y * rowStride; index < rowEnd; index += 4) {
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
        // Chroma-keying several herd skins must never monopolize the renderer.
        if (y > 0 && y % 84 === 0) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
      preparedContext.putImageData(imageData, 0, 0);
      return prepared;
    })();
    processedImageCache.set(src, processed);
  }
  return processed;
}

function drawPreparedFrame(prepared, canvas) {
  const context = canvas.getContext("2d");
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

function applyFaceProfile(skin) {
  const pet = document.getElementById("pet");
  const stage = document.getElementById("cowStage");
  const profile = skin.face;
  pet.dataset.faceFx = profile ? "fallback" : "native";
  if (!profile) return;
  const [[leftX, leftY, leftWidth, leftHeight], [rightX, rightY, rightWidth, rightHeight]] =
    profile.eyes;
  const [mouthX, mouthY, mouthWidth] = profile.mouth;
  stage.style.setProperty("--face-eye-left-x", `${leftX}%`);
  stage.style.setProperty("--face-eye-left-y", `${leftY}%`);
  stage.style.setProperty("--face-eye-right-x", `${rightX}%`);
  stage.style.setProperty("--face-eye-right-y", `${rightY}%`);
  stage.style.setProperty("--face-eye-left-width", leftWidth ? `${leftWidth}%` : "30px");
  stage.style.setProperty("--face-eye-left-height", leftHeight ? `${leftHeight}%` : "18px");
  stage.style.setProperty("--face-eye-right-width", rightWidth ? `${rightWidth}%` : "30px");
  stage.style.setProperty("--face-eye-right-height", rightHeight ? `${rightHeight}%` : "18px");
  stage.style.setProperty("--face-mouth-x", `${mouthX}%`);
  stage.style.setProperty("--face-mouth-y", `${mouthY}%`);
  stage.style.setProperty("--face-mouth-width", `${mouthWidth}%`);
}

async function swapCharacterFrame(character, src) {
  const state = characterFrames[character];
  if (!state || !petVisualsVisible) return false;
  const requestId = ++state.requestId;
  if (!src || src === state.source) return false;
  const prepared = await prepareCowFrame(src);
  if (requestId !== state.requestId) return false;
  const nextCanvas = state.activeCanvas === state.canvases[0] ? state.canvases[1] : state.canvases[0];
  const incoming = document.getElementById(nextCanvas);
  const outgoing = document.getElementById(state.activeCanvas);
  drawPreparedFrame(prepared, incoming);
  incoming.classList.add("is-active");
  outgoing.classList.remove("is-active");
  state.activeCanvas = nextCanvas;
  state.source = src;
  return true;
}

function swapCowFrame(src) {
  return swapCharacterFrame("cow", src);
}

function swapHorseFrame(src) {
  return swapCharacterFrame("horse", src);
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

function horseExpressionSource(expression) {
  if (expression === "blink") return HORSE_CHARACTER.expressions.blink;
  if (expression === "attention" || expression === "turning" || expression.startsWith("attention-")) {
    return HORSE_CHARACTER.expressions.attention;
  }
  return HORSE_CHARACTER.src;
}

async function setHorseExpression(expression = "base") {
  await swapHorseFrame(horseExpressionSource(expression));
}

function activePetProfile() {
  return petModeProfile(petMode);
}

function setPetExpression(expression = "base") {
  if (!petVisualsVisible) {
    document.getElementById("pet").dataset.expression = expression;
    return Promise.resolve([]);
  }
  const profile = activePetProfile();
  const updates = [];
  if (profile.includesCow) updates.push(setCowExpression(expression));
  if (profile.includesHorse) updates.push(setHorseExpression(expression));
  document.getElementById("pet").dataset.expression = expression;
  return Promise.all(updates);
}

function syncRollControl() {
  const button = document.getElementById("rollCow");
  if (!button) return;
  const available = !menuBarShellMode && activePetProfile().includesCow;
  button.disabled = !available;
  button.setAttribute("aria-disabled", String(!available));
  button.setAttribute(
    "aria-label",
    available
      ? "随机换一只牛"
      : menuBarShellMode
        ? "回到桌面后可换牛"
        : "马模式暂无其他造型"
  );
  button.title = available
    ? "Roll 一只牛"
    : menuBarShellMode
      ? "回到桌面后可换牛"
      : "马模式暂无其他造型";
}

async function applyPetMode(nextMode) {
  petMode = normalizePetMode(nextMode);
  if (petMode === "both" && currentSkin().bothCompatible === false) {
    currentSkinId = "original";
    localStorage.setItem("niulai.cowSkin", currentSkinId);
  }
  const profile = activePetProfile();
  const pet = document.getElementById("pet");
  const stage = document.getElementById("cowStage");
  pet.dataset.petMode = petMode;
  stage.setAttribute(
    "aria-label",
    `${profile.subject}桌宠。单击展开状态，拖动移动，双击抚摸，右键快速记事`
  );
  document.getElementById("horseActor").setAttribute("aria-hidden", String(!profile.includesHorse));
  applyFaceProfile(currentSkin());
  syncRollControl();
  syncChatterMenu();
  syncMooMarathon();
  if (petVisualsVisible) await setPetExpression(restingCowExpression());
  requestAnimationFrame(syncInteractiveRegions);
}

async function setCow(nextMood, force = false) {
  if (!force && mood === nextMood) return;
  const previousMood = mood;
  mood = nextMood;
  const skin = currentSkin();
  applyFaceProfile(skin);
  const pet = document.getElementById("pet");
  pet.dataset.mood = mood;
  pet.dataset.skin = currentSkinId;
  pet.dataset.expression = "base";
  if (!petVisualsVisible) return;
  if (activePetProfile().includesCow) await swapCowFrame(cowSource(skin, mood));

  if (previousMood) {
    const stage = document.getElementById("cowStage");
    window.clearTimeout(stateChangeTimer);
    window.cancelAnimationFrame(stateChangeFrame);
    stage.classList.remove("is-state-changing");
    stateChangeFrame = requestAnimationFrame(() => stage.classList.add("is-state-changing"));
    stateChangeTimer = window.setTimeout(() => stage.classList.remove("is-state-changing"), 460);
  }
}

async function rollCow() {
  if (menuBarShellMode || !activePetProfile().includesCow) return;
  const candidates = COW_SKINS.filter(
    (skin) =>
      skin.id !== currentSkinId &&
      (petMode !== "both" || skin.bothCompatible !== false)
  );
  const next = candidates[Math.floor(Math.random() * candidates.length)] || COW_SKINS[0];
  if (!petVisualsVisible) {
    currentSkinId = next.id;
    localStorage.setItem("niulai.cowSkin", currentSkinId);
    showToast(`Roll 到：${next.name}，放回桌面就能看到`);
    return;
  }
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

const MARKET_INDEX_ORDER = [
  { id: "sse", shortName: "上证" },
  { id: "szse", shortName: "深证" },
  { id: "chinext", shortName: "创业板" },
  { id: "csi300", shortName: "沪深300" },
  { id: "hsi", shortName: "恒生" },
  { id: "spx", shortName: "标普500" },
  { id: "ndx", shortName: "纳指100" },
  { id: "djia", shortName: "道琼斯" },
];

function formatMarketNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(number);
}

function formatMarketPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return `${number > 0 ? "+" : ""}${number.toFixed(2)}%`;
}

function marketDirection(value) {
  const number = Number(value || 0);
  if (number > 0) return "up";
  if (number < 0) return "down";
  return "flat";
}

function applyAppearance(theme, { persist = true } = {}) {
  theme = theme === "light" ? "light" : "dark";
  document.documentElement.dataset.theme = theme;
  if (persist) localStorage.setItem(APPEARANCE_STORAGE_KEY, theme);
  document.getElementById("menuThemeLabel").textContent =
    theme === "dark" ? "切换到浅色" : "切换到深色";
  document.getElementById("menuThemeHint").textContent =
    theme === "dark" ? "当前为深色外观" : "当前为浅色外观";
  const sun = document.querySelector("#menuToggleTheme .theme-icon-sun");
  const moon = document.querySelector("#menuToggleTheme .theme-icon-moon");
  sun.hidden = theme === "light";
  sun.setAttribute("aria-hidden", String(theme === "light"));
  moon.hidden = theme === "dark";
  moon.setAttribute("aria-hidden", String(theme === "dark"));
}

function setActiveBubbleOverlay(name) {
  const next =
    name === "memo" || name === "market" || name === "settings" ? name : null;
  const previous = activeBubbleOverlay;
  const focused = document.activeElement;
  if (
    next &&
    focused instanceof HTMLElement &&
    (previous === null || focused.closest(".head-actions"))
  ) {
    overlayReturnFocus = focused;
  }
  if (activeBubbleOverlay === "settings" && next !== "settings") {
    applyDisplayScale(config);
  }
  activeBubbleOverlay = next;
  document.getElementById("quickMemo").hidden = activeBubbleOverlay !== "memo";
  document.getElementById("marketBoard").hidden = activeBubbleOverlay !== "market";
  document.getElementById("settings").hidden = activeBubbleOverlay !== "settings";
  for (const [buttonId, overlayName] of [
    ["memoButton", "memo"],
    ["marketButton", "market"],
    ["gear", "settings"],
  ]) {
    const button = document.getElementById(buttonId);
    const selected = activeBubbleOverlay === overlayName;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-pressed", String(selected));
  }
  for (const id of ["summaryRail", "bubbleBody"]) {
    const covered = document.getElementById(id);
    const hiddenByWorkspace = Boolean(activeBubbleOverlay);
    covered.inert = hiddenByWorkspace;
    covered.setAttribute("aria-hidden", String(hiddenByWorkspace));
  }
  if (activeBubbleOverlay) {
    setPetMenuOpen(false);
    api.setIgnoreMouse(false);
  }
  if (previous && !activeBubbleOverlay) {
    const returnTarget = overlayReturnFocus;
    overlayReturnFocus = null;
    window.requestAnimationFrame(() => {
      if (returnTarget instanceof HTMLElement && returnTarget.isConnected) {
        returnTarget.focus();
      }
    });
  }
}

function renderMarket(snapshot) {
  const board = document.getElementById("marketBoard");
  const grid = document.getElementById("marketGrid");
  const meta = document.getElementById("marketMeta");
  const enabled = config?.market?.enabled !== false;
  if (!enabled) {
    latestMarketSnapshot = snapshot;
    if (activeBubbleOverlay === "market") setActiveBubbleOverlay(null);
    return;
  }

  latestMarketSnapshot = snapshot;
  board.classList.toggle("is-stale", snapshot?.status === "stale");
  board.classList.toggle("is-unavailable", snapshot?.status === "unavailable");
  const provider = snapshot?.providerLabel || "东方财富";

  if (!snapshot || snapshot.status === "unavailable") {
    meta.textContent = `${provider} · 暂时连不上`;
    meta.title = snapshot?.error || "稍后自动重试";
    grid.className = "market-grid is-empty";
    grid.innerHTML = '<span class="market-empty">行情暂时没回来，牛会自己重试。</span>';
    return;
  }

  if (snapshot.status === "stale") {
    meta.textContent = `${provider} · 数据可能延迟`;
  } else if (snapshot.error) {
    meta.textContent = `${provider} · 使用上次数据，正在重试`;
  } else {
    meta.textContent = `${provider} · ${timeAgo(snapshot.fetchedAt)}更新`;
  }
  meta.title = snapshot.error || "主要指数行情，可能存在延迟";

  const byId = new Map((snapshot.quotes || []).map((quote) => [quote.id, quote]));
  grid.className = "market-grid";
  grid.innerHTML = MARKET_INDEX_ORDER.map((definition) => {
    const quote = byId.get(definition.id);
    if (!quote) {
      return `
        <div class="market-quote is-flat is-missing" aria-label="${definition.shortName} 暂无数据">
          <span class="market-quote-name">${definition.shortName}</span>
          <i class="market-quote-change">—</i>
          <b class="market-quote-price">—</b>
        </div>`;
    }
    const direction = marketDirection(quote.changePct);
    const arrow = direction === "up" ? "↑" : direction === "down" ? "↓" : "·";
    const price = formatMarketNumber(quote.price);
    const percent = formatMarketPercent(quote.changePct);
    const movement = direction === "up" ? "上涨" : direction === "down" ? "下跌" : "平盘";
    const freshness = quote.status === "stale" ? " is-stale" : "";
    const delayCopy = quote.status === "stale" ? "，数据可能延迟" : "";
    return `
      <div class="market-quote is-${direction}${freshness}" tabindex="0" data-market-id="${escapeHtml(quote.id)}"
           aria-label="${escapeHtml(quote.name)} ${price}，${movement} ${percent}${delayCopy}">
        <span class="market-quote-name">${escapeHtml(quote.shortName || quote.name)}</span>
        <i class="market-quote-change">${arrow} ${percent}</i>
        <b class="market-quote-price">${price}</b>
      </div>`;
  }).join("");

  for (const element of grid.querySelectorAll("[data-market-id]")) {
    element.addEventListener("pointerenter", () => pointCowAtMarket(element));
    element.addEventListener("pointerleave", stopCowPointing);
    element.addEventListener("focus", () => pointCowAtMarket(element));
    element.addEventListener("blur", stopCowPointing);
  }
}

function marketReactionCopy(event) {
  const percent = formatMarketPercent(event.changePct);
  const name = event.shortName || event.name;
  if (event.reversal) {
    return `${name}${event.direction === "up" ? "翻红" : "翻绿"}了，现在 ${percent}。`;
  }
  if (event.band >= 2) {
    return `今天风有点大，${name}${event.direction === "up" ? "涨到" : "跌到"} ${percent}。`;
  }
  if (event.band >= 1) {
    return `${name}${event.direction === "up" ? "今天跑得挺快" : "今天有点颠"}，${percent}。`;
  }
  if (event.band >= 0.5) {
    return `${name}${event.direction === "up" ? "有点来劲" : "往下滑了"}，${percent}。`;
  }
  return `${name}${event.direction === "up" ? "开始往上拱了" : "往下走了"}，${percent}。`;
}

function marketReactionIsBlocked() {
  const stage = document.getElementById("cowStage");
  if (herdModeActive) return Boolean(activeBubbleOverlay);
  return (
    Date.now() < priorityBusyUntil ||
    Boolean(pointerDown) ||
    Boolean(activeBubbleOverlay) ||
    stage?.matches(
      ".is-speaking, .is-observing-session, .is-petted, .is-rolling, .is-dragging, .is-moo-marathon"
    )
  );
}

function markPriorityBusy(duration) {
  priorityBusyUntil = Math.max(priorityBusyUntil, Date.now() + duration);
  window.clearTimeout(marketReactionFlushTimer);
  marketReactionFlushTimer = window.setTimeout(flushMarketReaction, duration + 80);
}

function flushMarketReaction() {
  window.clearTimeout(marketReactionFlushTimer);
  const event = pendingMarketReaction;
  if (!event) return;
  if (
    !chatterEnabled ||
    config?.market?.enabled === false ||
    config?.market?.reactionsEnabled === false ||
    Date.now() > Number(event.expiresAt || 0)
  ) {
    pendingMarketReaction = null;
    return;
  }
  if (marketReactionIsBlocked()) {
    marketReactionFlushTimer = window.setTimeout(flushMarketReaction, 800);
    return;
  }

  pendingMarketReaction = null;
  const suffix = event.additionalCount ? ` 另外 ${event.additionalCount} 个指数也有动静。` : "";
  if (herdModeActive) {
    announceHerdMarket(`${marketReactionCopy(event)}${suffix}`, 3600);
    if (event.band >= 1) playCowMoo("short");
    return;
  }
  const stage = document.getElementById("cowStage");
  if (petVisualsVisible) {
    const className = event.direction === "up" ? "is-market-reacting-up" : "is-market-reacting-down";
    stage.classList.remove("is-market-reacting-up", "is-market-reacting-down");
    requestAnimationFrame(() => stage.classList.add(className));
    window.clearTimeout(marketReactionTimer);
    marketReactionTimer = window.setTimeout(
      () => stage.classList.remove("is-market-reacting-up", "is-market-reacting-down"),
      820
    );
  }
  showCaption(`${marketReactionCopy(event)}${suffix}`, 3600, {
    speechDuration: event.band >= 1 ? 1300 : 900,
  });
  if (event.band >= 1) playPetVoice("short");
}

function queueMarketReaction(event) {
  if (!event) return;
  if (!pendingMarketReaction || Math.abs(event.changePct) >= Math.abs(pendingMarketReaction.changePct)) {
    pendingMarketReaction = event;
  }
  flushMarketReaction();
}

function spokenText(message) {
  return prefixPetSpeech(petMode, message);
}

function playPetVoice(kind = "medium") {
  if (!petVisualsVisible) return;
  const profile = activePetProfile();
  if (profile.includesCow && profile.includesHorse) {
    playCowMoo(kind, 0, 0.68);
    playHorseNeigh(kind, 0.06, 0.64);
    return;
  }
  if (profile.includesCow) playCowMoo(kind);
  if (profile.includesHorse) playHorseNeigh(kind);
}

function restingCowExpression() {
  const stage = document.getElementById("cowStage");
  const pet = document.getElementById("pet");
  return stage?.classList.contains("is-observing-session") ||
    pet?.classList.contains("is-wait-attention")
    ? "attention"
    : "base";
}

function stopSpeaking({ restore = true } = {}) {
  window.clearInterval(speakingTimer);
  window.clearTimeout(expressionTimer);
  const stage = document.getElementById("cowStage");
  stage?.classList.remove("is-speaking");
  if (petVisualsVisible && restore && stage) {
    setPetExpression(restingCowExpression());
  }
  if (petVisualsVisible) scheduleBlink();
}

function startSpeaking(duration, attention = false) {
  const stage = document.getElementById("cowStage");
  if (!petVisualsVisible || !stage) return;
  window.clearInterval(speakingTimer);
  window.clearTimeout(expressionTimer);
  window.clearTimeout(blinkTimer);
  stage.classList.add("is-speaking");
  const frames = attention
    ? ["attention-speaking-half", "attention-speaking", "attention-speaking-half", "attention"]
    : ["speaking-half", "speaking", "speaking-half", "base"];
  let frame = 0;
  setPetExpression(frames[frame]);
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    speakingTimer = window.setInterval(() => {
      frame = (frame + 1) % frames.length;
      setPetExpression(frames[frame]);
    }, 135);
  }
  if (duration > 0) {
    expressionTimer = window.setTimeout(() => stopSpeaking(), duration);
  }
}

function scheduleBlink() {
  window.clearTimeout(blinkTimer);
  if (!petVisualsVisible) {
    blinkTimer = null;
    return;
  }
  blinkTimer = window.setTimeout(async () => {
    if (!petVisualsVisible) return;
    const stage = document.getElementById("cowStage");
    const profile = activePetProfile();
    const canBlink =
      (profile.includesCow && Boolean(currentSkin().expressions?.blink)) ||
      profile.includesHorse;
    if (
      canBlink &&
      !stage.classList.contains("is-speaking") &&
      !stage.classList.contains("is-observing-session") &&
      !document.getElementById("pet")?.classList.contains("is-wait-attention")
    ) {
      await setPetExpression("blink");
      window.setTimeout(() => setPetExpression(restingCowExpression()), 135);
    }
    scheduleBlink();
  }, 4200 + Math.random() * 3600);
}

function scheduleAmbientMotion(delay = 3200 + Math.random() * 2800) {
  window.clearTimeout(ambientMotionTimer);
  window.clearTimeout(ambientMotionEndTimer);
  if (!petVisualsVisible) {
    ambientMotionTimer = null;
    ambientMotionEndTimer = null;
    return;
  }
  ambientMotionTimer = window.setTimeout(() => {
    if (!petVisualsVisible) return;
    const stage = document.getElementById("cowStage");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const isBusy =
      !stage ||
      document.hidden ||
      pointerDown ||
      document.getElementById("pet")?.classList.contains("is-wait-attention") ||
      stage.matches(
        ".is-speaking, .is-observing-session, .is-state-changing, .is-petted, .is-rolling, .is-dragging"
      );
    if (isBusy) {
      scheduleAmbientMotion(1800);
      return;
    }
    const durationBySkin = {
      study: 1600,
      backpack: 1400,
      dance: 1500,
      football: 1500,
    };
    const duration =
      durationBySkin[currentSkinId] || (mood === "working" ? 900 : mood === "offline" ? 1200 : 1100);
    stage.classList.add("is-ambient-moving");
    ambientMotionEndTimer = window.setTimeout(() => {
      stage.classList.remove("is-ambient-moving");
      scheduleAmbientMotion();
    }, duration + 40);
  }, delay);
}

function showCaption(message, duration = 1800, options = {}) {
  const caption = document.getElementById("cowCaption");
  if (!petVisualsVisible) {
    caption.classList.remove("is-visible", "is-attention", "is-session-focus");
    showToast(message, duration > 0 ? Math.min(duration, 5000) : 1800);
    return;
  }
  caption.textContent = spokenText(message);
  caption.classList.add("is-visible");
  caption.classList.toggle("is-attention", Boolean(options.attention));
  window.clearTimeout(captionTimer);
  if (options.speak !== false) {
    const speechDuration =
      options.speechDuration ?? Math.min(duration > 0 ? duration : 1100, 1800);
    startSpeaking(speechDuration, Boolean(options.attention));
  }
  if (duration > 0) {
    captionTimer = window.setTimeout(() => {
      caption.classList.remove("is-visible", "is-attention", "is-session-focus");
    }, duration);
  }
}

function showToast(message, duration = 1800) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), duration);
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
  if (document.getElementById("bubble").classList.contains("is-collapsed")) {
    setBubbleCollapsed(false, { silent: true });
  }
  setActiveBubbleOverlay("memo");
  await renderMemos();
  document.getElementById("memoText").focus();
  showCaption("记吧，我帮你想着。", 1500);
}

function closeMemoPanel() {
  setActiveBubbleOverlay(null);
}

function openMarketPanel() {
  if (config?.market?.enabled === false) return;
  if (document.getElementById("bubble").classList.contains("is-collapsed")) {
    setBubbleCollapsed(false, { silent: true });
  }
  setActiveBubbleOverlay("market");
  window.requestAnimationFrame(() => document.getElementById("closeMarket").focus());
}

function closeMarketPanel() {
  setActiveBubbleOverlay(null);
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
  const savedMessage = remindAt ? "记下了。到点我叫你。" : "记下了，我替你惦记。";
  if (!announceHerdMemo(savedMessage, 2200)) showCaption(savedMessage, 1700);
  showToast(remindAt ? "Memo 已保存并设置提醒" : "Memo 已保存");
}

function statusCaptionText(snapshot) {
  const counts = snapshot.counts || {};
  const filter = activeStatusFilter === "all" ? "all" : activeStatusFilter;
  const count = Number(counts[filter] || 0);
  if (filter === "waiting") {
    return count ? `有 ${count} 个任务等你回来接着走。` : "暂时没有任务等你回来接着走。";
  }
  if (filter === "working") {
    return count ? `有 ${count} 个任务正在进行。` : "暂时没有任务正在进行。";
  }
  if (filter === "idle") {
    return count ? `有 ${count} 个任务暂时空闲。` : "暂时没有任务空闲。";
  }
  if (filter === "offline") {
    return count ? `有 ${count} 个任务暂未连接。` : "暂时没有任务未连接。";
  }
  return "暂时没有需要盯着的任务。";
}

function renderSummary(snapshot) {
  const { counts } = snapshot;
  document.getElementById("workingCount").textContent = counts.working || 0;
  document.getElementById("waitingCount").textContent = counts.waiting || 0;
  document.getElementById("idleCount").textContent = counts.idle || 0;
  document.getElementById("offlineCount").textContent = counts.offline || 0;
  document.getElementById("statusLine").textContent = "刚刚巡视";
  document.getElementById("statusCaption").textContent = statusCaptionText(snapshot);
}

function renderTokenUsage(snapshot) {
  const usage = snapshot.tokenUsage || { tokens: 0, sources: [] };
  const total = document.getElementById("todayTokens");
  const sources = document.getElementById("tokenSources");
  const hasPartial = usage.sources?.some(
    (source) => source.tokens > 0 && source.confidence === "partial"
  );
  total.textContent = `${hasPartial ? "≥" : ""}${formatTokens(usage.tokens)}`;
  const details = usage.sources?.length
    ? usage.sources.map((source) => {
        if (!source.tokens && source.confidence === "estimated") {
          return `${source.label} 旧日志≈${formatTokens(source.estimatedTokens)}（未计）`;
        }
        const exact = `${source.label} 今日 ${source.confidence === "partial" ? "≥" : ""}${formatTokens(source.tokens)}`;
        return source.estimatedTokens ? `${exact} · 另有旧日志估算未计` : exact;
      })
    : [];
  const rateLimit = usage.rateLimit || usage.sources?.find((source) => source.id === "codex")?.rateLimit;
  const hasRateLimit = Boolean(
    rateLimit &&
      Number.isFinite(Number(rateLimit.remainingPercent)) &&
    Number(rateLimit.resetsAt) > Date.now()
  );
  sources.textContent = hasRateLimit
    ? `Codex 还剩 ${rateLimit.remainingPercent}%`
    : details.length
      ? "本机日志用量已汇总"
      : "暂无今日记录";
  const tooltip = [`今日总计 ${hasPartial ? "≥" : ""}${formatTokens(usage.tokens)}`, ...details];
  if (hasRateLimit) {
    tooltip.push(
      `Codex 配额还剩 ${rateLimit.remainingPercent}%（${new Date(rateLimit.resetsAt).toLocaleString()} 重置）`
    );
  }
  document.getElementById("tokenStrip").title = tooltip.join(" · ");
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
  const rail = document.getElementById("summaryRail");
  const counts = rows.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  for (const button of rail.querySelectorAll("[data-status-filter]")) {
    const id = button.dataset.statusFilter;
    const active = id === activeStatusFilter;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
    const count = document.getElementById(`${id}Count`);
    count.textContent = String(counts[id] || 0);
  }
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
  document.getElementById("sessionHeading").textContent =
    STATUS_HEADING[activeStatusFilter] || "Session";
  document.getElementById("sessionTotal").textContent = `${rows.length} 个`;

  if (!rows.length) {
    const filtered = snapshot.rows.length > 0;
    const runtimeSummary = enabledRuntimeSummary();
    list.innerHTML = filtered
      ? `
      <li class="empty-state">
        <div>
          <strong>当前筛选下没有 Session</strong>
          <span>当前只看「${STATUS_TEXT[activeStatusFilter] || STATUS_TEXT.waiting}」。上面还有其他状态，或点「全部」看完整巡视。</span>
          <div class="empty-actions">
            <button type="button" class="empty-action" data-empty-action="show-all">查看全部</button>
          </div>
        </div>
      </li>`
      : snapshot.onlineMissing?.length
        ? `
      <li class="empty-state">
        <div>
          <strong>暂时没发现 Session</strong>
          <span>${snapshot.onlineMissing.map((item) => item.label).join("、")} 开着，但我没看见 Session。点齿轮看看路径？</span>
          <div class="empty-actions">
            <button type="button" class="empty-action" data-empty-action="open-settings">打开设置</button>
          </div>
        </div>
      </li>`
        : `
      <li class="empty-state">
        <div>
          <strong>暂时没发现 Session</strong>
          <span>默认只看「${STATUS_TEXT.waiting}」。打开 ${runtimeSummary} 后，牛来会在下次巡视看见。隐藏后按 ⌘⇧U；点齿轮可开关 Runtime。</span>
          <div class="empty-actions">
            <button type="button" class="empty-action" data-empty-action="open-settings">打开设置</button>
          </div>
        </div>
      </li>`;
    stopCowPointing();
    return;
  }

  list.innerHTML = rows
    .map((row) => {
      const displayName = row.cwdName || row.title || row.label || "未命名 Session";
      const detail = row.cwd || row.file || "未记录工作目录";
      const stateText = rowStateText(row);
      const stateReason = row.statusReason || stateText;
      const workSummary = sessionWorkSummary(
        row,
        displayName,
        row.statusReason || stateText
      );
      const tokenText =
        row.tokensToday > 0
          ? ` · 今日 ${formatTokens(row.tokensToday)} tok`
          : row.runtime === "cursor"
            ? " · Token 未公开"
            : "";
      return `
        <li class="session-row ${escapeHtml(row.status)}" data-id="${escapeHtml(row.id)}"
            data-status="${escapeHtml(row.status)}" tabindex="0" role="button"
            title="${escapeHtml(stateReason)}${escapeHtml(tokenText)}"
            aria-label="打开 ${escapeHtml(row.label)} ${escapeHtml(displayName)}，${escapeHtml(stateText)}${escapeHtml(tokenText)}">
          <span class="session-rail" aria-hidden="true"></span>
          <span class="session-copy">
            <span class="session-identity">
              <strong class="session-name">${escapeHtml(displayName)}</strong>
              <span class="session-summary" title="${escapeHtml(workSummary)}">${escapeHtml(workSummary)}</span>
            </span>
            <span class="session-work">
              <span class="session-path" title="${escapeHtml(detail)}">${escapeHtml(compactDisplayPath(detail))}</span>
              <span class="session-agent">${escapeHtml(row.label)} · ${escapeHtml(timeAgo(row.activityAt || row.mtime))}</span>
            </span>
          </span>
          <span class="open-arrow" aria-hidden="true">›</span>
        </li>`;
    })
    .join("");

  for (const element of list.querySelectorAll(".session-row")) {
    element.classList.toggle(
      "is-herd-focus",
      (herdPreviewActive || herdModeActive) &&
        String(element.dataset.id) === herdFocusedSessionId
    );
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
  applyPendingMenuBarFocus();
}

function applyPendingMenuBarFocus() {
  if (!pendingMenuBarFocusId) return false;
  if (Date.now() > pendingMenuBarFocusExpiresAt) {
    pendingMenuBarFocusId = "";
    pendingMenuBarFocusExpiresAt = 0;
    return false;
  }
  const row = Array.from(document.querySelectorAll(".session-row")).find(
    (element) => String(element.dataset.id) === pendingMenuBarFocusId
  );
  if (!row) return false;
  pendingMenuBarFocusId = "";
  pendingMenuBarFocusExpiresAt = 0;
  document
    .querySelector(".session-row.is-menu-bar-highlighted")
    ?.classList.remove("is-menu-bar-highlighted");
  row.classList.add("is-menu-bar-highlighted");
  row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  row.focus({ preventScroll: true });
  window.setTimeout(() => row.classList.remove("is-menu-bar-highlighted"), 4200);
  return true;
}

function focusMenuBarSession(id) {
  pendingMenuBarFocusId = String(id || "");
  pendingMenuBarFocusExpiresAt = Date.now() + 10_000;
  if (!pendingMenuBarFocusId) return;
  setActiveBubbleOverlay(null);
  setPetMenuOpen(false);
  setBubbleCollapsed(false, { silent: true });
  activeStatusFilter = "waiting";
  activeRuntimeFilter = "all";
  localStorage.setItem("niulai.statusFilter", activeStatusFilter);
  localStorage.setItem("niulai.runtimeFilter", activeRuntimeFilter);
  if (latestSnapshot) {
    renderRuntimeFilters(latestSnapshot.rows);
    renderStatusFilters(latestSnapshot.rows);
    renderSummary(latestSnapshot);
    renderSessionRows(latestSnapshot);
  }
}

function enabledRuntimeSummary() {
  const labels = Object.values(config?.runtimes || {})
    .filter((item) => item && item.enabled !== false && item.label)
    .map((item) => escapeHtml(item.label));
  if (!labels.length) return "Cursor、Claude Code、Codex";
  if (labels.length <= 5) return labels.join("、");
  return `${labels.slice(0, 5).join("、")} 等`;
}

function renderList(snapshot) {
  latestSnapshot = snapshot;
  latestRows = snapshot.rows;
  renderSummary(snapshot);
  const renderKey = JSON.stringify({
    minute: Math.floor(Date.now() / 60000),
    rows: snapshot.rows.map((row) => [
      row.id,
      row.runtime,
      row.label,
      row.status,
      row.statusText,
      row.statusReason,
      row.statusConfidence,
      row.waitWhy,
      row.subagentsWorking,
      row.activityAt,
      row.mtime,
      row.cwd,
      row.cwdName,
      row.title,
      row.workSummary,
      row.file,
      row.tokensToday,
    ]),
    tokens: snapshot.tokenUsage?.sources?.map((source) => [
      source.id,
      source.tokens,
      source.estimatedTokens,
      source.confidence,
    ]),
  });
  if (renderKey === lastListRenderKey) return false;
  lastListRenderKey = renderKey;
  renderTokenUsage(snapshot);
  renderStatusFilters(snapshot.rows);
  renderRuntimeFilters(snapshot.rows);
  renderSessionRows(snapshot);
  return true;
}

function herdSnapshotForActors(actors) {
  const rows = actors
    .filter((actor) => actor.kind === "session")
    .map((actor, index) => ({
      id: actor.targetId,
      runtime: actor.runtimeId || `preview-${index}`,
      label: actor.runtimeLabel || actor.shortLabel || "Agent",
      status: actor.status,
      cwdName: actor.project || `herd-project-${index + 1}`,
      cwd: `/Users/you/code/${actor.project || `herd-project-${index + 1}`}`,
      title: actor.caption,
      workSummary: actor.status === "waiting" ? "等你接着走" : "牛群切片里的真实职责映射",
      mtime: Date.now() - index * 37_000,
    }));
  const counts = { working: 0, waiting: 0, idle: 0, offline: 0 };
  for (const row of rows) counts[row.status] = (counts[row.status] || 0) + 1;
  return {
    ...PREVIEW_SNAPSHOT,
    scannedAt: Date.now(),
    mood: counts.working ? "working" : counts.waiting ? "waiting" : counts.idle ? "idle" : "offline",
    counts,
    rows,
  };
}

function syncHerdPreviewRows() {
  if (!herdPreviewController) return;
  const sessionIds = new Set(
    herdPreviewController.actors
      .filter((actor) => actor.kind === "session")
      .map((actor) => String(actor.targetId))
  );
  if (herdFocusedSessionId && !sessionIds.has(herdFocusedSessionId)) {
    herdFocusedSessionId = "";
  }
  lastListRenderKey = "";
  renderList(herdSnapshotForActors(herdPreviewController.actors));
}

function focusHerdSession(targetId) {
  herdFocusedSessionId = String(targetId);
  if (!latestSnapshot?.rows?.some((row) => String(row.id) === String(targetId))) {
    syncHerdPreviewRows();
  }
  setActiveBubbleOverlay(null);
  setPetMenuOpen(false);
  setBubbleCollapsed(false, { silent: true });
  activeStatusFilter = "all";
  activeRuntimeFilter = "all";
  localStorage.setItem("niulai.statusFilter", activeStatusFilter);
  localStorage.setItem("niulai.runtimeFilter", activeRuntimeFilter);
  if (latestSnapshot) {
    renderRuntimeFilters(latestSnapshot.rows);
    renderStatusFilters(latestSnapshot.rows);
    renderSummary(latestSnapshot);
    renderSessionRows(latestSnapshot);
  }
  document.querySelector(".session-row.is-herd-focus")?.classList.remove("is-herd-focus");
  const row = Array.from(document.querySelectorAll(".session-row")).find(
    (element) => String(element.dataset.id) === String(targetId)
  );
  if (!row) {
    showToast("这头牛认领的 Session 暂时不在列表里");
    return;
  }
  row.classList.add("is-herd-focus");
  row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  showToast("已亮出它认领的 Session；点列表才会切换 Runtime");
}

function herdSkinOptions() {
  return COW_SKINS.map((skin) => ({ ...skin, src: cowSource(skin, "waiting") }));
}

function herdMountOptions(stage) {
  return {
    stage,
    skins: herdSkinOptions(),
    soundEnabled: config?.soundEnabled !== false,
    actorScale: normalizedScale(config?.cowScale),
    prepareFrame: prepareCowFrame,
    drawFrame: drawPreparedFrame,
    onArmAudio: armPetAudio,
    onGroupMoo: (kind) => playCowMoo(kind),
    onSingleMoo: (kind) => playCowMoo(kind),
    onOpenMemo: openMemoPanel,
    onOpenMarket: openMarketPanel,
    onFocusSession: focusHerdSession,
    onMarathonToggle: toggleMooMarathon,
    onLayoutChange: syncInteractiveRegions,
    getBounds: () => cowBoundsInWindow(stage),
    onDragStart: ({ originX, originY, screenX, screenY, bounds }) =>
      api.startWindowDrag({ originX, originY, screenX, screenY, cowBounds: bounds }),
    onDragMove: (screenX, screenY, bounds) => api.moveWindowDrag(screenX, screenY, bounds),
    onDragEnd: () => api.endWindowDrag(),
  };
}

function enableHerdRollControl() {
  const roll = document.getElementById("rollCow");
  roll.disabled = false;
  roll.setAttribute("aria-disabled", "false");
  roll.setAttribute("aria-label", "重抽所有 Session 牛造型");
  roll.title = "Roll 全群 Session 牛";
}

function mountHerdSlice() {
  if (!herdPreviewActive || herdPreviewController) return;
  const stage = document.getElementById("cowStage");
  const pet = document.getElementById("pet");
  pet.dataset.herdPreview = "true";
  pet.dataset.petMode = "cow";
  petMode = "cow";
  const count = window.niulaiHerdPreview.normalizePreviewCount(
    herdPreviewParams.get("herdCount")
  );
  herdPreviewController = window.niulaiHerdPreview.mountHerdPreview({
    ...herdMountOptions(stage),
    count,
    onSoundChange: (enabled) => setCowSoundEnabled(enabled),
    onCountChange: (nextCount) => {
      herdPreviewParams.set("herdCount", String(nextCount));
      window.history.replaceState({}, "", `${window.location.pathname}?${herdPreviewParams}`);
      queueMicrotask(syncHerdPreviewRows);
      requestAnimationFrame(syncInteractiveRegions);
    },
  });
  enableHerdRollControl();
  syncHerdPreviewRows();
  requestAnimationFrame(syncInteractiveRegions);
}

function mountHerdRuntime() {
  if (!petVisualsVisible || herdRuntimeController) return;
  const stage = document.getElementById("cowStage");
  const pet = document.getElementById("pet");
  herdModeActive = true;
  pet.dataset.herdMode = "true";
  pet.dataset.petMode = "cow";
  stage.dataset.herdMode = "true";
  petMode = "cow";
  herdRuntimeController = window.niulaiHerdPreview.mountHerdPreview({
    ...herdMountOptions(stage),
    actors: [],
    introduceOnMount: false,
    previewMode: false,
    showToolbar: false,
    onActorsChange: (actors, event) => {
      if (event?.type !== "roll" || !herdRuntimeState) return;
      herdRuntimeState = {
        ...herdRuntimeState,
        actors,
        skinMemory: {
          ...(herdRuntimeState.skinMemory || {}),
          ...Object.fromEntries(
            actors
              .filter((actor) => actor.kind === "session")
              .map((actor) => [actor.id, actor.skinId])
          ),
        },
        revision: (herdRuntimeState.revision || 0) + 1,
      };
    },
  });
  enableHerdRollControl();
  requestAnimationFrame(syncInteractiveRegions);
}

function stopSinglePetMotion() {
  for (const timer of [
    blinkTimer,
    ambientMotionTimer,
    ambientMotionEndTimer,
    expressionTimer,
    attentionTimer,
    stateChangeTimer,
    captionTimer,
  ]) {
    window.clearTimeout(timer);
  }
  window.clearInterval(speakingTimer);
  window.cancelAnimationFrame(stateChangeFrame);
  blinkTimer = null;
  ambientMotionTimer = null;
  ambientMotionEndTimer = null;
  expressionTimer = null;
  attentionTimer = null;
  stateChangeTimer = null;
  stateChangeFrame = null;
  captionTimer = null;
  speakingTimer = null;
}

function destroyHerdRuntime({ resetState = false } = {}) {
  const stage = document.getElementById("cowStage");
  const pet = document.getElementById("pet");
  herdRuntimeController?.destroy();
  herdRuntimeController = null;
  if (resetState) herdRuntimeState = window.niulaiHerdMode.createEmptyHerdState();
  herdModeActive = false;
  delete pet.dataset.herdMode;
  delete stage.dataset.herdMode;
  delete stage.dataset.herdReadyMs;
  delete stage.dataset.herdFirstReadyMs;
}

async function setHerdModeEnabled(enabled) {
  const next = Boolean(enabled) && petVisualsVisible;
  if (next === herdModeActive) return;
  const stage = document.getElementById("cowStage");
  if (next) {
    cowInteractionCleanup?.();
    stopSinglePetMotion();
    if (mooMarathonEndsAt) stopMooMarathon(false);
    mountHerdRuntime();
    reconcileHerdRuntime(latestSnapshot);
  } else {
    destroyHerdRuntime({ resetState: true });
    stage.setAttribute("role", "button");
    stage.setAttribute("tabindex", "0");
    stage.setAttribute(
      "aria-label",
      "牛来。单击展开状态，拖动移动，双击抚摸，右键快速记事"
    );
    await applyPetMode(config?.petMode);
    await setCow(latestSnapshot?.mood || mood || "waiting", true);
    bindCowInteraction();
    scheduleBlink();
    scheduleAmbientMotion();
    syncRollControl();
  }
  requestAnimationFrame(syncInteractiveRegions);
  syncMousePassthrough();
}

function shouldShowPetVisuals(nextConfig = config) {
  if (menuBarShellMode) return false;
  return herdPreviewActive || herdModeForced || nextConfig?.showPetVisuals !== false;
}

async function setPetVisualsVisible(visible) {
  const next = menuBarShellMode
    ? false
    : herdPreviewActive || herdModeForced || Boolean(visible);
  const pet = document.getElementById("pet");
  const stage = document.getElementById("cowStage");
  const roll = document.getElementById("rollCow");
  petVisualsVisible = next;
  pet.dataset.petVisuals = next ? "shown" : "hidden";

  if (!next) {
    for (const frame of Object.values(characterFrames)) frame.requestId += 1;
    cowInteractionCleanup?.();
    if (mooMarathonEndsAt) stopMooMarathon(false);
    stopCowPointing();
    stopSinglePetMotion();
    destroyHerdRuntime({ resetState: false });
    stage.hidden = true;
    stage.setAttribute("aria-hidden", "true");
    stage.removeAttribute("role");
    stage.removeAttribute("tabindex");
    stage.classList.remove(
      "is-speaking",
      "is-observing-session",
      "is-state-changing",
      "is-petted",
      "is-rolling",
      "is-dragging",
      "is-ambient-moving",
      "is-market-reacting-up",
      "is-market-reacting-down",
      "is-moo-marathon"
    );
    pet.classList.remove("is-cow-upper", "is-observing-session", "is-wait-attention");
    roll.hidden = !menuBarShellMode;
    document.getElementById("cowCaption").classList.remove(
      "is-visible",
      "is-attention",
      "is-session-focus"
    );
    await applyPetMode(config?.petMode);
    requestAnimationFrame(syncInteractiveRegions);
    syncMousePassthrough();
    return;
  }

  stage.hidden = false;
  stage.setAttribute("aria-hidden", "false");
  roll.hidden = false;
  if (herdPreviewActive) {
    mountHerdSlice();
  } else if (herdModeForced || config?.herdMode === true) {
    await setHerdModeEnabled(true);
  } else if (herdModeActive) {
    await setHerdModeEnabled(false);
  } else {
    stage.setAttribute("role", "button");
    stage.setAttribute("tabindex", "0");
    await applyPetMode(config?.petMode);
    await setCow(latestSnapshot?.mood || mood || "waiting", true);
    bindCowInteraction();
    scheduleBlink();
    scheduleAmbientMotion();
    syncRollControl();
  }
  requestAnimationFrame(syncInteractiveRegions);
  syncMousePassthrough();
}

function syncMenuBarModeAction() {
  const action = document.querySelector("#menuHidePet span");
  if (!action) return;
  action.replaceChildren(
    menuBarShellMode ? "放回桌面" : "收进菜单栏",
    Object.assign(document.createElement("small"), {
      textContent: menuBarShellMode ? "恢复桌宠和原来位置" : "点顶部小牛头查看",
    })
  );
}

async function setMenuBarShell(mode) {
  const next = mode === true || mode === "menu-bar";
  menuBarShellMode = next;
  document.documentElement.dataset.shellMode = next ? "menu-bar" : "desktop";
  syncMenuBarModeAction();
  setBubbleCollapsed(
    next ? false : localStorage.getItem("niulai.bubbleCollapsed") === "true",
    { silent: true, persist: false }
  );
  await setPetVisualsVisible(shouldShowPetVisuals(config));
  requestAnimationFrame(syncInteractiveRegions);
  syncMousePassthrough();
}

function reconcileHerdRuntime(snapshot, { announceEntries = true } = {}) {
  if (!herdModeActive || !herdRuntimeController || !snapshot) return null;
  const previous = herdRuntimeState || window.niulaiHerdMode.createEmptyHerdState();
  const next = window.niulaiHerdRuntime.reconcileSnapshot(snapshot, previous, {
    skins: herdSkinOptions(),
    marketEnabled: config?.market?.enabled !== false,
    marketStatus: latestMarketSnapshot?.status,
  });
  herdRuntimeState = next;
  herdRuntimeController.updateActors(next.actors, {
    introducedIds: announceEntries ? next.transitions.entered : [],
    announce: announceEntries,
  });
  for (const actorId of next.transitions.exiting) {
    const actor = next.actors.find((item) => item.id === actorId);
    if (actor) herdRuntimeController.announceActor(actorId, actor.caption, 1800);
  }
  requestAnimationFrame(syncInteractiveRegions);
  return next;
}

function announceHerdStatusChanges(previousRows, nextRows) {
  if (!hasInitialSnapshot || !chatterEnabled || !herdModeActive) return false;
  const changes = window.niulaiHerdRuntime.changedSessionRows(previousRows, nextRows);
  let delivered = false;
  for (const row of changes) {
    if (row.status === "offline") {
      delivered = true;
      continue;
    }
    const route = window.niulaiHerdRuntime.routeSessionEvent(
      herdRuntimeState?.actors,
      row,
      "status"
    );
    if (!route) continue;
    delivered = herdRuntimeController?.announceActor(
      route.actorId,
      window.niulaiHerdRuntime.sessionStatusMessage(row),
      3600
    ) || delivered;
  }
  return delivered;
}

function announceHerdWaitingReminder(reminder) {
  if (!reminder?.id) return false;
  if (!chatterEnabled) {
    api.completeWaitingNudge?.(reminder.id, false);
    return false;
  }
  const route = window.niulaiHerdRuntime.routeWaitingReminder(
    herdRuntimeState?.actors,
    reminder
  );
  const delivered = Boolean(
    route && herdRuntimeController?.announceActor(route.actorId, reminder.text, 4200)
  );
  api.completeWaitingNudge?.(reminder.id, delivered);
  return delivered;
}

function announceHerdMemo(message, duration = 1800) {
  if (!herdModeActive) return false;
  const route = window.niulaiHerdRuntime.routeMemoEvent(
    herdRuntimeState?.actors,
    "memo"
  );
  return Boolean(route && herdRuntimeController?.announceActor(route.actorId, message, duration));
}

function announceHerdMarket(message, duration = 3600) {
  if (!herdModeActive) return false;
  const route = window.niulaiHerdRuntime.routeMarketEvent(
    herdRuntimeState?.actors,
    "market"
  );
  return Boolean(route && herdRuntimeController?.announceActor(route.actorId, message, duration));
}

async function openSession(id, element) {
  const row = latestRows.find((item) => String(item.id) === String(id));
  if (!row) return;
  element.classList.add("is-opening");
  showCaption(`打开 ${row.label}。`);
  if (typeof api.ackWaitingSession === "function") api.ackWaitingSession(String(row.id));
  try {
    const opened = await api.focusSession(row);
    if (!opened) throw new Error("no target");
    showToast(`已切换到 ${row.label}`);
    if (menuBarShellMode && typeof api.hideMenuBarPanel === "function") {
      await api.hideMenuBarPanel();
    }
  } catch {
    showToast(`没找到 ${row.label} App，没有打开项目目录`);
  } finally {
    window.setTimeout(() => element.classList.remove("is-opening"), 480);
  }
}

function pointCowAt(element) {
  if (!petVisualsVisible) return;
  const bubble = document.getElementById("bubble");
  if (bubble.classList.contains("is-collapsed")) return;
  const pet = document.getElementById("pet");
  const stage = document.getElementById("cowStage");
  pet.classList.add("is-observing-session");
  stage.classList.add("is-observing-session");
  document.querySelector(".session-row.is-pointed-at")?.classList.remove("is-pointed-at");
  document.querySelector(".market-quote.is-pointed-at")?.classList.remove("is-pointed-at");
  element.classList.add("is-pointed-at");
  const row = latestRows.find((item) => String(item.id) === String(element.dataset.id));
  if (row) {
    const caption = document.getElementById("cowCaption");
    const observedId = String(row.id);
    stage.dataset.observingId = observedId;
    window.clearTimeout(attentionTimer);
    setPetExpression("turning");
    attentionTimer = window.setTimeout(() => {
      if (stage.dataset.observingId !== observedId) return;
      const line =
        row.statusConfidence === "low"
          ? `这头 ${row.label} 我看不太清。`
          : `${row.label} · ${rowStateText(row)}`;
      showCaption(line, 0, {
        attention: true,
        speechDuration: 900,
      });
      caption.classList.add("is-session-focus");
    }, 150);
  }
}

function pointCowAtMarket(element) {
  if (!petVisualsVisible) return;
  if (document.getElementById("bubble").classList.contains("is-collapsed")) return;
  const quote = latestMarketSnapshot?.quotes?.find(
    (item) => String(item.id) === String(element.dataset.marketId)
  );
  if (!quote) return;
  const pet = document.getElementById("pet");
  const stage = document.getElementById("cowStage");
  pet.classList.add("is-observing-session");
  stage.classList.add("is-observing-session");
  document.querySelector(".session-row.is-pointed-at")?.classList.remove("is-pointed-at");
  document.querySelector(".market-quote.is-pointed-at")?.classList.remove("is-pointed-at");
  element.classList.add("is-pointed-at");
  const observedId = `market:${quote.id}`;
  stage.dataset.observingId = observedId;
  window.clearTimeout(attentionTimer);
  setPetExpression("turning");
  attentionTimer = window.setTimeout(() => {
    if (stage.dataset.observingId !== observedId) return;
    const direction = marketDirection(quote.changePct);
    const movement = direction === "up" ? "涨" : direction === "down" ? "跌" : "平";
    showCaption(
      `${quote.shortName || quote.name} ${formatMarketNumber(quote.price)}，${movement} ${formatMarketPercent(quote.changePct)}。`,
      0,
      { attention: true, speechDuration: 900 }
    );
    document.getElementById("cowCaption").classList.add("is-session-focus");
  }, 150);
}

function stopCowPointing() {
  const pet = document.getElementById("pet");
  pet?.classList.remove("is-observing-session");
  const stage = document.getElementById("cowStage");
  window.clearTimeout(attentionTimer);
  if (stage) {
    stage.classList.remove("is-observing-session");
    delete stage.dataset.observingId;
  }
  document.querySelector(".session-row.is-pointed-at")?.classList.remove("is-pointed-at");
  document.querySelector(".market-quote.is-pointed-at")?.classList.remove("is-pointed-at");
  const caption = document.getElementById("cowCaption");
  caption?.classList.remove("is-session-focus", "is-visible");
  stopSpeaking();
  if (!pointerDown) {
    pet?.style.setProperty("--look-x", "0px");
    pet?.style.setProperty("--look-y", "0px");
  }
}

function announceStatusChanges(previousRows, nextRows) {
  if (!hasInitialSnapshot || !chatterEnabled) return false;
  const previous = new Map(
    previousRows.map((row) => [String(row.id), `${row.status}:${waitWhyOf(row)}`])
  );
  const priority = { working: 0, waiting: 1, idle: 2, offline: 3 };
  const whyRank = { allow: 0, choose: 1, next: 2 };
  const changes = nextRows
    .filter((row) => previous.has(String(row.id)) && previous.get(String(row.id)) !== `${row.status}:${waitWhyOf(row)}`)
    .sort((a, b) => {
      const statusDelta = (priority[a.status] ?? 9) - (priority[b.status] ?? 9);
      if (statusDelta) return statusDelta;
      return (whyRank[waitWhyOf(a)] ?? 9) - (whyRank[waitWhyOf(b)] ?? 9);
    });
  if (!changes.length) return false;
  const row = changes[0];
  const copy = STATUS_CHANGE[row.status];
  const suffix = changes.length > 1 ? ` 另外 ${changes.length - 1} 条也有动静。` : "";
  document.getElementById("cowStage")?.classList.remove(
    "is-market-reacting-up",
    "is-market-reacting-down"
  );
  markPriorityBusy(4200);
  showCaption(`${copy ? copy(row) : `${sessionName(row)} 状态变了。`}${suffix}`, 4200, {
    attention: waitWhyOf(row) === "allow" || waitWhyOf(row) === "choose",
  });
  return true;
}

function announceWaitingReminder(reminder, blocked) {
  if (!reminder?.id) return false;
  if (blocked || !chatterEnabled) {
    if (typeof api.completeWaitingNudge === "function") {
      api.completeWaitingNudge(reminder.id, false);
    }
    return false;
  }
  markPriorityBusy(4200);
  showCaption(reminder.text, 4200, { attention: true });
  if (typeof api.completeWaitingNudge === "function") {
    api.completeWaitingNudge(reminder.id, true);
  }
  return true;
}

async function announceGrass(snapshot, now, blocked) {
  if (blocked || !chatterEnabled) return false;
  const rateLimit =
    snapshot.tokenUsage?.rateLimit ||
    snapshot.tokenUsage?.sources?.find((source) => source.id === "codex")?.rateLimit;
  const alert = grassAlerts.candidate(rateLimit, now);
  if (!alert) return false;
  const urgentWait = (snapshot.rows || []).some(
    (row) => waitWhyOf(row) === "allow" || waitWhyOf(row) === "choose"
  );
  if (urgentWait || snapshot.mood === "working") return false;
  grassAlerts.commit(alert.key);
  markPriorityBusy(3600);
  showCaption(alert.text, 3600);
  return true;
}

function syncWaitAttention(rows) {
  const pet = document.getElementById("pet");
  if (!petVisualsVisible) {
    pet?.classList.remove("is-wait-attention");
    return;
  }
  const urgent = (rows || []).some((row) => waitWhyOf(row) === "allow" || waitWhyOf(row) === "choose");
  pet?.classList.toggle("is-wait-attention", urgent);
  const stage = document.getElementById("cowStage");
  if (!stage?.classList.contains("is-speaking")) {
    setPetExpression(restingCowExpression());
  }
}

async function tick() {
  if (pointerDown?.dragging || tickInFlight) return;
  tickInFlight = true;
  const beacon = document.getElementById("liveBeacon");
  beacon.classList.add("is-scanning");
  beacon.title = "正在扫描";
  try {
    const scannedSnapshot = await api.scan();
    const snapshot =
      herdPreviewActive && herdPreviewController
        ? herdSnapshotForActors(herdPreviewController.actors)
        : scannedSnapshot;
    const previousRows = latestRows;
    const now = Date.now();
    renderList(snapshot);
    if (snapshot.scanError) {
      document.getElementById("statusLine").textContent = "沿用上次巡视";
      beacon.title = `扫描暂时失败：${snapshot.scanError}`;
      if (lastScanError !== snapshot.scanError) {
        showToast(`扫描暂时失败，牛群继续守着上次结果：${snapshot.scanError}`);
      }
      lastScanError = snapshot.scanError;
    } else {
      lastScanError = "";
    }
    if (herdPreviewActive) {
      hasInitialSnapshot = true;
      beacon.title = "牛群切片数据已就绪";
      return;
    }
    if (herdModeActive) {
      reconcileHerdRuntime(snapshot);
      const statusSpoke = announceHerdStatusChanges(previousRows, snapshot.rows || []);
      const nudgeSpoke = announceHerdWaitingReminder(snapshot.waitingReminder);
      hasInitialSnapshot = true;
      if (!snapshot.scanError) beacon.title = "牛群巡视正常";
      return;
    }
    if (!petVisualsVisible) {
      const statusSpoke = announceStatusChanges(previousRows, snapshot.rows || []);
      const nudgeSpoke = announceWaitingReminder(snapshot.waitingReminder, statusSpoke);
      await announceGrass(snapshot, now, statusSpoke || nudgeSpoke);
      if (!statusSpoke && !nudgeSpoke) maybeShowFirstRunHint(snapshot);
      hasInitialSnapshot = true;
      beacon.title = snapshot.scanError ? "沿用上次巡视" : "扫描正常";
      return;
    }
    await setCow(snapshot.mood);
    syncWaitAttention(snapshot.rows || []);
    const statusSpoke = announceStatusChanges(previousRows, snapshot.rows || []);
    const nudgeSpoke = announceWaitingReminder(snapshot.waitingReminder, statusSpoke);
    await announceGrass(snapshot, now, statusSpoke || nudgeSpoke);
    if (!statusSpoke && !nudgeSpoke) maybeShowFirstRunHint(snapshot);
    hasInitialSnapshot = true;
    beacon.title = "扫描正常";
  } catch (error) {
    document.getElementById("statusLine").textContent = "扫描暂时失败";
    beacon.title = "扫描失败";
    if (herdModeActive) {
      const fallback = latestSnapshot || {
        rows: [],
        counts: { working: 0, waiting: 0, idle: 0, offline: 0 },
        mood: "offline",
        tokenUsage: { tokens: 0, sources: [] },
        scannedAt: Date.now(),
      };
      reconcileHerdRuntime(fallback);
    }
    showToast(`扫描失败：${error.message || error}`);
  } finally {
    tickInFlight = false;
    beacon.classList.remove("is-scanning");
  }
}

function scheduleMarketPolling(delay = 60_000) {
  window.clearTimeout(marketTimer);
  if (config?.market?.enabled === false) return;
  const wait = Math.max(15_000, Math.min(300_000, Number(delay) || 60_000));
  marketTimer = window.setTimeout(() => {
    if (document.hidden) {
      scheduleMarketPolling(60_000);
      return;
    }
    tickMarket();
  }, wait);
}

async function tickMarket({ force = false } = {}) {
  if (marketTickInFlight || typeof api.getMarketSnapshot !== "function") return;
  if (config?.market?.enabled === false) {
    renderMarket({ status: "disabled", quotes: [] });
    window.clearTimeout(marketTimer);
    return;
  }
  marketTickInFlight = true;
  let nextPollMs = 60_000;
  const previousMarketStatus = latestMarketSnapshot?.status;
  try {
    const snapshot = await api.getMarketSnapshot({ force });
    nextPollMs = snapshot.nextPollMs || nextPollMs;
    renderMarket(snapshot);
    reconcileHerdRuntime(latestSnapshot, { announceEntries: false });
    if (herdModeActive && snapshot.status === "unavailable" && previousMarketStatus !== "unavailable") {
      announceHerdMarket("行情暂时没回来，我还守着。", 3200);
    }
    if (snapshot.reaction) queueMarketReaction(snapshot.reaction);
  } catch (error) {
    renderMarket({
      providerLabel: "东方财富",
      status: "unavailable",
      error: String(error?.message || error),
      quotes: [],
    });
    reconcileHerdRuntime(latestSnapshot, { announceEntries: false });
    if (herdModeActive && previousMarketStatus !== "unavailable") {
      announceHerdMarket("行情暂时没回来，我还守着。", 3200);
    }
  } finally {
    marketTickInFlight = false;
    scheduleMarketPolling(nextPollMs);
  }
}

function syncMenuBubbleAction(collapsed) {
  const action = document.querySelector("#menuCollapseBubble span");
  action.textContent = collapsed ? "展开气泡" : "收起气泡";
  document.getElementById("menuCollapseBubble").classList.toggle("will-expand", collapsed);
}

function setPetMenuOpen(open) {
  const menu = document.getElementById("petMenu");
  const button = document.getElementById("petMenuButton");
  if (open) setActiveBubbleOverlay(null);
  menu.hidden = !open;
  button.setAttribute("aria-expanded", String(open));
  button.classList.toggle("is-active", open);
  if (open) {
    const collapsed = document.getElementById("bubble").classList.contains("is-collapsed");
    syncMenuBubbleAction(collapsed);
  }
}

function setBubbleCollapsed(collapsed, options = {}) {
  const bubble = document.getElementById("bubble");
  const toggle = document.getElementById("toggleBubble");
  bubble.classList.toggle("is-collapsed", collapsed);
  toggle.setAttribute("aria-expanded", String(!collapsed));
  if (options.persist !== false) {
    localStorage.setItem("niulai.bubbleCollapsed", String(collapsed));
  }
  syncMenuBubbleAction(collapsed);
  if (collapsed) stopCowPointing();
  if (!options.silent) {
    showCaption(collapsed ? "我先收好。" : "都在这里。", 1200);
  }
}

function maybeShowFirstRunHint(snapshot) {
  if (localStorage.getItem("niulai.firstRunHint") === "1") return;
  localStorage.setItem("niulai.firstRunHint", "1");
  const hasWorking = (snapshot?.counts?.working || 0) > 0;
  markPriorityBusy(4200);
  showCaption(
    hasWorking
      ? "桌宠看着这些 Session。⌘⇧U 可隐藏。"
      : "先打开一个 Runtime。点齿轮可开关扫描，⌘⇧U 可隐藏。",
    4200
  );
}

function toggleBubble() {
  const bubble = document.getElementById("bubble");
  const collapsing = !bubble.classList.contains("is-collapsed");
  if (collapsing) {
    setActiveBubbleOverlay(null);
    setPetMenuOpen(false);
  }
  setBubbleCollapsed(collapsing);
}

function petCow() {
  const stage = document.getElementById("cowStage");
  stage.classList.remove("is-petted");
  requestAnimationFrame(() => stage.classList.add("is-petted"));
  const restingLine = petMode === "horse" ? "咴～" : petMode === "both" ? "哞咴～" : "哞～";
  showCaption(mood === "working" ? "盯着活呢，也可以摸一下。" : restingLine, 1800);
  playPetVoice(mood === "working" ? "short" : "medium");
  window.setTimeout(() => stage.classList.remove("is-petted"), 720);
}

const MOO_MARATHON_MS = 5 * 60 * 1000;
const MOO_MARATHON_BEAT_MS = 5000;
const MOO_MARATHON_LINES = [
  "哞。",
  "哞哞。",
  "哞——",
  "哞？",
  "哞，还在哞。",
  "哞，进度正常。",
  "哞，没事，我练嗓子。",
  "哞，这也是一种 Runtime。",
];
const HORSE_MARATHON_LINES = [
  "咴。",
  "咴咴。",
  "咴——",
  "咴？",
  "咴，还在跑。",
  "咴，配速正常。",
  "咴，没事，我练嗓子。",
  "咴，这才叫马拉松。",
];
const BOTH_MARATHON_LINES = [
  "哞咴。",
  "哞——咴！",
  "哞咴？",
  "哞咴，还在跑。",
  "哞咴，牛马都在。",
  "哞咴，双声道正常。",
  "哞咴，这也是一种协作。",
  "哞咴，谁也别先停。",
];

function marathonLines() {
  if (petMode === "horse") return HORSE_MARATHON_LINES;
  if (petMode === "both") return BOTH_MARATHON_LINES;
  return MOO_MARATHON_LINES;
}

function syncChatterMenu() {
  const button = document.getElementById("menuToggleChatter");
  if (!button) return;
  button.setAttribute("aria-checked", String(chatterEnabled));
  const copy = button.querySelector("span");
  if (copy) {
    const subject = activePetProfile().subject;
    copy.innerHTML = chatterEnabled
      ? `允许${subject}碎嘴<small>状态变化时提醒</small>`
      : `让${subject}开口<small>当前只报重要提醒</small>`;
  }
}

function setChatterEnabled(enabled) {
  chatterEnabled = Boolean(enabled);
  localStorage.setItem("niulai.chatter", String(chatterEnabled));
  if (typeof api.setChatterEnabled === "function") api.setChatterEnabled(chatterEnabled);
  syncChatterMenu();
  if (!chatterEnabled && mooMarathonEndsAt) stopMooMarathon(false);
  if (!chatterEnabled) pendingMarketReaction = null;
  showCaption(chatterEnabled ? "我可以碎嘴了。" : "行，我少说两句。", 1700);
}

function marathonRemainingText() {
  const seconds = Math.max(0, Math.ceil((mooMarathonEndsAt - Date.now()) / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function syncMooMarathon() {
  const badge = document.getElementById("mooMarathon");
  if (!badge) return;
  const running = petVisualsVisible && mooMarathonEndsAt > Date.now();
  badge.hidden = !running;
  document.getElementById("cowStage")?.classList.toggle("is-moo-marathon", running);
  herdPreviewController?.setMarathon(running);
  herdRuntimeController?.setMarathon(running);
  document.getElementById("marathonLabel").textContent = activePetProfile().marathonLabel;
  if (running) document.getElementById("mooMarathonTime").textContent = marathonRemainingText();
}

function mooMarathonBeat() {
  if (!mooMarathonEndsAt) return;
  if (Date.now() >= mooMarathonEndsAt) {
    stopMooMarathon(true);
    return;
  }
  syncMooMarathon();
  const lines = marathonLines();
  const line = lines[Math.floor(Math.random() * lines.length)];
  showCaption(line, 2600, { speechDuration: 1050 });
  playPetVoice(petMode === "horse" ? horseKindForLine(line) : mooKindForLine(line));
}

function stopMooMarathon(announce = true) {
  window.clearInterval(mooMarathonTimer);
  window.clearInterval(mooCountdownTimer);
  mooMarathonEndsAt = 0;
  syncMooMarathon();
  if (announce) {
    showCaption(`${activePetProfile().marathonLabel}结束，嗓子还在。`, 2300);
    playPetVoice("medium");
  }
}

function toggleMooMarathon() {
  if (mooMarathonEndsAt > Date.now()) {
    stopMooMarathon(false);
    showCaption("紧急闭嘴成功。", 2000);
    playPetVoice("short");
    return;
  }
  if (!chatterEnabled) {
    setChatterEnabled(true);
  }
  mooMarathonEndsAt = Date.now() + MOO_MARATHON_MS;
  syncMooMarathon();
  showCaption(`五分钟${activePetProfile().marathonLabel}，开跑。再连点五下就闭嘴。`, 4200, {
    speechDuration: 1500,
  });
  playPetVoice("long");
  mooMarathonTimer = window.setInterval(mooMarathonBeat, MOO_MARATHON_BEAT_MS);
  mooCountdownTimer = window.setInterval(syncMooMarathon, 1000);
}

function registerCowClick() {
  const now = Date.now();
  cowClickBurst = cowClickBurst.filter((time) => now - time < 1600);
  cowClickBurst.push(now);
  if (cowClickBurst.length >= 5) {
    cowClickBurst = [];
    window.clearTimeout(cowClickTimer);
    toggleMooMarathon();
    return true;
  }
  return false;
}

function cowBoundsInWindow(stage) {
  const rect = stage.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function bindCowInteraction() {
  const stage = document.getElementById("cowStage");
  const pet = document.getElementById("pet");
  if (!petVisualsVisible || herdPreviewActive || herdModeActive || cowInteractionCleanup) return;
  const listenerAbort = new AbortController();
  const listenerOptions = { signal: listenerAbort.signal };
  let dragFrame = 0;
  let pendingCursor = null;

  const cancelQueuedDrag = () => {
    pendingCursor = null;
    if (dragFrame) {
      cancelAnimationFrame(dragFrame);
      dragFrame = 0;
    }
  };

  const queueDragMove = (screenX, screenY, cowBounds) => {
    pendingCursor = { screenX, screenY, cowBounds };
    if (dragFrame) return;
    dragFrame = requestAnimationFrame(() => {
      dragFrame = 0;
      const point = pendingCursor;
      pendingCursor = null;
      if (!pointerDown?.dragging || !point) return;
      api.moveWindowDrag(point.screenX, point.screenY, point.cowBounds);
    });
  };

  const beginWindowDrag = (event) => {
    pointerDown.dragging = true;
    stage.classList.add("is-dragging");
    stage.dataset.dragState = "moving";
    const cowBounds = cowBoundsInWindow(stage);
    api.startWindowDrag({
      originX: pointerDown.screenX,
      originY: pointerDown.screenY,
      screenX: event.screenX,
      screenY: event.screenY,
      cowBounds,
    });
  };

  const updateCowDock = (screenY) => {
    const availableTop = Number(window.screen.availTop || 0);
    const availableHeight = Math.max(1, Number(window.screen.availHeight || window.innerHeight));
    const verticalProgress = (screenY - availableTop) / availableHeight;
    const isUpper = pet.classList.contains("is-cow-upper");
    if ((!isUpper && verticalProgress < 0.7) || (isUpper && verticalProgress <= 0.8)) {
      pet.classList.add("is-cow-upper");
    } else {
      pet.classList.remove("is-cow-upper");
    }
    return cowBoundsInWindow(stage);
  };

  stage.addEventListener("pointermove", (event) => {
    if (pointerDown) {
      if (event.pointerId !== pointerDown.pointerId) return;
      const distance = Math.hypot(
        event.clientX - pointerDown.clientX,
        event.clientY - pointerDown.clientY
      );
      if (!pointerDown.dragging && distance > 4) beginWindowDrag(event);
      if (pointerDown.dragging) {
        const cowBounds = updateCowDock(event.screenY);
        queueDragMove(event.screenX, event.screenY, cowBounds);
      }
      return;
    }

    const rect = stage.getBoundingClientRect();
    const lookX = ((event.clientX - rect.left) / rect.width - 0.5) * 7;
    const lookY = ((event.clientY - rect.top) / rect.height - 0.5) * 4;
    pet.style.setProperty("--look-x", `${lookX.toFixed(2)}px`);
    pet.style.setProperty("--look-y", `${lookY.toFixed(2)}px`);
  }, listenerOptions);

  stage.addEventListener("pointerleave", () => {
    if (!pointerDown) {
      pet.style.setProperty("--look-x", "0px");
      pet.style.setProperty("--look-y", "0px");
    }
  }, listenerOptions);

  stage.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    armPetAudio();
    stage.setPointerCapture(event.pointerId);
    pointerDown = {
      pointerId: event.pointerId,
      screenX: event.screenX,
      screenY: event.screenY,
      clientX: event.clientX,
      clientY: event.clientY,
      dragging: false,
    };
  }, listenerOptions);

  const finishPointer = (event) => {
    if (!pointerDown) return;
    if (event?.pointerId != null && pointerDown.pointerId !== event.pointerId) return;
    const pointerId = pointerDown.pointerId;
    const wasDragging = pointerDown.dragging;
    suppressClick = wasDragging;
    pointerDown = null;
    cancelQueuedDrag();
    stage.classList.remove("is-dragging");
    if (wasDragging) {
      api.endWindowDrag();
      stage.dataset.dragState = "ended";
      showCaption("换块地儿，继续盯。", 1200, { speak: false });
    }
    if (stage.hasPointerCapture?.(pointerId)) {
      try {
        stage.releasePointerCapture(pointerId);
      } catch {
        /* already released */
      }
    }
    syncMousePassthrough();
    window.setTimeout(() => {
      suppressClick = false;
    }, 0);
  };

  stage.addEventListener("pointerup", finishPointer, listenerOptions);
  stage.addEventListener("pointercancel", finishPointer, listenerOptions);
  stage.addEventListener("lostpointercapture", finishPointer, listenerOptions);
  window.addEventListener("blur", finishPointer, listenerOptions);

  stage.addEventListener("click", () => {
    if (suppressClick) return;
    if (registerCowClick()) return;
    window.clearTimeout(cowClickTimer);
    cowClickTimer = window.setTimeout(toggleBubble, 230);
  }, listenerOptions);

  stage.addEventListener("dblclick", () => {
    if (suppressClick) return;
    window.clearTimeout(cowClickTimer);
    petCow();
  }, listenerOptions);

  stage.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    openMemoPanel();
  }, listenerOptions);

  stage.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "m") {
      event.preventDefault();
      openMemoPanel();
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (registerCowClick()) return;
      if (event.shiftKey) petCow();
      else toggleBubble();
    }
  }, listenerOptions);

  cowInteractionCleanup = () => {
    listenerAbort.abort();
    finishPointer();
    cancelQueuedDrag();
    cowInteractionCleanup = null;
  };
}

function bindMemo() {
  const panel = document.getElementById("quickMemo");
  document.getElementById("memoButton").addEventListener("click", () => {
    if (panel.hidden) openMemoPanel();
    else closeMemoPanel();
  });
  document.getElementById("closeMemo").addEventListener("click", closeMemoPanel);
  document.getElementById("marketButton").addEventListener("click", () => {
    const board = document.getElementById("marketBoard");
    if (board.hidden) openMarketPanel();
    else closeMarketPanel();
  });
  document.getElementById("closeMarket").addEventListener("click", closeMarketPanel);
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
      markPriorityBusy(5000);
      if (!announceHerdMemo(`你让我惦记的到点了：${memo.text}`, 5000)) {
        showCaption(`提醒：${memo.text}`, 5000);
      }
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
  const cowScale = normalizedScale(nextConfig?.cowScale);
  const internalHerdScale =
    herdPreviewActive || herdModeForced || herdModeActive || nextConfig?.herdMode === true;
  pet.style.setProperty("--cow-scale", String(internalHerdScale ? 1 : cowScale));
  herdPreviewController?.setActorScale(cowScale);
  herdRuntimeController?.setActorScale(cowScale);
  pet.style.setProperty("--bubble-scale", String(normalizedScale(nextConfig?.bubbleScale)));
  pet.classList.toggle("is-pet-scale-large", cowScale > 1.1);
}

function syncScaleControls(nextConfig) {
  const cowPercent = Math.round(normalizedScale(nextConfig?.cowScale) * 100);
  const bubblePercent = Math.round(normalizedScale(nextConfig?.bubbleScale) * 100);
  document.getElementById("cowScale").value = String(cowPercent);
  document.getElementById("bubbleScale").value = String(bubblePercent);
  document.getElementById("cowScaleValue").textContent = `${cowPercent}%`;
  document.getElementById("bubbleScaleValue").textContent = `${bubblePercent}%`;
}

function setActiveSettingsTab(tab) {
  const next = tab === "scan" || tab === "market" ? tab : "appearance";
  for (const button of document.querySelectorAll("[data-settings-tab]")) {
    const selected = button.dataset.settingsTab === next;
    button.classList.toggle("is-active", selected);
    button.setAttribute("aria-selected", String(selected));
  }
  for (const panel of document.querySelectorAll("[data-settings-panel]")) {
    const selected = panel.dataset.settingsPanel === next;
    panel.hidden = !selected;
    panel.classList.toggle("is-active", selected);
  }
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
  const mode = normalizePetMode(nextConfig.petMode);
  const modeInput = document.querySelector(`input[name="petMode"][value="${CSS.escape(mode)}"]`);
  if (modeInput) modeInput.checked = true;
  document.getElementById("showPetVisuals").checked = nextConfig.showPetVisuals !== false;
  document.getElementById("herdMode").checked = nextConfig.herdMode === true;
  syncScaleControls(nextConfig);
  document.getElementById("soundEnabled").checked = nextConfig.soundEnabled !== false;
  const market = nextConfig.market || {};
  document.getElementById("marketEnabled").checked = market.enabled !== false;
  document.getElementById("marketReactionsEnabled").checked = market.reactionsEnabled !== false;
  const threshold = String(Number(market.thresholdPct || 0.1));
  const thresholdInput = document.querySelector(
    `input[name="marketThreshold"][value="${CSS.escape(threshold)}"]`
  );
  (thresholdInput || document.querySelector('input[name="marketThreshold"][value="0.1"]')).checked = true;
  syncPetVisualSettingsAvailability();
  syncMarketSettingsAvailability();
  draftCustom = structuredClone(nextConfig.custom || []);
  renderCustomRuntimes();
  hideCustomEditor();
}

function syncPetVisualSettingsAvailability() {
  const enabled = document.getElementById("showPetVisuals").checked;
  const cowScale = document.getElementById("cowScale");
  cowScale.disabled = !enabled;
  cowScale.closest(".scale-control")?.classList.toggle("is-disabled", !enabled);
}

function syncMarketSettingsAvailability() {
  const enabled = document.getElementById("marketEnabled").checked;
  document.getElementById("marketReactionsEnabled").disabled = !enabled;
  for (const input of document.querySelectorAll('input[name="marketThreshold"]')) {
    input.disabled = !enabled;
  }
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
  applyDisplayScale(config);
  if (petVisualsVisible && !herdModeActive) applyPetMode(config.petMode);
  setSettingsMessage("修改会在保存并重扫后生效。");
  setActiveBubbleOverlay(null);
  syncInteractiveRegions();
  syncMousePassthrough();
}

async function saveSettings() {
  const next = structuredClone(config);
  for (const input of document.querySelectorAll("#runtimeToggles input[data-rt]")) {
    next.runtimes[input.dataset.rt].enabled = input.checked;
  }
  next.cowScale = Number(document.getElementById("cowScale").value) / 100;
  next.bubbleScale = Number(document.getElementById("bubbleScale").value) / 100;
  next.petMode = normalizePetMode(
    document.querySelector('input[name="petMode"]:checked')?.value
  );
  next.herdMode = document.getElementById("herdMode").checked;
  next.showPetVisuals = document.getElementById("showPetVisuals").checked;
  next.soundEnabled = document.getElementById("soundEnabled").checked;
  next.market = {
    ...(next.market || {}),
    enabled: document.getElementById("marketEnabled").checked,
    provider: "eastmoney",
    reactionsEnabled: document.getElementById("marketReactionsEnabled").checked,
    thresholdPct: Number(
      document.querySelector('input[name="marketThreshold"]:checked')?.value || 0.1
    ),
  };
  next.custom = structuredClone(draftCustom);
  setSettingsMessage("正在保存…");
  config = await api.saveConfig(next);
  setCowSoundEnabled(config.soundEnabled !== false);
  herdRuntimeController?.setSound(config.soundEnabled !== false);
  await setPetVisualsVisible(shouldShowPetVisuals(config));
  applyDisplayScale(config);
  if (config.market?.enabled === false || config.market?.reactionsEnabled === false) {
    pendingMarketReaction = null;
  }
  renderMarket(
    config.market?.enabled === false
      ? { status: "disabled", quotes: [] }
      : latestMarketSnapshot
  );
  closeSettings();
  showToast("桌宠设置已更新");
  await tick();
  await tickMarket({ force: true });
}

function bindSettings() {
  document.querySelector("#settings form").addEventListener("submit", (event) => {
    event.preventDefault();
  });
  document.getElementById("gear").addEventListener("click", () => {
    setPetMenuOpen(false);
    if (activeBubbleOverlay === "settings") {
      closeSettings();
      return;
    }
    if (document.getElementById("bubble").classList.contains("is-collapsed")) {
      setBubbleCollapsed(false, { silent: true });
    }
    fillSettings(config);
    setActiveSettingsTab("appearance");
    setActiveBubbleOverlay("settings");
    document.querySelector('[data-settings-tab="appearance"]').focus();
    syncInteractiveRegions();
    syncMousePassthrough();
  });
  document.querySelector(".settings-nav").addEventListener("click", (event) => {
    const button = event.target.closest("[data-settings-tab]");
    if (!button) return;
    setActiveSettingsTab(button.dataset.settingsTab);
  });
  document.getElementById("closeSettings").addEventListener("click", closeSettings);
  document.getElementById("cancelSettings").addEventListener("click", closeSettings);
  document.getElementById("saveSettings").addEventListener("click", saveSettings);
  document.getElementById("marketEnabled").addEventListener(
    "change",
    syncMarketSettingsAvailability
  );
  document.getElementById("showPetVisuals").addEventListener(
    "change",
    syncPetVisualSettingsAvailability
  );
  for (const input of document.querySelectorAll('input[name="petMode"]')) {
    input.addEventListener("change", () => {
      if (input.checked && petVisualsVisible && !herdModeActive) applyPetMode(input.value);
    });
  }
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
}

let passthroughLeaveTimer = 0;
let interactiveRegionFrame = 0;
const INTERACTIVE_SURFACE_IDS = [
  "bubble",
  "cowStage",
  "quickMemo",
  "marketBoard",
  "settings",
];

function cancelPassthroughLeave() {
  window.clearTimeout(passthroughLeaveTimer);
  passthroughLeaveTimer = 0;
}

function isOverInteractiveSurface() {
  return INTERACTIVE_SURFACE_IDS.some((id) => {
    const element = document.getElementById(id);
    return Boolean(element?.matches(":hover"));
  });
}

function syncInteractiveRegions() {
  window.cancelAnimationFrame(interactiveRegionFrame);
  interactiveRegionFrame = window.requestAnimationFrame(() => {
    const regions = INTERACTIVE_SURFACE_IDS.flatMap((id) => {
      const element = document.getElementById(id);
      if (!element || element.hidden) return [];
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") return [];
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return [];
      return [
        {
          x: Math.floor(rect.left),
          y: Math.floor(rect.top),
          width: Math.ceil(rect.width),
          height: Math.ceil(rect.height),
        },
      ];
    });
    api.setInteractiveRegions(regions);
  });
}

function syncMousePassthrough() {
  cancelPassthroughLeave();
  api.setIgnoreMouse(
    shouldIgnoreMouse({
      pointerActive: Boolean(pointerDown),
      overInteractiveSurface: isOverInteractiveSurface(),
      passthroughReady,
    })
  );
}

function armMousePassthrough() {
  const interactive = INTERACTIVE_SURFACE_IDS.map((id) => document.getElementById(id));
  const enter = () => {
    cancelPassthroughLeave();
    api.setIgnoreMouse(false);
  };
  const leave = () => {
    cancelPassthroughLeave();
    passthroughLeaveTimer = window.setTimeout(() => {
      syncMousePassthrough();
    }, 80);
  };
  for (const element of interactive) {
    element.addEventListener("mouseenter", enter);
    element.addEventListener("mouseleave", leave);
  }
  const resizeObserver = new ResizeObserver(syncInteractiveRegions);
  const mutationObserver = new MutationObserver(syncInteractiveRegions);
  for (const element of interactive) {
    resizeObserver.observe(element);
    mutationObserver.observe(element, {
      attributes: true,
      attributeFilter: ["class", "hidden", "open", "style"],
    });
  }
  window.addEventListener("resize", syncInteractiveRegions);
  passthroughReady = false;
  api.setIgnoreMouse(false);
  syncInteractiveRegions();
  window.setTimeout(() => {
    passthroughReady = true;
    syncInteractiveRegions();
    syncMousePassthrough();
    document.documentElement.dataset.passthroughReady = "true";
  }, 260);
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
    if (herdPreviewController) herdPreviewController.roll();
    else if (herdRuntimeController) herdRuntimeController.roll();
    else rollCow();
  });
  document.getElementById("petMenuButton").addEventListener("click", (event) => {
    event.stopPropagation();
    const menu = document.getElementById("petMenu");
    setPetMenuOpen(menu.hidden);
  });
  document.getElementById("menuCollapseBubble").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleBubble();
    setPetMenuOpen(false);
  });
  document.getElementById("menuToggleChatter").addEventListener("click", (event) => {
    event.stopPropagation();
    setChatterEnabled(!chatterEnabled);
    setPetMenuOpen(false);
  });
  document.getElementById("menuHidePet").addEventListener("click", async (event) => {
    event.stopPropagation();
    setPetMenuOpen(false);
    setActiveBubbleOverlay(null);
    if (menuBarShellMode) {
      if (typeof api.showMainWindow === "function") await api.showMainWindow();
      return;
    }
    showToast("已收进菜单栏，点顶部小牛头查看");
    await new Promise((resolve) => window.setTimeout(resolve, 180));
    if (typeof api.enterMenuBarMode === "function") await api.enterMenuBarMode();
    else await api.hideApp();
  });
  document.getElementById("menuToggleTheme").addEventListener("click", (event) => {
    event.stopPropagation();
    const current = document.documentElement.dataset.theme === "light" ? "light" : "dark";
    applyAppearance(current === "dark" ? "light" : "dark");
    setPetMenuOpen(false);
  });
  document.getElementById("menuQuit").addEventListener("click", async (event) => {
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
  document.getElementById("summaryRail").addEventListener("click", (event) => {
    const button = event.target.closest("[data-status-filter]");
    if (!button || !latestSnapshot) return;
    activeStatusFilter = button.dataset.statusFilter;
    localStorage.setItem("niulai.statusFilter", activeStatusFilter);
    renderStatusFilters(latestSnapshot.rows);
    renderSummary(latestSnapshot);
    renderSessionRows(latestSnapshot);
  });
  document.getElementById("list").addEventListener("click", (event) => {
    const action = event.target.closest("[data-empty-action]");
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    if (action.dataset.emptyAction === "show-all") {
      activeStatusFilter = "all";
      activeRuntimeFilter = "all";
      localStorage.setItem("niulai.statusFilter", activeStatusFilter);
      localStorage.setItem("niulai.runtimeFilter", activeRuntimeFilter);
      if (latestSnapshot) {
        renderRuntimeFilters(latestSnapshot.rows);
        renderStatusFilters(latestSnapshot.rows);
        renderSummary(latestSnapshot);
        renderSessionRows(latestSnapshot);
      }
      return;
    }
    if (action.dataset.emptyAction === "open-settings") {
      document.getElementById("gear").click();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!event.target.closest("#petMenu, #petMenuButton")) setPetMenuOpen(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const menuWasOpen = !document.getElementById("petMenu").hidden;
    const overlayWasOpen = Boolean(activeBubbleOverlay);
    if (menuWasOpen) setPetMenuOpen(false);
    else if (activeBubbleOverlay === "settings") closeSettings();
    else if (overlayWasOpen) setActiveBubbleOverlay(null);
    else if (menuBarShellMode && typeof api.hideMenuBarPanel === "function") {
      api.hideMenuBarPanel();
    }
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  performance.mark("niulai-interaction-bind-start");
  if (!COW_SKINS.some((skin) => skin.id === currentSkinId)) currentSkinId = "original";
  applyAppearance(localStorage.getItem(APPEARANCE_STORAGE_KEY) || "dark", { persist: false });
  setActiveSettingsTab("appearance");
  const collapsed = localStorage.getItem("niulai.bubbleCollapsed") === "true";
  setBubbleCollapsed(menuBarShellMode ? false : collapsed, {
    silent: true,
    persist: !menuBarShellMode,
  });
  syncChatterMenu();
  if (typeof api.setChatterEnabled === "function") api.setChatterEnabled(chatterEnabled);
  bindMemo();
  bindSettings();
  bindTopControls();
  syncMenuBarModeAction();
  if (typeof api.onShellMode === "function") {
    api.onShellMode((mode) => setMenuBarShell(mode));
  }
  if (typeof api.onMenuBarFocus === "function") {
    api.onMenuBarFocus((id) => focusMenuBarSession(id));
  }
  if (typeof api.onOpenMainSurface === "function") {
    api.onOpenMainSurface((surface) => openMainSurface(surface));
  }
  armMousePassthrough();
  document.getElementById("toggleBubble").addEventListener("click", (event) => {
    event.stopPropagation();
    toggleBubble();
  });

  // Let the visible shell and non-character controls paint before image
  // chroma-keying, filesystem scans, or market I/O begin.
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  performance.mark("niulai-first-interactive-frame");
  document.documentElement.dataset.interactive = "true";
  document.documentElement.dataset.interactiveMs = String(Math.round(performance.now()));
  try {
    config = await api.getConfig();
  } catch (error) {
    config = structuredClone(PREVIEW_CONFIG);
    showToast(`读取配置失败，先用默认设置：${error.message || error}`);
  }
  setCowSoundEnabled(config.soundEnabled !== false);
  applyDisplayScale(config);
  fillSettings(config);
  setPetVisualsVisible(shouldShowPetVisuals(config)).catch((error) =>
    showToast(`角色图片加载失败：${error.message || error}`)
  );
  scheduleScanning();
  window.setTimeout(tick, 0);
  window.setTimeout(() => tickMarket({ force: true }), 360);
  if (typeof api.onRequestScan === "function") api.onRequestScan(tick);
});

function openMainSurface(surface) {
  if (surface === "memo") {
    openMemoPanel();
    return;
  }
  if (surface === "settings") {
    if (document.getElementById("bubble").classList.contains("is-collapsed")) {
      setBubbleCollapsed(false, { silent: true });
    }
    setActiveBubbleOverlay("settings");
    setActiveSettingsTab("appearance");
    window.requestAnimationFrame(() => document.querySelector(".settings-nav button")?.focus());
  }
}
