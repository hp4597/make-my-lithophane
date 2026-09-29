const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("desktop", {
  saveFile: (name, bytes) => ipcRenderer.invoke("save-file", { name, bytes }),
});
