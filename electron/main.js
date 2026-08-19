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
const { scan } = require("./scan");
const { focusSession } = require("./focus");
const { createMemoStore } = require("./memos");

let win;
let tray;
let config;
let memoStore;
let memoTimer;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) app.quit();
else app.on("second-instance", showWindow);

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  app.focus({ steal: true });
  win.focus();
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
    },
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.once("ready-to-show", () => win && win.showInactive());
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

function snapshot() {
  return scan(config);
}

app.whenReady().then(() => {
  if (process.platform === "darwin") app.setActivationPolicy("accessory");
  config = loadConfig(app.getPath("userData"));
  memoStore = createMemoStore(path.join(app.getPath("userData"), "memos.json"));
  createWindow();
  registerGlobalShortcut();
  memoTimer = setInterval(announceDueMemos, 15000);

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

  ipcMain.handle("scan", () => snapshot());
  ipcMain.handle("get-config", () => config);
  ipcMain.handle("save-config", (_e, next) => {
    config = saveConfig(app.getPath("userData"), next);
    registerGlobalShortcut();
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
  ipcMain.on("set-ignore-mouse", (_e, ignore) => {
    if (!win) return;
    win.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });
  ipcMain.on("move-window", (_e, deltaX, deltaY) => {
    if (!win || !Number.isFinite(deltaX) || !Number.isFinite(deltaY)) return;
    const [x, y] = win.getPosition();
    win.setPosition(x + Math.round(deltaX), y + Math.round(deltaY), false);
  });
});

app.on("window-all-closed", () => app.quit());
app.on("activate", showWindow);
app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  if (memoTimer) clearInterval(memoTimer);
});
