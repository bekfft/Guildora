const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const desktopRoot = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(desktopRoot, relativePath), 'utf8');
}

test('Desktop-Updater lädt stabile Updates automatisch und installiert sie beim Beenden', () => {
  const source = read('src/updater.js');
  assert.match(source, /autoUpdater\.autoDownload = true/);
  assert.match(source, /autoUpdater\.autoInstallOnAppQuit = true/);
  assert.match(source, /autoUpdater\.allowDowngrade = false/);
  assert.match(source, /autoUpdater\.allowPrerelease = false/);
  assert.match(source, /UPDATE_CHECK_INTERVAL_MS = 30 \* 60 \* 1000/);
});

test('Renderer kann den letzten Updater-Status nach dem Laden abrufen', () => {
  const ipc = read('src/ipc.js');
  const preload = read('src/preload.js');
  const updater = read('src/updater.js');
  assert.match(ipc, /UPDATE_GET_STATE: 'desktop:update-get-state'/);
  assert.match(preload, /getUpdateState: \(\) => ipcRenderer\.invoke\(IPC\.UPDATE_GET_STATE\)/);
  assert.match(updater, /function getUpdateState\(\)/);
});
