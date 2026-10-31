const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("rehubDesktop", {
  getPreferences: () => ipcRenderer.invoke("desktop:preferences"),
  setPreferences: (preferences) =>
    ipcRenderer.invoke("desktop:set-preferences", preferences),
  chooseDevice: (id) => ipcRenderer.invoke("desktop:choose-device", id),
  getChooser: () => ipcRenderer.invoke("desktop:chooser"),
  onChooser: (listener) => {
    const handler = (_event, devices) => listener(devices);
    ipcRenderer.on("desktop:chooser-changed", handler);
    return () => ipcRenderer.removeListener("desktop:chooser-changed", handler);
  },
  checkUpdates: () => ipcRenderer.invoke("desktop:check-updates"),
  disconnect: () => ipcRenderer.invoke("desktop:disconnect"),
  saveReport: (text) => ipcRenderer.invoke("desktop:save-report", text),
});
