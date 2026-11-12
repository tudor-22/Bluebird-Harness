const { contextBridge, ipcRenderer } = require("electron");

// The setup window can show progress and answer a few choices, nothing else.
contextBridge.exposeInMainWorld("setup", {
  onUpdate: (callback) => ipcRenderer.on("setup:update", (_event, data) => callback(data)),
  choose: (choice) => ipcRenderer.send("setup:choice", choice),
});
