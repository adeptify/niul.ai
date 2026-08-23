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
const { MarketService } = require("./market/market-service");
const { MarketReactionEngine } = require("./market/reactions");
const {
  createWaitingReminderEngine,
  withWaitingReminder,
} = require("./waiting-reminders");
const { createSessionScanner } = require("./session-scanner");
const { createWindowInteractions } = require("./window-interactions");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

let win;
let tray;
let config;
let memoStore;
let marketService;
let marketReactionEngine;
let memoTimer;
let mouseGuardTimer;
let backgroundScanTimer;
let chatterEnabled = true;
const waitingReminders = createWaitingReminderEngine();
const activeWaitingNotifications = new Set();
const windowInteractions = createWindowInteractions({ getWindow: () => win, screen });
const sessionScanner = createSessionScanner({
  workerPath: path.join(__dirname, "scan-worker.js"),
  getConfig: () => config,
  onSnapshot: (snapshot) => {
    const waitingReminder = processWaitingReminders(snapshot);
    return withWaitingReminder(snapshot, waitingReminder);
  },
});
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) app.quit();
else app.on("second-instance", showWindow);

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  windowInteractions.forceInteractive();
  app.focus({ steal: true });
  win.focus();
  if (win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send("request-scan");
  }
}

function toggleWindow() {
  if (!win) return;
  if (win.isVisible() && win.isFocused()) win.hide();
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
      notification.on("click", showWindow);
      notification.show();
    }
    if (win && !win.isDestroyed()) win.webContents.send("memo-due", memo);
  }
}

function processWaitingReminders(snapshot) {
  waitingReminders.observe(snapshot?.rows || [], Number(snapshot?.scannedAt) || Date.now());
  if (!chatterEnabled) return null;
  const due = waitingReminders.claimDue();
  if (!due) return null;

  if (win && !win.isDestroyed() && win.isVisible()) {
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
    notification.on("click", showWindow);
    notification.show();
  } catch {
    waitingReminders.complete(due.id, false);
  }
  return null;
}

function scheduleBackgroundScanning() {
  if (backgroundScanTimer) clearInterval(backgroundScanTimer);
  const interval = Math.max(2500, Number(config?.pollMs) || 5000);
  backgroundScanTimer = setInterval(() => {
    if (!win || win.isDestroyed() || win.isVisible()) return;
    sessionScanner.scan().catch(() => {});
  }, interval);
}

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(720, workArea.width);
  const height = Math.min(960, workArea.height);
  win = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 16,
    y: workArea.y + workArea.height - height,
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
    win.showInactive();
  });
  win.on("closed", () => {
    win = null;
    windowInteractions.reset();
  });
  const launchOptions = readLaunchOptions();
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"), {
    query: rendererQuery(launchOptions),
  });
}

app.whenReady().then(() => {
  if (process.platform === "darwin") app.setActivationPolicy("accessory");
  config = loadConfig(app.getPath("userData"));
  memoStore = createMemoStore(path.join(app.getPath("userData"), "memos.json"));
  marketService = new MarketService({ provider: new EastmoneyIndexProvider() });
  marketReactionEngine = new MarketReactionEngine();
  createWindow();
  registerGlobalShortcut();
  scheduleBackgroundScanning();
  memoTimer = setInterval(announceDueMemos, 15000);
  mouseGuardTimer = setInterval(windowInteractions.refreshMousePassthrough, 16);

  const iconPath = path.join(__dirname, "..", "assets", "tray-template.svg");
  const icon = nativeImage.createFromPath(iconPath);
  try {
    icon.setTemplateImage(true);
    tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon.resize({ width: 18, height: 18 }));
    tray.setToolTip("牛来");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "显示 / 隐藏牛来（⌘⇧U）", click: toggleWindow },
        { label: "重新扫描", click: () => win && win.webContents.send("request-scan") },
        { type: "separator" },
        { label: "退出", click: () => app.quit() },
      ])
    );
    tray.on("click", toggleWindow);
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
  ipcMain.handle("get-config", () => config);
  ipcMain.handle("save-config", (_e, next) => {
    const previousMarket = JSON.stringify(config.market || {});
    config = saveConfig(app.getPath("userData"), next);
    if (previousMarket !== JSON.stringify(config.market || {})) {
      marketReactionEngine = new MarketReactionEngine();
    }
    registerGlobalShortcut();
    scheduleBackgroundScanning();
    return config;
  });
  ipcMain.handle("choose-directory", async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "选择 Session 文件夹",
      properties: ["openDirectory", "createDirectory"],
    });
    return result.canceled ? "" : result.filePaths[0] || "";
  });
  ipcMain.handle("quit-app", () => {
    app.quit();
    return true;
  });
  ipcMain.handle("hide-app", () => {
    win?.hide();
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
app.on("activate", showWindow);
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (memoTimer) clearInterval(memoTimer);
  if (mouseGuardTimer) clearInterval(mouseGuardTimer);
  if (backgroundScanTimer) clearInterval(backgroundScanTimer);
  sessionScanner.stop();
});
