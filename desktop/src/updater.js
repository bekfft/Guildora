const { app } = require('electron');
const log = require('electron-log/main');
const { autoUpdater } = require('electron-updater');
const { IPC } = require('./ipc');

let mainWindow;
let lastEvent = { type: 'none' };
let initialTimer;
let interval;
let checkPromise;

const INITIAL_CHECK_DELAY_MS = 3_000;
const UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

function emit(type, data = {}) {
  lastEvent = { type, ...data };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.UPDATE_EVENT, lastEvent);
}

async function checkForUpdates() {
  if (!app.isPackaged) {
    log.info('Update-Prüfung im Entwicklungsmodus übersprungen.');
    emit('none', { message: 'Entwicklungsmodus' });
    return lastEvent;
  }
  if (checkPromise) return checkPromise;
  checkPromise = autoUpdater.checkForUpdates()
    .catch((error) => {
      log.error('Update-Prüfung fehlgeschlagen:', error);
      emit('error', { message: 'Update konnte nicht geprüft werden.' });
      return null;
    })
    .then(() => lastEvent)
    .finally(() => {
      checkPromise = null;
    });
  return checkPromise;
}

function getUpdateState() {
  return lastEvent;
}

function initializeUpdater(window) {
  mainWindow = window;
  log.initialize();
  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;
  autoUpdater.on('checking-for-update', () => emit('checking'));
  autoUpdater.on('update-available', (info) => emit('available', { version: info.version }));
  autoUpdater.on('download-progress', (progress) => emit('progress', { percent: Math.round(progress.percent) }));
  autoUpdater.on('update-downloaded', (info) => emit('downloaded', { version: info.version }));
  autoUpdater.on('update-not-available', () => emit('none'));
  autoUpdater.on('error', (error) => {
    log.error('Auto-Updater-Fehler:', error);
    emit('error', { message: 'Update konnte nicht geprüft werden.' });
  });
  if (!app.isPackaged) {
    log.info('Auto-Updater im Entwicklungsmodus deaktiviert.');
    return;
  }
  initialTimer = setTimeout(checkForUpdates, INITIAL_CHECK_DELAY_MS);
  interval = setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
}

function installUpdate() {
  if (app.isPackaged) autoUpdater.quitAndInstall(true, true);
}

function stopUpdater() {
  clearTimeout(initialTimer);
  clearInterval(interval);
}

module.exports = { checkForUpdates, getUpdateState, initializeUpdater, installUpdate, stopUpdater };
