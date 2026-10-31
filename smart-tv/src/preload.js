const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tv', {
  apps: () => ipcRenderer.invoke('apps:list'),
  launch: (id) => ipcRenderer.send('apps:launch', id),
  power: (action) => ipcRenderer.send('system:power', action),
  onAppState: (cb) => ipcRenderer.on('app-state', (_e, state) => cb(state)),
});
