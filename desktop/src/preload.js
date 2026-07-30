const { contextBridge, ipcRenderer } = require('electron');
// Sandboxed Preloads dürfen keine lokalen Module laden; die Kanalnamen bleiben
// deshalb hier als unveränderliche, reine Daten gespiegelt.
const IPC = Object.freeze({
  WINDOW_MINIMIZE: 'desktop:window-minimize',
  WINDOW_MAXIMIZE: 'desktop:window-maximize',
  WINDOW_CLOSE: 'desktop:window-close',
  MAXIMIZE_CHANGE: 'desktop:maximize-change',
  UPDATE_CHECK: 'desktop:update-check',
  UPDATE_GET_STATE: 'desktop:update-get-state',
  UPDATE_INSTALL: 'desktop:update-install',
  UPDATE_EVENT: 'desktop:update-event',
  NOTICE: 'desktop:notice',
  SETTINGS_GET: 'desktop:settings-get',
  SETTINGS_SET: 'desktop:settings-set',
  OFFLINE_RETRY: 'desktop:offline-retry',
  OPEN_DOWNLOAD: 'desktop:open-download',
  TRAY_HINT: 'desktop:tray-hint'
});

function subscribe(channel, callback) {
  const handler = (_event, value) => callback(value);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  platform: process.platform,
  version: process.argv.find((value) => value.startsWith('--guildora-version='))?.split('=')[1] || '0.0.0',
  minimize: () => ipcRenderer.send(IPC.WINDOW_MINIMIZE),
  maximize: () => ipcRenderer.send(IPC.WINDOW_MAXIMIZE),
  close: () => ipcRenderer.send(IPC.WINDOW_CLOSE),
  onMaximizeChange: (callback) => subscribe(IPC.MAXIMIZE_CHANGE, callback),
  checkForUpdates: () => ipcRenderer.invoke(IPC.UPDATE_CHECK),
  getUpdateState: () => ipcRenderer.invoke(IPC.UPDATE_GET_STATE),
  onUpdateEvent: (callback) => subscribe(IPC.UPDATE_EVENT, callback),
  installUpdate: () => ipcRenderer.send(IPC.UPDATE_INSTALL),
  onNotice: (callback) => subscribe(IPC.NOTICE, callback),
  getSettings: () => ipcRenderer.invoke(IPC.SETTINGS_GET),
  setSettings: (partial) => ipcRenderer.invoke(IPC.SETTINGS_SET, partial),
  onTrayHint: (callback) => subscribe(IPC.TRAY_HINT, callback),
  retry: () => ipcRenderer.send(IPC.OFFLINE_RETRY),
  openDownload: () => ipcRenderer.send(IPC.OPEN_DOWNLOAD)
});
