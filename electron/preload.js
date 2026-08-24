const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("niulai", {
  scan: () => ipcRenderer.invoke("scan"),
  getMarketSnapshot: (options) => ipcRenderer.invoke("get-market-snapshot", options),
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (next) => ipcRenderer.invoke("save-config", next),
  chooseDirectory: () => ipcRenderer.invoke("choose-directory"),
  hideApp: () => ipcRenderer.invoke("hide-app"),
  enterMenuBarMode: () => ipcRenderer.invoke("enter-menu-bar-mode"),
  hideMenuBarPanel: () => ipcRenderer.invoke("hide-menu-bar-panel"),
  showMainWindow: (surface) => ipcRenderer.invoke("show-main-window", surface),
  quitApp: () => ipcRenderer.invoke("quit-app"),
  listMemos: () => ipcRenderer.invoke("list-memos"),
  saveMemo: (memo) => ipcRenderer.invoke("save-memo", memo),
  completeMemo: (id) => ipcRenderer.invoke("complete-memo", id),
  focusSession: (session) => ipcRenderer.invoke("focus-session", session),
  ackWaitingSession: (id) => ipcRenderer.send("ack-waiting-session", id),
  completeWaitingNudge: (id, delivered) =>
    ipcRenderer.send("complete-waiting-nudge", { id, delivered }),
  setChatterEnabled: (enabled) => ipcRenderer.send("set-chatter-enabled", enabled),
  setIgnoreMouse: (ignore) => ipcRenderer.send("set-ignore-mouse", ignore),
  setInteractiveRegions: (regions) => ipcRenderer.send("set-interactive-regions", regions),
  startWindowDrag: (payload) => ipcRenderer.send("start-window-drag", payload),
  moveWindowDrag: (screenX, screenY, cowBounds) =>
    ipcRenderer.send("move-window-drag", { screenX, screenY, cowBounds }),
  endWindowDrag: () => ipcRenderer.send("end-window-drag"),
  onRequestScan: (callback) => {
    const handler = () => callback();
    ipcRenderer.on("request-scan", handler);
    return () => ipcRenderer.removeListener("request-scan", handler);
  },
  onMemoDue: (callback) => {
    const handler = (_event, memo) => callback(memo);
    ipcRenderer.on("memo-due", handler);
    return () => ipcRenderer.removeListener("memo-due", handler);
  },
  onShellMode: (callback) => {
    const handler = (_event, mode) => callback(mode);
    ipcRenderer.on("set-shell-mode", handler);
    return () => ipcRenderer.removeListener("set-shell-mode", handler);
  },
  onMenuBarFocus: (callback) => {
    const handler = (_event, id) => callback(id);
    ipcRenderer.on("menu-bar-focus", handler);
    return () => ipcRenderer.removeListener("menu-bar-focus", handler);
  },
  onOpenMainSurface: (callback) => {
    const handler = (_event, surface) => callback(surface);
    ipcRenderer.on("open-main-surface", handler);
    return () => ipcRenderer.removeListener("open-main-surface", handler);
  },
});
