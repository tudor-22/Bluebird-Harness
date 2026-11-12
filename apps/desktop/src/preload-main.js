const { contextBridge, ipcRenderer } = require("electron");

// What the Bluebird page can ask of the Mac app: dictation that works without a network.
contextBridge.exposeInMainWorld("bluebirdDesktop", {
  dictation: {
    start: (lang) => ipcRenderer.send("dictation:start", String(lang || "")),
    stop: () => ipcRenderer.send("dictation:stop"),
    onEvent: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on("dictation:event", listener);
      return () => ipcRenderer.removeListener("dictation:event", listener);
    },
  },
});
