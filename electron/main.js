const { app, BrowserWindow, ipcMain, screen, Menu, Tray, nativeImage } = require("electron");
const path = require("path");
const { loadConfig, saveConfig } = require("./config");
const { scan } = require("./scan");
const { focusSession } = require("./focus");

let win;
let tray;
let config;

function createWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  win = new BrowserWindow({
    width: 420,
    height: 640,
    x: workArea.x + workArea.width - 440,
    y: workArea.y + workArea.height - 660,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    movable: true,
    skipTaskbar: false,
    fullscreenable: false,
    roundedCorners: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.setAlwaysOnTop(true, "floating");
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));
}

function snapshot() {
  return scan(config);
}

app.whenReady().then(() => {
  config = loadConfig(app.getPath("userData"));
  createWindow();

  const icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "cow-idle.png"));
  tray = new Tray(icon.resize({ width: 18, height: 18 }));
  tray.setToolTip("牛来");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示", click: () => win && win.show() },
      { label: "退出", click: () => app.quit() },
    ])
  );

  ipcMain.handle("scan", () => snapshot());
  ipcMain.handle("get-config", () => config);
  ipcMain.handle("save-config", (_e, next) => {
    config = saveConfig(app.getPath("userData"), next);
    return config;
  });
  ipcMain.handle("focus-session", async (_e, session) => {
    const runtimeCfg = (config.runtimes && config.runtimes[session.runtime]) || {};
    await focusSession(session, runtimeCfg);
    return true;
  });
  ipcMain.on("set-ignore-mouse", (_e, ignore) => {
    if (!win) return;
    win.setIgnoreMouseEvents(Boolean(ignore), { forward: true });
  });
});

app.on("window-all-closed", () => app.quit());
