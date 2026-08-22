const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "renderer/index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "renderer/styles.css"), "utf8");
const js = fs.readFileSync(path.join(root, "renderer/app.js"), "utf8");
const audioJs = fs.readFileSync(path.join(root, "renderer/moo.js"), "utf8");

function extract(source, start, end) {
  const i = source.indexOf(start);
  const j = source.indexOf(end, i);
  assert.notEqual(i, -1, `missing ${start}`);
  assert.notEqual(j, -1, `missing ${end}`);
  return source.slice(i, j + end.length);
}

function matchingBrace(source, openIndex) {
  let depth = 0;
  for (let i = openIndex; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function cssBlocks({ includeMedia = false } = {}) {
  const blocks = [];
  let i = 0;
  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i += 1;
    if (i >= css.length) break;
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      i = end === -1 ? css.length : end + 2;
      continue;
    }
    if (css.startsWith("@media", i)) {
      const open = css.indexOf("{", i);
      const close = matchingBrace(css, open);
      if (includeMedia && open !== -1 && close !== -1) {
        const inner = css.slice(open + 1, close);
        const nested = [...inner.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({
          source: m[0],
          selectors: parseSelectors(m[1]),
        }));
        blocks.push(...nested);
      }
      i = close === -1 ? css.length : close + 1;
      continue;
    }
    const open = css.indexOf("{", i);
    if (open === -1) break;
    const close = matchingBrace(css, open);
    if (close === -1) break;
    const selectorText = css.slice(i, open);
    if (!selectorText.trim().startsWith("@")) {
      blocks.push({
        source: css.slice(i, close + 1),
        selectors: parseSelectors(selectorText),
      });
    }
    i = close + 1;
  }
  return blocks;
}

function parseSelectors(selectorText) {
  return selectorText
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function cssRule(selector) {
  const matches = cssBlocks().filter((block) => block.selectors.includes(selector));
  assert.ok(matches.length, `missing CSS rule for ${selector}`);
  return matches[matches.length - 1].source;
}

function declarationValue(body, property) {
  let value;
  for (const decl of body.split(";")) {
    const match = decl.match(/^\s*([\w-]+)\s*:\s*(.+?)\s*$/);
    if (match && match[1] === property) value = match[2].trim();
  }
  return value;
}

function cssProperty(selector, property) {
  let value;
  for (const block of cssBlocks()) {
    if (!block.selectors.includes(selector)) continue;
    const open = block.source.indexOf("{");
    const close = block.source.lastIndexOf("}");
    if (open === -1 || close === -1) continue;
    const next = declarationValue(block.source.slice(open + 1, close), property);
    if (next !== undefined) value = next;
  }
  return value;
}

test("top bar keeps the approved six-action order", () => {
  const actions = extract(html, 'class="head-actions"', "</div>");
  const ids = [...actions.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, [
    "toggleBubble",
    "rollCow",
    "memoButton",
    "marketButton",
    "gear",
    "petMenuButton",
  ]);
});

test("memo, market, and settings share opaque overlays inside bubble", () => {
  const bubbleStart = html.indexOf('<main class="bubble"');
  const bubbleEnd = html.indexOf("<!-- /bubble -->");
  assert.notEqual(bubbleStart, -1, "missing bubble main");
  assert.notEqual(bubbleEnd, -1, "missing bubble close marker");
  const bubble = html.slice(bubbleStart, bubbleEnd);
  assert.ok(bubble.includes('id="quickMemo"'));
  assert.ok(bubble.includes('id="marketBoard"'));
  assert.ok(bubble.includes('id="settings"'));
  assert.doesNotMatch(bubble, /<dialog\b[^>]*id="settings"/);
  const memo = bubble.match(/id="quickMemo"[^>]*/);
  const market = bubble.match(/id="marketBoard"[^>]*/);
  const settings = bubble.match(/id="settings"[^>]*/);
  assert.ok(memo && memo[0].includes("bubble-overlay"));
  assert.ok(market && market[0].includes("bubble-overlay"));
  assert.ok(settings && settings[0].includes("bubble-overlay"));
  const overlay = cssRule(".bubble-overlay");
  const bg = overlay.match(/background\s*:\s*([^;]+)/);
  assert.ok(bg, "missing background on .bubble-overlay");
  assert.ok(!/transparent/i.test(bg[1]), "bubble-overlay background must not be transparent");
});

test("power menu keeps controls and adds appearance before quit", () => {
  const order = [
    "menuCollapseBubble",
    "menuToggleChatter",
    "menuHidePet",
    "menuToggleTheme",
    "menuQuit",
  ];
  const positions = order.map((id) => {
    const i = html.indexOf(`id="${id}"`);
    assert.notEqual(i, -1, `missing ${id}`);
    return i;
  });
  for (let i = 1; i < positions.length; i += 1) {
    assert.ok(positions[i] > positions[i - 1], `${order[i]} must follow ${order[i - 1]}`);
  }
});

test("quiet status bar exposes exactly four semantic filters", () => {
  const rail = extract(html, 'class="summary-rail"', "</div>");
  const filters = [...rail.matchAll(/data-status-filter="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(filters, ["working", "waiting", "idle", "offline"]);
  for (const value of filters) {
    const tag = rail.match(new RegExp(`data-status-filter="${value}"[^>]*`));
    assert.ok(tag && /aria-pressed=/.test(tag[0]), `${value} missing aria-pressed`);
  }
  const waiting = rail.match(/data-status-filter="waiting"[^>]*/);
  assert.ok(waiting && /\bis-priority\b/.test(waiting[0]), "waiting must have is-priority");
});

test("session cards use two information rows without a dark inner band", () => {
  const template = extract(js, "function renderSessionRows", "for (const element of list");
  assert.match(template, /class="session-identity"/);
  assert.match(template, /class="session-work"/);
  assert.match(template, /class="session-rail"/);
  assert.match(template, /class="session-name"/);
  assert.match(template, /class="session-summary"/);
  assert.match(template, /class="session-path"/);
  assert.match(template, /class="session-agent"/);
  assert.match(template, /class="open-arrow"/);
  const identity = extract(template, 'class="session-identity"', 'class="session-work"');
  assert.match(identity, /session-name/);
  assert.match(identity, /session-summary/);
  assert.doesNotMatch(identity, /session-path|session-agent|session-meta|runtime-tag/);
  const work = extract(template, 'class="session-work"', 'class="open-arrow"');
  assert.match(work, /session-path/);
  assert.match(work, /session-agent/);
  assert.match(work, /\$\{escapeHtml\(row\.label\)\} · \$\{escapeHtml\(timeAgo\(/);
  assert.doesNotMatch(work, /session-summary|runtime-tag|session-meta/);
  assert.doesNotMatch(template, /runtime-tag/);
  const identityPos = template.indexOf("session-identity");
  const workPos = template.indexOf("session-work");
  const arrowPos = template.indexOf("open-arrow");
  assert.ok(identityPos < workPos && workPos < arrowPos, "rows then independent arrow");
  const rule = cssRule(".session-work");
  assert.match(rule, /background\s*:\s*transparent/);
});

test("settings use three left-navigation panels inside the shared workspace", () => {
  assert.doesNotMatch(html, /<dialog\b/);
  assert.ok(html.includes('class="settings-nav"'));
  for (const tab of ["appearance", "scan", "market"]) {
    assert.ok(html.includes(`data-settings-tab="${tab}"`));
    assert.ok(html.includes(`data-settings-panel="${tab}"`));
  }
  assert.doesNotMatch(js, /showModal\s*\(/);
  assert.match(js, /setActiveBubbleOverlay\(\s*["']settings["']\s*\)/);
});

test("appearance is restored and persisted", () => {
  assert.ok(js.includes("APPEARANCE_STORAGE_KEY"));
  assert.ok(js.includes("applyAppearance"));
  assert.ok(js.includes("localStorage.getItem(APPEARANCE_STORAGE_KEY)"));
  assert.ok(js.includes("localStorage.setItem(APPEARANCE_STORAGE_KEY"));
});

test("hidden status and runtime filters stay display-none", () => {
  assert.match(
    css,
    /#statusFilters\[hidden\],\s*#runtimeFilters\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/
  );
});

test("companion intro keeps a persistent title and a live caption", () => {
  const intro = extract(html, 'class="companion-intro"', "</div>");
  assert.match(intro, /<h2 class="companion-title">我看着呢。<\/h2>/);
  assert.match(intro, /<p id="statusCaption">/);
  const title = cssRule(".companion-title");
  assert.match(title, /font-size\s*:\s*15px/);
  assert.match(title, /font-weight\s*:\s*(600|560|500)/);
  assert.match(css, /#statusCaption\s*\{[^}]*font-size\s*:\s*13px/);
  assert.match(css, /#statusCaption\s*\{[^}]*color\s*:\s*var\(--bone-muted\)/);
});

test("companion status stays on one calm line", () => {
  assert.equal(cssProperty(".companion-intro", "display"), "flex");
  assert.equal(cssProperty(".companion-intro", "align-items"), "baseline");
  assert.equal(cssProperty(".companion-title", "font-size"), "15px");
  assert.equal(cssProperty("#statusCaption", "margin"), "0");
  assert.equal(cssProperty("#statusCaption", "white-space"), "nowrap");
  assert.equal(cssProperty("#statusCaption", "text-overflow"), "ellipsis");
});

test("companion caption uses calm task wording", () => {
  const caption = extract(js, "function statusCaptionText", "function renderSummary");
  assert.ok(caption.includes("有 ${count} 个任务等你回来接着走。"));
  assert.ok(caption.includes("有 ${count} 个任务正在进行。"));
  assert.ok(caption.includes("有 ${count} 个任务暂时空闲。"));
  assert.ok(caption.includes("有 ${count} 个任务暂未连接。"));
  assert.doesNotMatch(caption, /头/);
  assert.doesNotMatch(caption, /我看着呢。/);
});

test("session total shows the filtered count only", () => {
  const render = extract(js, "function renderSessionRows", "if (!rows.length)");
  assert.match(render, /\$\{rows\.length\} 个/);
  assert.doesNotMatch(render, /\/ \$\{snapshot\.rows\.length\}/);
});

test("visible session paths compact the macOS home prefix", () => {
  assert.match(js, /function compactDisplayPath\(/);
  assert.match(js, /\\\/Users\\\/\[\^\/\]\+/);
  assert.match(js, /class="session-path"[^>]*>\$\{escapeHtml\(compactDisplayPath\(/);
});

test("session identity and work grids pin summary then agent time", () => {
  assert.match(cssRule(".session-work"), /background\s*:\s*transparent/);
  assert.match(
    css,
    /\.session-identity\s*\{[^}]*grid-template-columns\s*:\s*minmax\(\d+px,\s*34%\)\s+minmax\(0,\s*1fr\)/
  );
  assert.match(
    css,
    /\.session-work\s*\{[^}]*grid-template-columns\s*:\s*minmax\(0,\s*1fr\)\s+fit-content\(34%\)/
  );
  assert.match(css, /\.session-agent\s*\{[^}]*text-align\s*:\s*right/);
  assert.match(css, /\.session-agent\s*\{[^}]*justify-self\s*:\s*end/);
  assert.doesNotMatch(css, /\.runtime-tag\s*\{[^}]*border-radius\s*:\s*999px/);
  assert.doesNotMatch(css, /\.session-path\s*\{[^}]*max-width\s*:\s*42%/);
});

test("session rail leaves readable space before card content", () => {
  const row = cssRule(".session-row");
  const rail = cssRule(".session-rail");
  const columns = declarationValue(
    row.slice(row.indexOf("{") + 1, row.lastIndexOf("}")),
    "grid-template-columns"
  );
  const gap = Number((row.match(/\bgap\s*:\s*(\d+(?:\.\d+)?)px/) || [])[1]);
  const firstColumn = Number((columns?.match(/^(\d+(?:\.\d+)?)px/) || [])[1]);
  const railWidth = Number((rail.match(/\bwidth\s*:\s*(\d+(?:\.\d+)?)px/) || [])[1]);
  const railMarginLeft = Number(
    (rail.match(/\bmargin\s*:\s*[^;]*\s(\d+(?:\.\d+)?)px\s*;/) || [])[1]
  );
  for (const value of [gap, firstColumn, railWidth, railMarginLeft]) {
    assert.ok(Number.isFinite(value), "session rail spacing must use measurable px values");
  }
  const clearSpace = firstColumn + gap - railMarginLeft - railWidth;
  assert.ok(clearSpace >= 8, `session rail only leaves ${clearSpace}px before content`);
});

test("waiting cards use a light whole-card tint", () => {
  const dark = css.match(/:root\s*\{[\s\S]*?--waiting-surface:\s*([^;]+);/);
  const light = css.match(/:root\[data-theme="light"\]\s*\{[\s\S]*?--waiting-surface:\s*([^;]+);/);
  assert.ok(dark, "missing dark waiting-surface");
  assert.ok(light, "missing light waiting-surface");
  for (const value of [dark[1], light[1]]) {
    const alpha = Number((value.match(/,\s*(0\.\d+)\s*\)/) || [])[1]);
    assert.ok(Number.isFinite(alpha) && alpha > 0 && alpha <= 0.09, `waiting fill too strong: ${value}`);
  }
  assert.match(
    css,
    /\.session-row\.waiting,\s*\n?\s*\.session-row\[data-status="waiting"\]\s*\{[^}]*background\s*:\s*var\(--waiting-surface\)/
  );
  assert.doesNotMatch(css, /\.session-work[^{]*waiting|waiting[^{]*\.session-work/);
});

test("settings labels match the approved A demo", () => {
  assert.match(html, /data-settings-tab="appearance"[^>]*>外观与声音</);
  assert.match(html, /data-settings-tab="scan"[^>]*>巡视范围</);
  assert.match(html, /data-settings-tab="market"[^>]*>大盘</);
  assert.ok(html.includes("让牛来、马来，或者它们一起陪着。"));
  assert.ok(html.includes('data-settings-tab="appearance"'));
  assert.ok(html.includes('data-settings-tab="scan"'));
  assert.ok(html.includes('data-settings-tab="market"'));
});

test("appearance settings expose cow horse and combined pet modes", () => {
  assert.match(html, /name="petMode"\s+value="cow"/);
  assert.match(html, /name="petMode"\s+value="horse"/);
  assert.match(html, /name="petMode"\s+value="both"/);
  assert.ok(html.includes('id="horseActor"'));
  assert.ok(html.includes('id="horseA"'));
  assert.ok(html.includes('id="horseB"'));
  assert.ok(html.includes('src="pet-mode.js"'));
});

test("horse mode shares speaking frames while combined mode mixes both calls", () => {
  assert.match(css, /\.cow-stage\.is-speaking \.horse-fx-mouth/);
  assert.match(css, /data-expression\^="attention"[^}]*\.horse-fx-mouth\s*\{[^}]*top\s*:\s*29\.5%/);
  const speaking = extract(js, "function startSpeaking", "function scheduleBlink");
  assert.match(speaking, /setPetExpression/);
  const voices = extract(js, "function playPetVoice", "function restingCowExpression");
  assert.match(voices, /playCowMoo/);
  assert.match(voices, /playHorseNeigh/);
  assert.match(voices, /profile\.includesCow && profile\.includesHorse/);
  const horseKinds = extract(audioJs, "function horseKindForLine", "return \"medium\";");
  assert.match(horseKinds, /咴咴/);
  assert.match(horseKinds, /"short"/);
  assert.match(js, /petMode !== "both" \|\| skin\.bothCompatible !== false/);
});

test("theme menu hint describes the current appearance", () => {
  const apply = extract(js, "function applyAppearance", "function setActiveBubbleOverlay");
  assert.match(apply, /theme === "dark" \? "切换到浅色" : "切换到深色"/);
  assert.match(apply, /theme === "dark" \? "当前为深色外观" : "当前为浅色外观"/);
});

test("opening memo or market expands a collapsed bubble first", () => {
  const memo = extract(js, "async function openMemoPanel", "function closeMemoPanel");
  const market = extract(js, "function openMarketPanel", "function closeMarketPanel");
  for (const source of [memo, market]) {
    assert.match(source, /is-collapsed/);
    assert.match(source, /setBubbleCollapsed\(\s*false/);
    assert.match(source, /silent:\s*true/);
  }
});

test("restored status filter sanitizes transient all to waiting", () => {
  const restore = js.slice(js.indexOf("STATUS_FILTER_VERSION"), js.indexOf("let config"));
  assert.match(restore, /working/);
  assert.match(restore, /waiting/);
  assert.match(restore, /idle/);
  assert.match(restore, /offline/);
  assert.match(restore, /\.has\(|\.includes\(/);
  assert.match(restore, /"waiting"/);
  assert.match(restore, /all|"all"|stored|restored|statusFilter/);
});

test("bubble shell is 448px with a 52px top bar", () => {
  const bubble = cssRule(".bubble");
  assert.match(bubble, /width\s*:\s*min\(\s*448px/);
  assert.doesNotMatch(bubble, /min\(\s*500px/);
  const head = cssRule(".bubble-head");
  assert.match(head, /min-height\s*:\s*52px/);
  const intro = cssRule(".companion-intro");
  assert.match(intro, /(?:min-height|height)\s*:\s*44px/);
  const icon = cssRule(".icon-button");
  assert.match(icon, /(?:width|min-width|height|min-height)\s*:\s*3[24]px/);
});

test("session cards are compact two-row rows with a centered arrow column", () => {
  const row = cssRule(".session-row");
  assert.match(row, /grid-template-columns\s*:\s*[^\n;]*auto/);
  assert.match(row, /align-items\s*:\s*center/);
  const minHeight = Number((row.match(/min-height\s*:\s*(\d+)px/) || [])[1]);
  assert.ok(minHeight >= 68 && minHeight <= 72, `session min-height ${minHeight} not 68-72`);
  assert.match(row, /border-radius\s*:\s*13px/);
  assert.match(row, /padding\s*:[^;]*10px/);
  const arrow = cssRule(".open-arrow");
  assert.match(arrow, /align-self\s*:\s*center|justify-self\s*:\s*end/);
  const name = cssRule(".session-name");
  const summary = cssRule(".session-summary");
  const sessionPath = cssRule(".session-path");
  const agent = cssRule(".session-agent");
  assert.match(name, /font-size\s*:\s*14px/);
  assert.match(summary, /font-size\s*:\s*12px/);
  assert.match(sessionPath, /font-size\s*:\s*10\.5px/);
  assert.match(agent, /font-size\s*:\s*1[12]px/);
  assert.match(sessionPath, /(?:ui-monospace|SFMono|Menlo|monospace)/);
});

test("market workspace uses two columns for eight quotes", () => {
  const grid = cssRule(".market-grid");
  assert.match(grid, /grid-template-columns\s*:\s*repeat\(\s*2\s*,/);
  assert.doesNotMatch(grid, /repeat\(\s*4\s*,/);
  const name = cssRule(".market-quote-name");
  const price = cssRule(".market-quote-price");
  const change = cssRule(".market-quote-change");
  assert.match(name, /font-size\s*:\s*12px/);
  assert.match(price, /font-size\s*:\s*15px/);
  assert.match(price, /font-weight\s*:\s*600/);
  assert.match(change, /font-size\s*:\s*12px/);
  assert.match(change, /font-weight\s*:\s*600/);
});

test("settings workspace keeps readable type and 108px left nav", () => {
  const form = cssRule("#settings form");
  assert.match(form, /grid-template-columns\s*:\s*108px/);
  const scale = cssRule(".scale-control");
  assert.match(scale, /font-size\s*:\s*13px/);
  const readable = [
    ".settings-nav button",
    ".section-heading h3",
    ".scale-control",
    ".scale-control > span",
    ".scale-control output",
    ".preference-toggle small",
    ".runtime-toggle-copy span",
    ".field-help",
  ];
  for (const selector of readable) {
    const size = cssProperty(selector, "font-size");
    assert.ok(size, `missing cascaded font-size for ${selector}`);
    assert.doesNotMatch(
      size,
      /^(?:8|9|10)px\b/,
      `${selector} cascaded font-size must not be 8/9/10px, got ${size}`
    );
  }
});

test("shared workspaces close through the same overlay state", () => {
  const overlay = extract(js, "function setActiveBubbleOverlay", "\nfunction ");
  assert.match(overlay, /memo|market|settings/);
  assert.match(js, /Escape|keydown/);
  assert.match(js, /setActiveBubbleOverlay\(\s*null\s*\)/);
});

test("all visible workspaces stay inside the mouse interaction regions", () => {
  const surfaces = extract(js, "const INTERACTIVE_SURFACE_IDS", "\n\nfunction cancelPassthroughLeave");
  const hover = extract(js, "function isOverInteractiveSurface", "\nfunction ");
  const regions = extract(js, "function syncInteractiveRegions", "\nfunction ");
  const arm = extract(js, "function armMousePassthrough", "\nfunction ");

  assert.match(surfaces, /marketBoard/);
  assert.match(surfaces, /settings/);
  for (const source of [hover, regions, arm]) assert.match(source, /INTERACTIVE_SURFACE_IDS/);
  assert.doesNotMatch(regions, /settings[^\n]*\.open|id\s*===\s*["']settings["'][^\n]*\.open/);
});

test("market reactions pause while any bubble workspace is open", () => {
  const blocked = extract(js, "function marketReactionIsBlocked", "\nfunction ");
  assert.match(blocked, /activeBubbleOverlay/);
  assert.doesNotMatch(blocked, /settings[^\n]*\.open/);
});

test("session summary changes invalidate the render cache", () => {
  const render = extract(js, "function renderList", "async function openSession");
  assert.match(render, /row\.workSummary/);
});

test("workspace buttons expose and synchronize active state", () => {
  for (const id of ["memoButton", "marketButton", "gear"]) {
    const tag = html.match(new RegExp(`<button[^>]*id="${id}"[^>]*>`));
    assert.ok(tag, `missing ${id}`);
    assert.match(tag[0], /aria-pressed="false"/);
  }
  const overlay = extract(js, "function setActiveBubbleOverlay", "\nfunction ");
  assert.match(overlay, /memoButton/);
  assert.match(overlay, /marketButton/);
  assert.match(overlay, /gear/);
  assert.match(overlay, /aria-pressed/);
  assert.match(overlay, /is-active/);
});

test("settings entry toggles without resetting an active draft", () => {
  const bind = extract(js, "function bindSettings", "function cancelPassthroughLeave");
  const gear = extract(bind, 'document.getElementById("gear")', 'document.querySelector(".settings-nav")');
  assert.match(gear, /activeBubbleOverlay\s*===\s*["']settings["']/);
  assert.match(gear, /closeSettings\s*\(/);
  assert.ok(
    gear.indexOf('activeBubbleOverlay === "settings"') < gear.indexOf("fillSettings(config)"),
    "settings toggle must close before repopulating the form"
  );
});

test("workspaces isolate the covered content and manage focus", () => {
  const overlay = extract(js, "function setActiveBubbleOverlay", "\nfunction ");
  assert.match(overlay, /summaryRail/);
  assert.match(overlay, /bubbleBody/);
  assert.match(overlay, /\.inert/);
  assert.match(overlay, /aria-hidden/);
  assert.match(overlay, /overlayReturnFocus/);
  const market = extract(js, "function openMarketPanel", "function closeMarketPanel");
  assert.match(market, /closeMarket/);
  assert.match(market, /\.focus\s*\(/);
  const bind = extract(js, "function bindSettings", "function cancelPassthroughLeave");
  assert.match(bind, /data-settings-tab/);
  assert.match(bind, /\.focus\s*\(/);
});

test("settings form submit is prevented", () => {
  const bind = extract(js, "function bindSettings", "function cancelPassthroughLeave");
  assert.match(bind, /addEventListener\(\s*["']submit["']/);
  assert.match(bind, /preventDefault\s*\(/);
});

test("leaving settings restores unsaved scale preview", () => {
  const overlay = extract(js, "function setActiveBubbleOverlay", "\nfunction ");
  assert.match(overlay, /applyDisplayScale\(\s*config\s*\)/);
});

test("escape on settings closes through closeSettings", () => {
  const keys = extract(js, 'document.addEventListener("keydown"', "window.addEventListener");
  assert.match(keys, /Escape/);
  assert.match(keys, /closeSettings\s*\(/);
  assert.match(keys, /settings/);
});

test("two-column market quotes do not restore a 4-column right border", () => {
  assert.doesNotMatch(
    css,
    /\.market-quote:nth-child\(4n\)\s*\{[^}]*border-right\s*:\s*1px/
  );
});

test("memo market and settings keep one stable workspace geometry", () => {
  assert.equal(
    cssProperty(".bubble-overlay", "height"),
    "min(420px, calc(100vh - 96px))"
  );
  assert.equal(
    cssProperty("#settings", "height"),
    "min(420px, calc(100vh - 96px))"
  );
  assert.equal(cssProperty("#settings form", "height"), "100%");
  assert.equal(
    cssProperty(".quick-memo", "grid-template-rows"),
    "auto auto auto auto minmax(156px, 1fr)"
  );
  assert.equal(
    cssProperty(".market-board", "grid-template-rows"),
    "auto minmax(0, 1fr)"
  );
  assert.equal(cssProperty(".memo-list", "min-height"), "0");
  assert.equal(cssProperty(".memo-list", "max-height"), "none");
  assert.equal(cssProperty(".memo-list", "overflow-y"), "auto");
  assert.equal(cssProperty(".market-grid", "align-content"), "start");
  assert.equal(cssProperty(".market-grid", "grid-auto-rows"), "72px");

  const mediaStart = css.lastIndexOf("@media (max-width: 400px)");
  assert.notEqual(mediaStart, -1, "missing narrow workspace media query");
  const mediaOpen = css.indexOf("{", mediaStart);
  const mediaClose = matchingBrace(css, mediaOpen);
  const media = css.slice(mediaOpen + 1, mediaClose);
  assert.match(
    media,
    /\.bubble-overlay\s*,\s*\.quick-memo\s*\{[^}]*height\s*:\s*min\(400px,\s*calc\(100vh\s*-\s*76px\)\)/s
  );
  assert.match(
    media,
    /#settings\s*\{[^}]*height\s*:\s*min\(400px,\s*calc\(100vh\s*-\s*76px\)\)/s
  );
});

test("memo history reads as a distinct section with a readable heading", () => {
  const memo = extract(html, 'id="quickMemo"', "</aside>");
  assert.match(memo, /<section class="memo-history"[^>]*aria-labelledby="memoHistoryTitle"/);
  assert.match(memo, /id="memoHistoryTitle"[^>]*>最近 Memo</);

  assert.equal(cssProperty(".memo-history", "display"), "grid");
  assert.equal(cssProperty(".memo-history", "grid-template-rows"), "auto minmax(0, 1fr)");
  assert.equal(cssProperty(".memo-history", "min-height"), "0");
  assert.equal(cssProperty(".memo-history", "background"), "var(--paper)");
  assert.equal(cssProperty(".memo-history", "border-top"), "1px solid var(--hairline)");
  assert.equal(cssProperty(".memo-list-heading", "font-size"), "14px");
  assert.equal(cssProperty(".memo-list-heading", "font-weight"), "600");
  assert.equal(cssProperty(".memo-list-heading", "color"), "var(--bone)");
});

test("memo composer and history share the workspace height", () => {
  assert.equal(cssProperty("#memoText", "height"), "76px");
  assert.equal(cssProperty("#memoText", "min-height"), "76px");
  assert.equal(cssProperty(".reminder-presets", "padding"), "10px 16px 0");
  assert.equal(cssProperty(".reminder-presets button", "min-height"), "30px");
  assert.equal(cssProperty(".memo-save-row", "min-height"), "46px");
});

test("settings footer spans the workspace instead of expanding the narrow nav column", () => {
  const footer = extract(html, 'class="settings-footer"', "</footer>");
  assert.match(footer, /class="field-help"/);
  assert.match(footer, /class="settings-actions"/);

  const footerRule = cssRule(".settings-footer");
  assert.match(footerRule, /grid-column\s*:\s*1\s*\/\s*-1/);
  assert.match(footerRule, /grid-row\s*:\s*3/);
  assert.match(footerRule, /display\s*:\s*flex/);

  assert.doesNotMatch(cssRule(".field-help"), /grid-column\s*:\s*1\b/);
  assert.doesNotMatch(cssRule(".settings-actions"), /grid-column\s*:\s*2\b/);
});

test("settings subpages keep divider breathing room and action labels on one line", () => {
  assert.equal(
    cssProperty(".settings-panel.market-settings", "padding"),
    "16px 20px 18px 22px"
  );
  assert.equal(cssProperty(".button", "white-space"), "nowrap");
});

test("hidden runtime filter migrates persisted selection to all", () => {
  const init = js.slice(js.indexOf("let currentSkinId"), js.indexOf("STATUS_FILTER_VERSION"));
  assert.match(init, /let activeRuntimeFilter\s*=\s*"all"\s*;/);
  assert.match(
    init,
    /localStorage\.setItem\(\s*["']niulai\.runtimeFilter["']\s*,\s*(?:activeRuntimeFilter|["']all["'])\s*\)/
  );
  assert.doesNotMatch(init, /localStorage\.getItem\(\s*["']niulai\.runtimeFilter["']/);
});
