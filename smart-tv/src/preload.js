const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('tv', {
  apps: () => ipcRenderer.invoke('apps:list'),
  catalog: () => ipcRenderer.invoke('store:list'),
  info: () => ipcRenderer.invoke('system:info'),
  launch: (id) => ipcRenderer.send('apps:launch', id),
  install: (id) => ipcRenderer.send('store:install', id),
  uninstall: (id) => ipcRenderer.send('store:uninstall', id),
  power: (action) => ipcRenderer.send('system:power', action),
  onAppState: (cb) => ipcRenderer.on('app-state', (_e, state) => cb(state)),
  onAppsChanged: (cb) => ipcRenderer.on('apps-changed', () => cb()),
  onShowAirPlay: (cb) => ipcRenderer.on('show-airplay', (_e, info) => cb(info)),
  onShowStore: (cb) => ipcRenderer.on('show-store', () => cb()),
  onRemoteBack: (cb) => ipcRenderer.on('remote-back', () => cb()),
});
