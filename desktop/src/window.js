const fs = require('node:fs');
const path = require('node:path');
const { BrowserWindow, app, screen, shell } = require('electron');
const { IPC } = require('./ipc');
const { readSettings, writeSettings } = require('./settings');

const RETRY_DELAYS = [5_000, 10_000, 30_000, 60_000];
let retryIndex = 0;
let retryTimer;

function statePath() {
  return path.join(app.getPath('userData'), 'window-state.json');
}

function isVisibleOnScreen(bounds) {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapX = Math.max(0, Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x));
    const overlapY = Math.max(0, Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y));
    return overlapX >= 100 && overlapY >= 100;
  });
}

function readWindowState() {
  try {
    const state = JSON.parse(fs.readFileSync(statePath(), 'utf8'));
    if (state.bounds && isVisibleOnScreen(state.bounds)) return state;
  } catch {
    // Ohne gültigen Zustand werden die Standardwerte verwendet.
  }
  return { bounds: { width: 1280, height: 800 }, maximized: false };
}

function saveWindowState(window) {
  if (!window || window.isDestroyed()) return;
  const bounds = window.isMaximized() ? window.getNormalBounds() : window.getBounds();
  fs.writeFileSync(statePath(), JSON.stringify({ bounds, maximized: window.isMaximized() }, null, 2));
}

function createMainWindow({ appUrl, onQuitRequested, requestQuit }) {
  const state = readWindowState();
  const preload = path.join(__dirname, 'preload.js');
  const window = new BrowserWindow({
    ...state.bounds,
    minWidth: 940,
    minHeight: 500,
    frame: false,
    backgroundColor: '#1e1f22',
    show: false,
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload,
      additionalArguments: [`--guildora-version=${app.getVersion()}`]
    }
  });

  window.removeMenu();
  window.webContents.setZoomFactor(readSettings().zoomFactor);
  window.once('ready-to-show', () => window.show());
  window.on('maximize', () => window.webContents.send(IPC.MAXIMIZE_CHANGE, true));
  window.on('unmaximize', () => window.webContents.send(IPC.MAXIMIZE_CHANGE, false));
  window.on('close', (event) => {
    if (onQuitRequested()) {
      saveWindowState(window);
      return;
    }
    if (!readSettings().minimizeToTray) {
      event.preventDefault();
      saveWindowState(window);
      requestQuit();
      return;
    }
    event.preventDefault();
    window.hide();
    const settings = readSettings();
    if (!settings.trayHintShown) {
      writeSettings({ trayHintShown: true });
      window.webContents.send(IPC.TRAY_HINT, true);
    }
  });
  window.on('closed', () => clearTimeout(retryTimer));

  const allowedOrigin = new URL(appUrl).origin;
  const openExternalIfNeeded = (target) => {
    try {
      if (new URL(target).origin !== allowedOrigin) {
        shell.openExternal(target);
        return true;
      }
    } catch {
      return true;
    }
    return false;
  };
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!openExternalIfNeeded(url)) window.loadURL(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => {
    if (openExternalIfNeeded(url)) event.preventDefault();
  });

  window.webContents.on('before-input-event', (event, input) => {
    if (!input.control) return;
    const key = input.key.toLowerCase();
    if (key === 'q') {
      event.preventDefault();
      app.quit();
    } else if (key === '0') {
      event.preventDefault();
      window.webContents.setZoomFactor(1);
      writeSettings({ zoomFactor: 1 });
    } else if (['+', '=', '-'].includes(input.key)) {
      event.preventDefault();
      const direction = input.key === '-' ? -0.1 : 0.1;
      const zoomFactor = Math.min(2, Math.max(0.5, window.webContents.getZoomFactor() + direction));
      window.webContents.setZoomFactor(zoomFactor);
      writeSettings({ zoomFactor });
    } else if (input.shift && key === 'i' && (!app.isPackaged || process.env.ENABLE_DEVTOOLS === '1')) {
      event.preventDefault();
      window.webContents.toggleDevTools();
    }
  });

  if (state.maximized) window.maximize();
  return window;
}

function scheduleRetry(window, targetUrl) {
  clearTimeout(retryTimer);
  const delay = RETRY_DELAYS[Math.min(retryIndex, RETRY_DELAYS.length - 1)];
  retryIndex += 1;
  retryTimer = setTimeout(() => loadApp(window, targetUrl), delay);
}

function loadOffline(window, targetUrl) {
  if (!window || window.isDestroyed()) return;
  window.loadFile(path.join(__dirname, 'offline.html'), { query: { target: targetUrl } });
  scheduleRetry(window, targetUrl);
}

function loadApp(window, targetUrl) {
  clearTimeout(retryTimer);
  window.webContents.removeAllListeners('did-fail-load');
  window.webContents.once('did-fail-load', (_event, code, _description, url, isMainFrame) => {
    if (isMainFrame && code !== -3 && !url.startsWith('file:')) loadOffline(window, targetUrl);
  });
  return window.loadURL(targetUrl).then(() => {
    retryIndex = 0;
  }).catch(() => loadOffline(window, targetUrl));
}

module.exports = { createMainWindow, loadApp, loadOffline, saveWindowState };
