const {
  app,
  BrowserWindow,
  ipcMain,
  screen,
  Menu,
  Tray,
  nativeImage,
  dialog,
  globalShortcut,
  Notification,
} = require("electron");
const path = require("path");
const { loadConfig, saveConfig } = require("./config");
const { readLaunchOptions, rendererQuery } = require("./launch-options");
const { focusSession } = require("./focus");
const { createMemoStore } = require("./memos");
const { EastmoneyIndexProvider } = require("./market/eastmoney-provider");
const { FallbackIndexProvider } = require("./market/fallback-provider");
const { readMarketCache, writeMarketCache } = require("./market/cache-store");
const { MarketService } = require("./market/market-service");
const { MarketReactionEngine } = require("./market/reactions");
const { TencentIndexProvider } = require("./market/tencent-provider");
const { ClaudeQuotaProvider, CodexQuotaProvider } = require("./quota/providers");
const { QuotaService } = require("./quota/quota-service");
const {
  createWaitingReminderEngine,
  withWaitingReminder,
} = require("./waiting-reminders");
const { createSessionScanner } = require("./session-scanner");
const { createWindowInteractions } = require("./window-interactions");
const { menuBarPopoverPosition } = require("./menu-bar-position");
const {
  createWaitingTransitionTracker,
  notificationCopy,
  trayPresentation,
} = require("./menu-bar-state");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let win;
let tray;
let config;
let memoStore;
let marketService;
let marketReactionEngine;
let quotaService;
let memoTimer;
let mouseGuardTimer;
let backgroundScanTimer;
let chatterEnabled = true;
let latestSnapshot;
let trayIcons;
let desktopWindowBounds;
let menuBarPreviewActive = false;
let menuBarBlurredAt = 0;
let nativeDialogOpen = false;
const waitingReminders = createWaitingReminderEngine();
const waitingTransitions = createWaitingTransitionTracker();
const activeWaitingNotifications = new Set();
const windowInteractions = createWindowInteractions({ getWindow: () => win, screen });
const sessionScanner = createSessionScanner({
  workerPath: path.join(__dirname, "scan-worker.js"),
  getConfig: () => config,
  onSnapshot: (snapshot) => {
    latestSnapshot = snapshot;
    publishMenuBarSnapshot(snapshot);
    waitingReminders.observe(snapshot?.rows || [], Number(snapshot?.scannedAt) || Date.now());
    const events = waitingTransitions.observe(snapshot?.rows || []);
    const excludedIds = processImmediateWaitingEvents(events);
    const waitingReminder = processWaitingReminders(snapshot, excludedIds);
    return withWaitingReminder(snapshot, waitingReminder);
  },
});
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) app.quit();
else app.on("second-instance", () => showWindow());

function persistMenuBarMode(enabled) {
  if (!config || config.menuBarMode === Boolean(enabled)) return;
  config = saveConfig(app.getPath("userData"), { ...config, menuBarMode: Boolean(enabled) });
}

function sendToMainWindow(channel, payload) {
  if (!win || win.isDestroyed()) return;
  const send = () => {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  };
  if (win.webContents.isLoadingMainFrame()) win.webContents.once("did-finish-load", send);
  else send();
}

function visibleDesktopWindowBounds(bounds = desktopWindowBounds) {
  if (!bounds) return null;
  const center = {
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  };
  const { workArea } = screen.getDisplayNearestPoint(center);
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  return {
    width,
    height,
    x: Math.min(Math.max(bounds.x, workArea.x), workArea.x + workArea.width - width),
    y: Math.min(Math.max(bounds.y, workArea.y), workArea.y + workArea.height - height),
  };
}

function showWindow(surface = "") {
  if (!win) return;
  persistMenuBarMode(false);
  sendToMainWindow("set-shell-mode", "desktop");
  const restoreBounds = visibleDesktopWindowBounds();
  if (restoreBounds) win.setBounds(restoreBounds, false);
  if (win.isMinimized()) win.restore();
  win.show();
  windowInteractions.forceInteractive();
  app.focus({ steal: true });
  win.focus();
  sendToMainWindow("request-scan");
  if (typeof surface === "string" && surface) sendToMainWindow("open-main-surface", surface);
}

function enterMenuBarMode({ persist = true } = {}) {
  if (!win || win.isDestroyed()) return false;
  if (config?.menuBarMode !== true) desktopWindowBounds = win.getBounds();
  if (persist) persistMenuBarMode(true);
  else config = { ...config, menuBarMode: true };
  sendToMainWindow("set-shell-mode", "menu-bar");
  win.hide();
  return true;
}

function toggleWindow() {
  if (!win) return;
  if (config?.menuBarMode === true) {
    showWindow();
    return;
  }
  if (win.isVisible() && win.isFocused()) enterMenuBarMode();
  else showWindow();
}

function registerGlobalShortcut() {
  globalShortcut.unregisterAll();
  const accelerator = config.globalShortcut || "CommandOrControl+Shift+U";
  if (!globalShortcut.register(accelerator, toggleWindow)) {
    console.warn(`global shortcut unavailable: ${accelerator}`);
  }
}

function announceDueMemos() {
  if (!memoStore) return;
  for (const memo of memoStore.due()) {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: "牛来提醒你",
        body: memo.text.slice(0, 180),
        silent: false,
      });
      notification.on("click", () => {
        if (config?.menuBarMode === true) showMenuBarPanel("", "memo");
        else showWindow("memo");
      });
      notification.show();
    }
    if (win && !win.isDestroyed()) win.webContents.send("memo-due", memo);
  }
}

function interfacesVisible() {
  return Boolean(win?.isVisible());
}

function acknowledgeWaitingRows(rows = []) {
  for (const row of rows) waitingReminders.acknowledge(String(row.id));
}

function processImmediateWaitingEvents(events = []) {
  if (!events.length || !chatterEnabled) return [];
  const ids = events.map((row) => String(row.id));
  if (interfacesVisible()) {
    acknowledgeWaitingRows(events);
    return ids;
  }
  if (!Notification.isSupported()) return ids;

  try {
    const primary = events[0];
    const notification = new Notification({
      title: "牛来叫你回来",
      body: notificationCopy(primary, events.length - 1).slice(0, 180),
      silent: false,
    });
    let settled = false;
    const finish = (delivered) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (delivered) acknowledgeWaitingRows(events);
      activeWaitingNotifications.delete(notification);
      if (process.env.NIULAI_QA === "1" && process.env.NIULAI_NOTIFICATION_PREVIEW === "1") {
        console.log(`niulai-qa-notification delivered=${String(delivered)}`);
      }
    };
    const timeout = setTimeout(() => finish(false), 5000);
    activeWaitingNotifications.add(notification);
    notification.once("show", () => finish(true));
    notification.once("failed", () => finish(false));
    notification.on("click", () => showMenuBarPanel(String(primary.id)));
    notification.show();
  } catch {
    /* The delayed waiting reminder remains available as a fallback. */
  }
  return ids;
}

function processWaitingReminders(snapshot, excludedIds = []) {
  if (!chatterEnabled) return null;
  const due = waitingReminders.claimDue(undefined, excludedIds);
  if (!due) return null;

  if (interfacesVisible()) {
    setTimeout(() => waitingReminders.complete(due.id, false), 5000);
    return due;
  }

  if (!Notification.isSupported()) {
    waitingReminders.complete(due.id, false);
    return null;
  }
  try {
    const notification = new Notification({
      title: "牛来提醒你",
      body: due.text.slice(0, 180),
      silent: false,
    });
    let settled = false;
    const finish = (delivered) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      activeWaitingNotifications.delete(notification);
      waitingReminders.complete(due.id, delivered);
    };
    const timeout = setTimeout(() => finish(false), 5000);
    activeWaitingNotifications.add(notification);
    notification.once("show", () => finish(true));
    notification.once("failed", () => finish(false));
    notification.on("click", () => showMenuBarPanel(String(due.id)));
    notification.show();
  } catch {
    waitingReminders.complete(due.id, false);
  }
  return null;
}

async function showQaWaitingNotification() {
  const snapshot = await sessionScanner.scan();
  const target = snapshot?.rows?.find((row) => row.status === "waiting");
  if (!target) {
    console.warn("niulai-qa-notification skipped: no waiting Session");
    return;
  }
  waitingTransitions.reset();
  waitingTransitions.observe(
    snapshot.rows.map((row) =>
      String(row.id) === String(target.id) ? { ...row, status: "working", waitWhy: "" } : row
    )
  );
  const events = waitingTransitions.observe(snapshot.rows);
  processImmediateWaitingEvents(events);
  console.log(`niulai-qa-notification target=${String(target.id)}`);
  setTimeout(async () => {
    try {
      const history =
        typeof Notification.getHistory === "function" ? await Notification.getHistory() : [];
      const delivered = history.some((item) => item.title === "牛来叫你回来");
      console.log(`niulai-qa-notification-history delivered=${String(delivered)}`);
    } catch (error) {
      console.warn(`niulai-qa-notification-history error=${String(error)}`);
    }
  }, 2000);
}

function scheduleBackgroundScanning() {
  if (backgroundScanTimer) clearInterval(backgroundScanTimer);
  const interval = Math.max(2500, Number(config?.pollMs) || 5000);
  backgroundScanTimer = setInterval(() => {
    if (!win || win.isDestroyed() || win.isVisible()) return;
    sessionScanner.scan().catch(() => {});
  }, interval);
}

function hideMenuBarPanel({ fromBlur = false } = {}) {
  if (fromBlur) {
    menuBarBlurredAt = Date.now();
    if (process.env.NIULAI_QA === "1") console.log("niulai-qa-menu-bar-hidden reason=blur");
  }
  if (config?.menuBarMode === true && win && !win.isDestroyed()) win.hide();
}

function updateTray(snapshot) {
  if (!tray || !trayIcons) return;
  const presentation = trayPresentation(snapshot || {});
  tray.setImage(presentation.attention ? trayIcons.attention : trayIcons.ordinary);
  tray.setToolTip(presentation.tooltip);
}

function publishMenuBarSnapshot(snapshot) {
  updateTray(snapshot);
}

function positionMenuBarWindow() {
  if (!tray || !win || win.isDestroyed()) return;
  const trayBounds = tray.getBounds();
  const point = {
    x: Math.round(trayBounds.x + trayBounds.width / 2),
    y: Math.round(trayBounds.y + trayBounds.height / 2),
  };
  const display = screen.getDisplayNearestPoint(point);
  const scale = Math.max(0.7, Math.min(1.3, Number(config?.bubbleScale) || 1));
  const width = Math.min(
    Math.ceil(448 * Math.max(1, scale) + 40),
    display.workArea.width - 16
  );
  const height = Math.min(900, display.workArea.height - 10);
  const position = menuBarPopoverPosition(
    trayBounds,
    { width, height },
    display.workArea
  );
  if (position) {
    win.setBounds({ x: position.x, y: position.y, width, height }, false);
  }
}

function showMenuBarPanel(focusId = "", surface = "") {
  if (!win || win.isDestroyed()) return;
  if (config?.menuBarMode !== true) enterMenuBarMode();
  positionMenuBarWindow();
  sendToMainWindow("set-shell-mode", "menu-bar");
  win.show();
  windowInteractions.forceInteractive();
  app.focus({ steal: true });
  win.focus();
  sendToMainWindow("request-scan");
  if (focusId) sendToMainWindow("menu-bar-focus", String(focusId));
  if (surface) sendToMainWindow("open-main-surface", surface);
}

function toggleMenuBarPanel() {
  if (config?.menuBarMode !== true) {
    toggleWindow();
    return;
  }
  if (win?.isVisible()) hideMenuBarPanel();
  else if (Date.now() - menuBarBlurredAt > 250) showMenuBarPanel();
  menuBarBlurredAt = 0;
}

function createWindow({ suppressInitialShow = false, initialShell = "desktop" } = {}) {
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(720, workArea.width);
  const height = Math.min(960, workArea.height);
  desktopWindowBounds = {
    width,
    height,
    x: workArea.x + workArea.width - width - 16,
    y: workArea.y + workArea.height - height,
  };
  win = new BrowserWindow({
    width,
    height,
    x: desktopWindowBounds.x,
    y: desktopWindowBounds.y,
    transparent: true,
    backgroundColor: "#00000000",
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    movable: true,
    skipTaskbar: true,
    fullscreenable: false,
    roundedCorners: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.once("ready-to-show", () => {
    if (!win) return;
    windowInteractions.forceInteractive();
    if (!suppressInitialShow && config?.menuBarMode !== true) win.showInactive();
  });
  win.on("blur", () => {
    if (config?.menuBarMode === true && !menuBarPreviewActive && !nativeDialogOpen) {
      hideMenuBarPanel({ fromBlur: true });
    }
  });
  win.on("closed", () => {
    win = null;
    windowInteractions.reset();
  });
  const launchOptions = readLaunchOptions();
  const query = {
    ...(rendererQuery(launchOptions) || {}),
    shell: initialShell,
  };
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"), {
    query,
  });
}

app.whenReady().then(() => {
  const launchOptions = readLaunchOptions();
  menuBarPreviewActive = launchOptions.menuBarPreview;
  if (process.platform === "darwin") app.setActivationPolicy("accessory");
  config = loadConfig(app.getPath("userData"));
  const initialMenuBarMode = config.menuBarMode === true || menuBarPreviewActive;
  if (menuBarPreviewActive) config = { ...config, menuBarMode: true };
  memoStore = createMemoStore(path.join(app.getPath("userData"), "memos.json"));
  const marketCacheFile = path.join(app.getPath("userData"), "market-cache.json");
  marketService = new MarketService({
    provider: new FallbackIndexProvider({
      providers: [new TencentIndexProvider(), new EastmoneyIndexProvider()],
    }),
    initialCache: readMarketCache(marketCacheFile),
    onCacheUpdate: (snapshot) => {
      try {
        writeMarketCache(marketCacheFile, snapshot);
      } catch (error) {
        console.warn("market cache unavailable", error);
      }
    },
  });
  marketReactionEngine = new MarketReactionEngine();
  quotaService = new QuotaService({
    providers: [new ClaudeQuotaProvider(), new CodexQuotaProvider()],
  });
  createWindow({
    suppressInitialShow: initialMenuBarMode,
    initialShell: initialMenuBarMode ? "menu-bar" : "desktop",
  });
  registerGlobalShortcut();
  scheduleBackgroundScanning();
  memoTimer = setInterval(announceDueMemos, 15000);
  mouseGuardTimer = setInterval(windowInteractions.refreshMousePassthrough, 16);

  try {
    const iconFor = (filename) => {
      const source = nativeImage.createFromPath(path.join(__dirname, "..", "assets", filename));
      const icon = source.isEmpty() ? nativeImage.createEmpty() : source.resize({ width: 18, height: 18 });
      icon.setTemplateImage(true);
      return icon;
    };
    trayIcons = {
      ordinary: iconFor("tray-template.png"),
      attention: iconFor("tray-attention-template.png"),
    };
    tray = new Tray(trayIcons.ordinary);
    if (launchOptions.qaEnabled) {
      console.log(`niulai-qa-tray-bounds ${JSON.stringify(tray.getBounds())}`);
      setTimeout(
        () => console.log(`niulai-qa-tray-bounds-stable ${JSON.stringify(tray.getBounds())}`),
        1000
      );
    }
    updateTray(latestSnapshot);
    const contextMenu = Menu.buildFromTemplate([
      { label: "放回桌面 / 展开牛来（⌘⇧U）", click: () => showWindow() },
      {
        label: "重新扫描",
        click: () => {
          sendToMainWindow("request-scan");
          sessionScanner.scan().catch(() => {});
        },
      },
      { type: "separator" },
      { label: "退出", click: () => app.quit() },
    ]);
    tray.on("click", toggleMenuBarPanel);
    tray.on("right-click", () => tray.popUpContextMenu(contextMenu));
    if (launchOptions.menuBarPreview) setTimeout(() => showMenuBarPanel(), 250);
    if (launchOptions.menuBarInteractionPreview) {
      menuBarPreviewActive = true;
      setTimeout(() => showMenuBarPanel(), 250);
      setTimeout(() => {
        menuBarPreviewActive = false;
        console.log("niulai-qa-menu-bar-normal-blur armed=true");
      }, 3000);
    }
    if (launchOptions.notificationPreview) {
      setTimeout(() => {
        enterMenuBarMode({ persist: false });
        showQaWaitingNotification().catch((error) => console.warn(error));
      }, 800);
    }
  } catch (err) {
    console.warn("tray unavailable", err);
  }

  ipcMain.handle("scan", () => {
    const cached = sessionScanner.getLastSnapshot();
    return windowInteractions.isDragging() && cached ? cached : sessionScanner.scan();
  });
  ipcMain.handle("get-market-snapshot", async (_event, options = {}) => {
    const marketConfig = config.market || {};
    const marketSnapshot = await marketService.getSnapshot({
      enabled: config.market?.enabled !== false,
      force: Boolean(options.force),
    });
    const candidate = marketReactionEngine.process(marketSnapshot, {
      thresholdPct: Number(marketConfig.thresholdPct || 0.1),
    });
    return {
      ...marketSnapshot,
      reaction: marketConfig.reactionsEnabled === false ? null : candidate,
    };
  });
  ipcMain.handle("get-quota-snapshot", async (_event, options = {}) => {
    const quotaConfig = config.quota || {};
    const providerIds = Object.entries(quotaConfig.providers || {})
      .filter(([, enabled]) => enabled !== false)
      .map(([id]) => id);
    return quotaService.getSnapshot({
      enabled: quotaConfig.enabled === true,
      providerIds,
      force: Boolean(options.force),
    });
  });
  ipcMain.handle("get-config", () => config);
  ipcMain.handle("save-config", (_e, next) => {
    const previousMarket = JSON.stringify(config.market || {});
    config = saveConfig(app.getPath("userData"), next);
    if (config.quota?.enabled !== true) quotaService.disable();
    if (previousMarket !== JSON.stringify(config.market || {})) {
      marketReactionEngine = new MarketReactionEngine();
    }
    registerGlobalShortcut();
    scheduleBackgroundScanning();
    if (config.menuBarMode === true && win?.isVisible()) positionMenuBarWindow();
    return config;
  });
  ipcMain.handle("choose-directory", async () => {
    nativeDialogOpen = true;
    try {
      const result = await dialog.showOpenDialog(win, {
        title: "选择 Session 文件夹",
        properties: ["openDirectory", "createDirectory"],
      });
      return result.canceled ? "" : result.filePaths[0] || "";
    } finally {
      nativeDialogOpen = false;
    }
  });
  ipcMain.handle("quit-app", () => {
    app.quit();
    return true;
  });
  ipcMain.handle("hide-app", () => enterMenuBarMode());
  ipcMain.handle("enter-menu-bar-mode", () => enterMenuBarMode());
  ipcMain.handle("hide-menu-bar-panel", () => {
    hideMenuBarPanel();
    return true;
  });
  ipcMain.handle("show-main-window", (_event, surface = "") => {
    showWindow(typeof surface === "string" ? surface : "");
    return true;
  });
  ipcMain.handle("list-memos", () => memoStore.list());
  ipcMain.handle("save-memo", (_e, input) => memoStore.add(input));
  ipcMain.handle("complete-memo", (_e, id) => memoStore.complete(id));
  ipcMain.handle("focus-session", async (_e, session) => {
    const runtimeCfg = (config.runtimes && config.runtimes[session.runtime]) || {};
    return focusSession(session, runtimeCfg);
  });
  ipcMain.on("ack-waiting-session", (_e, id) => {
    waitingReminders.acknowledge(id);
  });
  ipcMain.on("complete-waiting-nudge", (_e, payload) => {
    waitingReminders.complete(payload?.id, Boolean(payload?.delivered));
  });
  ipcMain.on("set-chatter-enabled", (_e, enabled) => {
    chatterEnabled = Boolean(enabled);
  });
  ipcMain.on("set-ignore-mouse", (_e, ignore) => {
    windowInteractions.requestMousePassthrough(ignore);
  });
  ipcMain.on("set-interactive-regions", (_e, regions) => {
    windowInteractions.setInteractiveRegions(regions);
  });
  ipcMain.on("start-window-drag", (_e, payload) => windowInteractions.beginDrag(payload));
  ipcMain.on("move-window-drag", (_e, payload) => windowInteractions.moveDrag(payload));
  ipcMain.on("end-window-drag", windowInteractions.endDrag);
});

app.on("window-all-closed", () => app.quit());
app.on("activate", () => {
  if (config?.menuBarMode === true) return;
  showWindow();
});
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (memoTimer) clearInterval(memoTimer);
  if (mouseGuardTimer) clearInterval(mouseGuardTimer);
  if (backgroundScanTimer) clearInterval(backgroundScanTimer);
  tray?.destroy();
  sessionScanner.stop();
});
