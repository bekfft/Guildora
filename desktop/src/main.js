const path = require('node:path');
const { app, ipcMain, shell } = require('electron');
const semver = require('semver');
const { CONFIG_REFRESH_MS, APP_PROTOCOL } = require('./config');
const { resolveAppUrl, refreshRemoteConfig } = require('./bootstrap');
const { IPC } = require('./ipc');
const { readSettings, writeSettings } = require('./settings');
const { createTray } = require('./tray');
const { checkForUpdates, getUpdateState, initializeUpdater, installUpdate, stopUpdater } = require('./updater');
const { createMainWindow, loadApp } = require('./window');
const { ActivityBridge } = require('./activity');

let mainWindow;
let tray;
let currentConfig;
let quitting = false;
let configInterval;
let activityBridge;

if (!app.requestSingleInstanceLock()) {
  app.quit();
  return;
}

function extractDeepLink(argv) {
  return argv.find((value) => value.startsWith(`${APP_PROTOCOL}://`));
}

function deepLinkPath(value) {
  try {
    const url = new URL(value);
    if (url.hostname === 'invite') return `/invite/${encodeURIComponent(url.pathname.replace(/^\/+/, ''))}`;
  } catch {
    // Ungültige Deep Links werden ignoriert.
  }
  return null;
}

function handleDeepLink(value) {
  const route = deepLinkPath(value);
  if (!route || !mainWindow || !currentConfig) return;
  loadApp(mainWindow, `${currentConfig.appUrl}${route}`);
  mainWindow.show();
  mainWindow.focus();
}

function showUnsupported(config) {
  return mainWindow.loadFile(path.join(__dirname, 'unsupported.html'), {
    query: { target: `${config.appUrl}/api/download/windows`, version: app.getVersion() }
  });
}

async function applyConfig(config) {
  if (!config || !mainWindow) return;
  const previousUrl = currentConfig?.appUrl;
  currentConfig = config;
  mainWindow.webContents.send(IPC.NOTICE, config.notice);
  if (semver.valid(config.minVersion) && semver.lt(app.getVersion(), config.minVersion)) {
    await showUnsupported(config);
    return;
  }
  if (previousUrl && previousUrl !== config.appUrl) await loadApp(mainWindow, config.appUrl);
}

function registerIpc() {
  ipcMain.on(IPC.WINDOW_MINIMIZE, () => mainWindow?.minimize());
  ipcMain.on(IPC.WINDOW_MAXIMIZE, () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on(IPC.WINDOW_CLOSE, () => mainWindow?.close());
  ipcMain.handle(IPC.UPDATE_CHECK, checkForUpdates);
  ipcMain.handle(IPC.UPDATE_GET_STATE, getUpdateState);
  ipcMain.on(IPC.UPDATE_INSTALL, installUpdate);
  ipcMain.handle(IPC.SETTINGS_GET, () => readSettings());
  ipcMain.handle(IPC.SETTINGS_SET, (_event, partial) => {
    const safe = {};
    if (typeof partial?.autostart === 'boolean') safe.autostart = partial.autostart;
    if (typeof partial?.minimizeToTray === 'boolean') safe.minimizeToTray = partial.minimizeToTray;
    if (Array.isArray(partial?.registeredGames)) {
      safe.registeredGames = partial.registeredGames.slice(0, 50).map((game) => ({
        executable: typeof game?.executable === 'string' ? game.executable.trim().slice(0, 260) : '',
        name: typeof game?.name === 'string' ? game.name.trim().slice(0, 128) : ''
      })).filter((game) => game.executable && game.name);
    }
    return writeSettings(safe);
  });
  ipcMain.on(IPC.OFFLINE_RETRY, () => currentConfig && loadApp(mainWindow, currentConfig.appUrl));
  ipcMain.on(IPC.OPEN_DOWNLOAD, () => {
    if (currentConfig) shell.openExternal(`${currentConfig.appUrl}/api/download/windows`);
  });
  ipcMain.handle(IPC.ACTIVITY_GET, () => activityBridge?.getActivity() || null);
  ipcMain.handle(IPC.ACTIVITY_CONFIGURE, (_event, settings) => activityBridge?.configure({
    enabled: settings?.enabled === true,
    detectGames: settings?.detectGames === true,
    registeredGames: Array.isArray(settings?.registeredGames) ? settings.registeredGames : []
  }));
  ipcMain.handle(IPC.ACTIVITY_JOIN, (_event, join) => activityBridge?.sendJoin(join) || false);
  ipcMain.handle(IPC.ACTIVITY_PROCESSES, () => activityBridge?.listProcesses() || []);
}

app.setAsDefaultProtocolClient(APP_PROTOCOL);
app.on('second-instance', (_event, argv) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
  const deepLink = extractDeepLink(argv);
  if (deepLink) handleDeepLink(deepLink);
});
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

app.whenReady().then(async () => {
  const bootstrap = await resolveAppUrl();
  currentConfig = bootstrap.config;
  writeSettings({});
  mainWindow = createMainWindow({
    appUrl: currentConfig.appUrl,
    onQuitRequested: () => quitting,
    requestQuit: () => {
      quitting = true;
      app.quit();
    }
  });
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send(IPC.NOTICE, currentConfig.notice);
    mainWindow.webContents.send(IPC.MAXIMIZE_CHANGE, mainWindow.isMaximized());
  });
  registerIpc();
  activityBridge = new ActivityBridge({
    onActivity: (activity) => mainWindow?.webContents.send(IPC.ACTIVITY_CHANGE, activity)
  });
  activityBridge.start();
  initializeUpdater(mainWindow);
  tray = createTray({
    window: mainWindow,
    checkForUpdates,
    requestQuit: () => {
      quitting = true;
      app.quit();
    }
  });
  if (semver.valid(currentConfig.minVersion) && semver.lt(app.getVersion(), currentConfig.minVersion)) {
    await showUnsupported(currentConfig);
  } else {
    await loadApp(mainWindow, currentConfig.appUrl);
  }
  const remote = await bootstrap.refreshPromise;
  if (remote) await applyConfig(remote);
  if (app.isPackaged) {
    configInterval = setInterval(async () => {
      const config = await refreshRemoteConfig();
      if (config) await applyConfig(config);
    }, CONFIG_REFRESH_MS);
  }
  const deepLink = extractDeepLink(process.argv);
  if (deepLink) handleDeepLink(deepLink);
});

app.on('before-quit', () => {
  quitting = true;
  clearInterval(configInterval);
  stopUpdater();
  activityBridge?.stop();
});
app.on('window-all-closed', () => {
  // Das Tray hält die App unter Windows bewusst am Leben.
});
