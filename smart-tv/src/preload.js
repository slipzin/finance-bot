const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tv', {
  apps: () => ipcRenderer.invoke('apps:list'),
  launch: (id) => ipcRenderer.send('apps:launch', id),
  power: (action) => ipcRenderer.send('system:power', action),
  info: () => ipcRenderer.invoke('system:info'),
  onAppState: (cb) => ipcRenderer.on('app-state', (_e, state) => cb(state)),
  onShowAirPlay: (cb) => ipcRenderer.on('show-airplay', (_e, info) => cb(info)),
  onRemoteBack: (cb) => ipcRenderer.on('remote-back', () => cb()),
});
