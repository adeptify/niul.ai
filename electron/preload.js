const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("niulai", {
  scan: () => ipcRenderer.invoke("scan"),
  getConfig: () => ipcRenderer.invoke("get-config"),
  saveConfig: (next) => ipcRenderer.invoke("save-config", next),
  focusSession: (session) => ipcRenderer.invoke("focus-session", session),
  setIgnoreMouse: (ignore) => ipcRenderer.send("set-ignore-mouse", ignore),
});
