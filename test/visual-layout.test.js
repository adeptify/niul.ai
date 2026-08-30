const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "renderer/index.html"), "utf8");
const baseCss = fs.readFileSync(path.join(root, "renderer/styles.css"), "utf8");
const herdCss = fs.readFileSync(path.join(root, "renderer/herd.css"), "utf8");
const css = `${baseCss}\n${herdCss}`;
const js = fs.readFileSync(path.join(root, "renderer/app.js"), "utf8");
const mainJs = fs.readFileSync(path.join(root, "electron/main.js"), "utf8");
const preloadJs = fs.readFileSync(path.join(root, "electron/preload.js"), "utf8");
const sessionViewJs = fs.readFileSync(path.join(root, "renderer/session-view.js"), "utf8");
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

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = hex
      .replace("#", "")
      .match(/.{2}/g)
      .map((channel) => Number.parseInt(channel, 16) / 255)
      .map((channel) =>
        channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
      );
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
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

test("herd styles load after the shared shell and stay in their own package", () => {
  assert.ok(html.indexOf('href="herd.css"') > html.indexOf('href="styles.css"'));
  assert.doesNotMatch(baseCss, /\.herd-preview/);
  assert.match(herdCss, /\.herd-preview/);
  assert.match(herdCss, /#cowStage\[data-herd-mode="true"\]/);
});

test("memo, market, quota, and settings share inline workspaces inside bubble", () => {
  const bubbleStart = html.indexOf('<main class="bubble"');
  const bubbleEnd = html.indexOf("<!-- /bubble -->");
  assert.notEqual(bubbleStart, -1, "missing bubble main");
  assert.notEqual(bubbleEnd, -1, "missing bubble close marker");
  const bubble = html.slice(bubbleStart, bubbleEnd);
  assert.ok(bubble.includes('id="quickMemo"'));
  assert.ok(bubble.includes('id="marketBoard"'));
  assert.ok(bubble.includes('id="quotaBoard"'));
  assert.ok(bubble.includes('id="settings"'));
  assert.doesNotMatch(bubble, /<dialog\b[^>]*id="settings"/);
  const memo = bubble.match(/id="quickMemo"[^>]*/);
  const market = bubble.match(/id="marketBoard"[^>]*/);
  const quota = bubble.match(/id="quotaBoard"[^>]*/);
  const settings = bubble.match(/id="settings"[^>]*/);
  assert.ok(memo && memo[0].includes("bubble-overlay"));
  assert.ok(market && market[0].includes("bubble-overlay"));
  assert.ok(quota && quota[0].includes("bubble-overlay"));
  assert.ok(settings && settings[0].includes("bubble-overlay"));
  const overlay = cssRule(".bubble-overlay");
  assert.match(overlay, /position\s*:\s*relative/);
  const bg = overlay.match(/background\s*:\s*([^;]+)/);
  assert.ok(bg, "missing background on .bubble-overlay");
  assert.ok(!/transparent/i.test(bg[1]), "bubble-overlay background must not be transparent");
  assert.match(bg[1], /workspace-paper/);
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

test("power menu remains visible and independently toggleable while bubble is collapsed", () => {
  assert.match(css, /\.pet-menu\[hidden\]\s*\{[^}]*display\s*:\s*none/s);
  assert.doesNotMatch(css, /\.bubble\.is-collapsed\s+\.pet-menu\s*(?:,|\{)/);
  const toggle = extract(js, "function setPetMenuOpen", "function setBubbleCollapsed");
  assert.match(toggle, /menu\.hidden\s*=\s*!open/);
  assert.doesNotMatch(toggle, /setBubbleCollapsed\(/);
});

test("power menu sends the full pet into the menu bar", () => {
  const action = extract(html, 'id="menuHidePet"', "</button>");
  assert.match(action, /收进菜单栏/);
  assert.match(action, /点顶部小牛头查看/);
  assert.match(js, /api\.enterMenuBarMode\(\)/);
});

test("menu bar mode reuses the only BrowserWindow and the full renderer", () => {
  assert.equal((mainJs.match(/new BrowserWindow\s*\(/g) || []).length, 1);
  assert.match(mainJs, /renderer["'], ["']index\.html/);
  assert.match(mainJs, /set-shell-mode/);
  assert.match(preloadJs, /onShellMode/);
  for (const filename of ["menu-bar.html", "menu-bar.css", "menu-bar.js"]) {
    assert.equal(fs.existsSync(path.join(root, "renderer", filename)), false);
  }
});

test("menu bar uses non-empty-compatible transparent PNG tray assets", () => {
  for (const filename of ["tray-template.png", "tray-attention-template.png"]) {
    const image = fs.readFileSync(path.join(root, "assets", filename));
    assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(image.readUInt32BE(16), 36);
    assert.equal(image.readUInt32BE(20), 36);
    assert.equal(image[25], 6, `${filename} must use RGBA color type`);
    assert.match(mainJs, new RegExp(filename.replace(".", "\\.")));
  }
  assert.doesNotMatch(mainJs, /iconFor\(["']tray-(?:attention-)?template\.svg["']\)/);
});

test("menu bar shell suspends pet visuals while keeping the shared bubble", () => {
  assert.match(js, /if \(menuBarShellMode\) return false/);
  assert.match(js, /setPetVisualsVisible\(shouldShowPetVisuals\(config\)\)/);
  assert.equal(cssProperty('html[data-shell-mode="menu-bar"] #pet', "justify-content"), "flex-start");
  assert.equal(
    cssProperty('html[data-shell-mode="menu-bar"] .bubble-head', "-webkit-app-region"),
    "no-drag"
  );
});

test("menu bar shell disables Roll until the visible cow returns to desktop", () => {
  const sync = extract(js, "function syncRollControl", "async function applyPetMode");
  const roll = extract(js, "async function rollCow", "const MARKET_INDEX_ORDER");
  assert.match(sync, /!menuBarShellMode && activePetProfile\(\)\.includesCow/);
  assert.match(sync, /button\.disabled = !available/);
  assert.match(sync, /回到桌面后可换牛/);
  assert.match(roll, /if \(menuBarShellMode \|\| !activePetProfile\(\)\.includesCow\) return/);
  assert.match(cssRule(".roll-button:disabled"), /cursor\s*:\s*not-allowed/);
});

test("normal menu bar mode guards native blur races and stale notification focus", () => {
  assert.match(mainJs, /Date\.now\(\) - menuBarBlurredAt > 250/);
  assert.match(mainJs, /!nativeDialogOpen/);
  assert.match(mainJs, /nativeDialogOpen = true/);
  assert.match(js, /pendingMenuBarFocusExpiresAt = Date\.now\(\) \+ 10_000/);
  assert.match(js, /Date\.now\(\) > pendingMenuBarFocusExpiresAt/);
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
  for (const label of ["工作中", "等你", "闲置", "不在线"]) assert.ok(rail.includes(label));
});

test("session cards expose state, identity, activity, and navigation as one ledger row", () => {
  const template = extract(js, "function renderSessionRows", "for (const element of list");
  assert.match(template, /class="session-identity"/);
  assert.match(template, /class="session-work"/);
  assert.match(template, /class="session-state"/);
  assert.match(template, /class="session-name"/);
  assert.match(template, /class="session-summary"/);
  assert.match(template, /class="session-path"/);
  assert.match(template, /class="session-agent"/);
  assert.match(template, /class="open-arrow"/);
  const identity = extract(template, 'class="session-identity"', 'class="session-work"');
  assert.match(identity, /session-name/);
  assert.match(identity, /session-path/);
  assert.doesNotMatch(identity, /session-summary|session-agent|session-meta|runtime-tag/);
  const work = extract(template, 'class="session-work"', 'class="open-arrow"');
  assert.match(work, /session-summary/);
  assert.match(work, /session-agent/);
  assert.match(work, /\$\{escapeHtml\(row\.label\)\} · \$\{escapeHtml\(timeAgo\(/);
  assert.doesNotMatch(work, /session-path|runtime-tag|session-meta/);
  assert.doesNotMatch(template, /runtime-tag/);
  const identityPos = template.indexOf("session-identity");
  const workPos = template.indexOf("session-work");
  const arrowPos = template.indexOf("open-arrow");
  assert.ok(identityPos < workPos && workPos < arrowPos, "rows then independent arrow");
  const rule = cssRule(".session-work");
  assert.match(rule, /background\s*:\s*transparent/);
});

test("settings use four left-navigation panels inside the shared workspace", () => {
  assert.doesNotMatch(html, /<dialog\b/);
  assert.ok(html.includes('class="settings-nav"'));
  for (const tab of ["appearance", "scan", "market", "quota"]) {
    assert.ok(html.includes(`data-settings-tab="${tab}"`));
    assert.ok(html.includes(`data-settings-panel="${tab}"`));
  }
  assert.doesNotMatch(js, /showModal\s*\(/);
  assert.match(js, /setActiveBubbleOverlay\(\s*["']settings["']\s*\)/);
});

test("token strip opens a readable opt-in quota workspace", () => {
  const token = html.match(/<button[^>]*id="tokenStrip"[^>]*>/);
  assert.ok(token, "token usage must be an interactive button");
  assert.match(token[0], /aria-controls="quotaBoard"/);
  assert.match(token[0], /aria-expanded="false"/);
  assert.match(html, /id="quotaEnabled"/);
  assert.match(html, /id="quotaClaudeEnabled"/);
  assert.match(html, /id="quotaCodexEnabled"/);
  assert.ok(html.indexOf('src="quota-view.js"') < html.indexOf('src="app.js"'));
  assert.match(js, /function renderQuota\s*\(/);
  assert.match(js, /function tickQuota\s*\(/);
  assert.match(js, /setActiveBubbleOverlay\(\s*["']quota["']\s*\)/);
  assert.match(cssRule(".quota-window-grid"), /repeat\(2, minmax\(0, 1fr\)\)/);
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
  assert.match(title, /font-size\s*:\s*17px/);
  assert.match(title, /font-weight\s*:\s*520/);
  assert.match(cssRule("#statusCaption"), /font-size\s*:\s*11px/);
  assert.match(cssRule("#statusCaption"), /color\s*:\s*var\(--workspace-muted\)/);
});

test("companion status stays on one calm line", () => {
  assert.equal(cssProperty(".companion-intro", "display"), "flex");
  assert.equal(cssProperty(".companion-intro", "align-items"), "baseline");
  assert.equal(cssProperty(".companion-title", "font-size"), "17px");
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

test("compact preview caps at two while panorama keeps every filtered row", () => {
  const render = extract(js, "function renderSessionRows", "if (!rows.length)");
  assert.match(render, /panoramaOpen\s*\?\s*orderedRows\s*:\s*orderedSessionRows\(snapshot\.rows\)\.slice\(0, 2\)/);
  assert.match(render, /\$\{rows\.length\} 个/);
  assert.match(render, /查看全部 \$\{snapshot\.rows\.length\} 个 Session/);
});

test("visible session paths compact the macOS home prefix", () => {
  assert.match(sessionViewJs, /function compactDisplayPath\(/);
  assert.match(sessionViewJs, /\\\/Users\\\/\[\^\/\]\+/);
  assert.match(js, /class="session-path"[^>]*>\$\{escapeHtml\(compactDisplayPath\(/);
});

test("session identity and activity remain separate readable columns", () => {
  assert.match(cssRule(".session-work"), /background\s*:\s*transparent/);
  assert.match(cssRule(".session-copy"), /grid-template-columns\s*:\s*minmax\(118px,\s*0\.9fr\)\s+minmax\(150px,\s*1\.15fr\)/);
  assert.match(cssRule(".session-identity"), /grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/);
  assert.equal(cssProperty(".session-agent", "text-align"), "left");
  assert.doesNotMatch(css, /\.runtime-tag\s*\{[^}]*border-radius\s*:\s*999px/);
  assert.doesNotMatch(css, /\.session-path\s*\{[^}]*max-width\s*:\s*42%/);
});

test("session status is a text-and-color label rather than a thin rail", () => {
  const state = cssRule(".session-state");
  assert.match(state, /min-height\s*:\s*27px/);
  assert.match(state, /background\s*:\s*var\(--state-surface\)/);
  assert.match(state, /color\s*:\s*var\(--state-text\)/);
  assert.match(cssRule(".session-state i"), /background\s*:\s*var\(--state-color\)/);
});

test("status text keeps accessible contrast while dots retain semantic color", () => {
  const papers = [
    cssProperty(":root", "--workspace-paper"),
    cssProperty(':root[data-theme="light"]', "--workspace-paper"),
  ];
  for (const status of ["working", "waiting", "idle", "offline"]) {
    const label = cssProperty(":root", `--${status}-label`);
    assert.match(label, /^#[0-9a-f]{6}$/i, `missing ${status} label color`);
    for (const paper of papers) {
      assert.ok(
        contrastRatio(label, paper) >= 4.5,
        `${status} label must reach 4.5:1 against ${paper}`
      );
    }
  }
  assert.match(cssRule(".summary-item i"), /background\s*:\s*var\(--state-color\)/);
});

test("waiting rows receive a restrained panorama tint while every status keeps its own label", () => {
  assert.match(css, /\.session-row\.waiting[\s\S]*?--state-color\s*:\s*var\(--waiting\)/);
  assert.match(
    css,
    /\.bubble\[data-surface="sessions"\] \.session-row\.waiting\s*\{[^}]*background\s*:\s*color-mix\(in srgb, var\(--waiting\) 5%/
  );
});

test("settings labels match the approved A demo", () => {
  assert.match(html, /data-settings-tab="appearance"[^>]*>外观与声音</);
  assert.match(html, /data-settings-tab="scan"[^>]*>巡视范围</);
  assert.match(html, /data-settings-tab="market"[^>]*>大盘</);
  assert.ok(html.includes("让牛来、马来，或者只留一张安静的状态气泡。"));
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

test("appearance settings expose a reversible herd takeover without replacing petMode", () => {
  const appearance = extract(
    html,
    'data-settings-panel="appearance"',
    'data-settings-panel="scan"'
  );
  assert.match(appearance, /id="herdMode"\s+type="checkbox"/);
  assert.match(appearance, /关闭后恢复上面的桌宠组合/);
  assert.match(js, /next\.herdMode\s*=\s*document\.getElementById\("herdMode"\)\.checked/);
  assert.match(js, /async function setHerdModeEnabled\(enabled\)/);
  assert.match(js, /herdRuntimeController\?\.destroy\(\)/);
  assert.match(js, /await applyPetMode\(config\?\.petMode\)/);
  assert.equal(cssProperty(".herd-mode-toggle", "border-bottom"), "1px solid var(--hairline)");
});

test("appearance settings can stop every pet visual while preserving the status bubble", () => {
  const appearance = extract(
    html,
    'data-settings-panel="appearance"',
    'data-settings-panel="scan"'
  );
  assert.match(appearance, /id="showPetVisuals"\s+type="checkbox"/);
  assert.match(appearance, /牛、马和牛群一起回棚，只保留 Session 状态气泡/);
  assert.match(js, /next\.showPetVisuals\s*=\s*document\.getElementById\("showPetVisuals"\)\.checked/);
  assert.match(js, /async function setPetVisualsVisible\(visible\)/);
  assert.match(css, /#pet\[data-pet-visuals="hidden"\]/);
  assert.match(css, /#cowStage\[hidden\]/);
  assert.match(css, /\.roll-button\[hidden\]/);
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

test("restored status filter accepts all and defaults invalid values to all", () => {
  const restore = js.slice(js.indexOf("STATUS_FILTER_VERSION"), js.indexOf("let config"));
  assert.match(restore, /new Set\(\["all"/);
  assert.match(restore, /working/);
  assert.match(restore, /waiting/);
  assert.match(restore, /idle/);
  assert.match(restore, /offline/);
  assert.match(restore, /\.has\(|\.includes\(/);
  assert.match(restore, /:\s*"all"/);
});

test("bubble stays 448px in compact mode and expands to a 680px workspace", () => {
  assert.match(css, /\.bubble\s*\{[\s\S]*?width\s*:\s*min\(\s*448px/);
  assert.match(cssRule(".bubble.is-workspace-open"), /width\s*:\s*min\(680px/);
  assert.match(cssRule("#pet.is-workspace-open"), /width\s*:\s*min\(704px/);
  const head = cssRule(".bubble-head");
  assert.match(head, /min-height\s*:\s*52px/);
  const intro = cssRule(".companion-intro");
  assert.match(intro, /(?:min-height|height)\s*:\s*52px/);
  const icon = cssRule(".icon-button");
  assert.match(icon, /(?:width|min-width|height|min-height)\s*:\s*3[24]px/);
});

test("session cards are compact ledger rows with a state label and arrow", () => {
  const row = cssRule(".session-row");
  assert.match(row, /grid-template-columns\s*:\s*64px\s+minmax\(0,\s*1fr\)\s+16px/);
  assert.match(row, /align-items\s*:\s*center/);
  const minHeight = Number((row.match(/min-height\s*:\s*(\d+)px/) || [])[1]);
  assert.equal(minHeight, 64);
  assert.match(row, /border-radius\s*:\s*0/);
  assert.match(row, /padding\s*:\s*8px\s+2px/);
  const arrow = cssRule(".open-arrow");
  assert.match(arrow, /align-self\s*:\s*center|justify-self\s*:\s*end/);
  const name = cssRule(".session-name");
  const summary = cssRule(".session-summary");
  const sessionPath = cssRule(".session-path");
  const agent = cssRule(".session-agent");
  assert.match(name, /font-size\s*:\s*12px/);
  assert.match(summary, /font-size\s*:\s*12px/);
  assert.equal(cssProperty(".session-path", "font-size"), "10px");
  assert.equal(cssProperty(".session-agent", "font-size"), "10px");
  assert.equal(cssProperty(".session-path", "font-family"), "var(--font-mono)");
});

test("market workspace uses four columns for eight quotes", () => {
  const grid = cssRule(".market-grid");
  assert.match(grid, /grid-template-columns\s*:\s*repeat\(\s*4\s*,/);
  const name = cssRule(".market-quote-name");
  const price = cssRule(".market-quote-price");
  const change = cssRule(".market-quote-change");
  assert.match(name, /font-size\s*:\s*12px/);
  assert.match(price, /font-size\s*:\s*20px/);
  assert.match(price, /font-weight\s*:\s*520/);
  assert.match(change, /font-size\s*:\s*12px/);
  assert.match(change, /font-weight\s*:\s*560/);
});

test("settings workspace keeps readable type and 108px left nav", () => {
  assert.equal(cssProperty("#settings form", "grid-template-columns"), "108px minmax(0, 1fr)");
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
  for (const name of ["sessions", "memo", "market", "quota", "settings"]) {
    assert.match(overlay, new RegExp(name));
  }
  assert.match(js, /Escape|keydown/);
  assert.match(js, /setActiveBubbleOverlay\(\s*null\s*\)/);
});

test("workspace close animates layout continuity and respects reduced motion", () => {
  const overlay = extract(js, "function setActiveBubbleOverlay", "\nfunction ");
  assert.match(overlay, /document\.startViewTransition/);
  assert.match(overlay, /Boolean\(previous\)/);
  assert.match(overlay, /prefers-reduced-motion:\s*reduce/);
  assert.equal(cssProperty(".bubble", "view-transition-name"), "niulai-workspace");
  assert.equal(cssProperty(".cow-stage", "view-transition-name"), "niulai-companion");
  assert.match(css, /::view-transition-group\(niulai-workspace\)[\s\S]*?animation-duration\s*:\s*240ms/);
});

test("all visible workspaces stay inside the mouse interaction regions", () => {
  const surfaces = extract(js, "const INTERACTIVE_SURFACE_IDS", "\n\nfunction cancelPassthroughLeave");
  const hover = extract(js, "function isOverInteractiveSurface", "\nfunction ");
  const regions = extract(js, "function syncInteractiveRegions", "\nfunction ");
  const arm = extract(js, "function armMousePassthrough", "\nfunction ");

  assert.match(surfaces, /marketBoard/);
  assert.match(surfaces, /quotaBoard/);
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

test("four-column market clears the fourth divider and narrow layout clears every second divider", () => {
  assert.match(cssRule(".market-quote:nth-child(4n)"), /border-right\s*:\s*0/);
  const mediaStart = css.lastIndexOf("@media (max-width: 520px)");
  const mediaOpen = css.indexOf("{", mediaStart);
  const mediaClose = matchingBrace(css, mediaOpen);
  const media = css.slice(mediaOpen + 1, mediaClose);
  assert.match(media, /\.market-quote:nth-child\(2n\)\s*\{[^}]*border-right\s*:\s*0/s);
});

test("memo market quota and settings share the expanded inline workspace geometry", () => {
  assert.equal(
    cssProperty(".bubble-overlay", "height"),
    "min(458px, calc(100vh - 96px))"
  );
  assert.equal(
    cssProperty("#settings", "height"),
    "min(458px, calc(100vh - 96px))"
  );
  assert.equal(cssProperty("#settings form", "height"), "100%");
  assert.equal(cssProperty(".quick-memo", "grid-template-columns"), "minmax(0, 1fr) minmax(0, 1fr)");
  assert.equal(cssProperty(".quick-memo", "grid-template-rows"), "minmax(0, 1fr)");
  assert.equal(
    cssProperty(".market-board", "grid-template-rows"),
    "auto minmax(0, 1fr)"
  );
  assert.equal(
    cssProperty(".quota-board", "grid-template-rows"),
    "auto minmax(0, 1fr)"
  );
  assert.equal(cssProperty(".memo-list", "min-height"), "0");
  assert.equal(cssProperty(".memo-list", "max-height"), "none");
  assert.equal(cssProperty(".memo-list", "overflow-y"), "auto");
  assert.equal(cssProperty(".market-grid", "align-content"), "stretch");
  assert.equal(cssProperty(".market-grid", "grid-auto-rows"), "minmax(112px, 1fr)");

  const mediaStart = css.lastIndexOf("@media (max-width: 520px)");
  assert.notEqual(mediaStart, -1, "missing narrow workspace media query");
  const mediaOpen = css.indexOf("{", mediaStart);
  const mediaClose = matchingBrace(css, mediaOpen);
  const media = css.slice(mediaOpen + 1, mediaClose);
  assert.match(
    media,
    /\.bubble-overlay\s*,\s*#settings\s*,\s*\.quick-memo\s*\{[^}]*height\s*:\s*min\(520px,\s*calc\(100vh\s*-\s*76px\)\)/s
  );
  assert.match(media, /\.market-grid\s*\{[^}]*repeat\(2,/s);
  assert.match(media, /\.quick-memo\s*\{[^}]*grid-template-columns\s*:\s*minmax\(0,\s*1fr\)/s);
});

test("memo history reads as a distinct section with a readable heading", () => {
  const memo = extract(html, 'id="quickMemo"', "</aside>");
  assert.match(memo, /<section class="memo-history"[^>]*aria-labelledby="memoHistoryTitle"/);
  assert.match(memo, /id="memoHistoryTitle"[^>]*>最近记下的</);

  assert.equal(cssProperty(".memo-history", "display"), "grid");
  assert.equal(cssProperty(".memo-history", "grid-template-rows"), "auto minmax(0, 1fr)");
  assert.equal(cssProperty(".memo-history", "min-height"), "0");
  assert.equal(cssProperty(".memo-history", "background"), "var(--workspace-paper)");
  assert.equal(cssProperty(".memo-history", "border-top"), "0");
  assert.equal(cssProperty(".memo-list-heading", "font-size"), "16px");
  assert.equal(cssProperty(".memo-list-heading", "font-weight"), "520");
  assert.equal(cssProperty(".memo-list-heading", "color"), "var(--workspace-text)");
});

test("memo composer and history use a roomy desktop split", () => {
  assert.match(html, /<section class="memo-compose">/);
  assert.equal(cssProperty("#memoText", "height"), "100%");
  assert.equal(cssProperty("#memoText", "min-height"), "112px");
  assert.equal(cssProperty(".reminder-presets", "padding"), "12px 24px 0");
  assert.equal(cssProperty(".reminder-presets button", "min-height"), "30px");
  assert.equal(cssProperty(".memo-save-row", "min-height"), "58px");
});

test("reduced motion removes workspace width and content transitions", () => {
  const mediaStart = baseCss.lastIndexOf("@media (prefers-reduced-motion: reduce)");
  const mediaOpen = baseCss.indexOf("{", mediaStart);
  const mediaClose = matchingBrace(baseCss, mediaOpen);
  const media = baseCss.slice(mediaOpen + 1, mediaClose);
  assert.match(media, /\.bubble/);
  assert.match(media, /\.bubble-overlay/);
  assert.match(media, /animation\s*:\s*none\s*!important/);
  assert.match(media, /transition\s*:\s*none\s*!important/);
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
