const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("niulai", {
  scan: () => ipcRenderer.invoke("scan"),
  getMarketSnapshot: (options) => ipcRenderer.invoke("get-market-snapshot", options),
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (next) => ipcRenderer.invoke("save-config", next),
  chooseDirectory: () => ipcRenderer.invoke("choose-directory"),
  hideApp: () => ipcRenderer.invoke("hide-app"),
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
});
