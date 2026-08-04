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
  assert.match(source, /autoUpdater\.quitAndInstall\(true, true\)/);
  assert.doesNotMatch(source, /autoUpdater\.quitAndInstall\(false,/);
  assert.match(source, /autoUpdater\.allowDowngrade = false/);
  assert.match(source, /autoUpdater\.allowPrerelease = false/);
  assert.match(source, /UPDATE_CHECK_INTERVAL_MS = 5 \* 60 \* 1000/);
});

test('Renderer kann den letzten Updater-Status nach dem Laden abrufen', () => {
  const ipc = read('src/ipc.js');
  const preload = read('src/preload.js');
  const updater = read('src/updater.js');
  assert.match(ipc, /UPDATE_GET_STATE: 'desktop:update-get-state'/);
  assert.match(preload, /getUpdateState: \(\) => ipcRenderer\.invoke\(IPC\.UPDATE_GET_STATE\)/);
  assert.match(updater, /function getUpdateState\(\)/);
});

test('Browser und Desktop zeigen neue Versionen mit einer direkten Aktualisierungsaktion', () => {
  const toasts = fs.readFileSync(path.join(desktopRoot, '..', 'client', 'src', 'components', 'DesktopToasts.jsx'), 'utf8');
  assert.match(toasts, /BROWSER_UPDATE_INTERVAL_MS = 60 \* 1000/);
  assert.match(toasts, /Neue Guildora-Version verfügbar/);
  assert.match(toasts, /Jetzt neu laden/);
  assert.match(toasts, /Neu starten &amp; aktualisieren/);
  assert.match(toasts, /\['available', 'progress'\]/);
});

test('Release-Build bettet die bereits erhöhte Desktop-Version in den Web-Client ein', () => {
  const release = read('scripts/release.js');
  const versionIndex = release.indexOf("npm', ['version'");
  const buildIndex = release.indexOf("npm', ['run', 'build'");
  assert.ok(versionIndex >= 0);
  assert.ok(buildIndex > versionIndex);
});

test('Desktop-Releases verwenden den vorgeschriebenen Guildora-Tag', () => {
  const builderConfig = read('electron-builder.yml');
  assert.match(builderConfig, /tagNamePrefix:\s*desktop-v/);
  assert.match(builderConfig, /releaseType:\s*release/);
});

test('Windows-Updates verwenden einen stillen One-Click-Installer ohne Auswahlseiten', () => {
  const builderConfig = read('electron-builder.yml');
  assert.match(builderConfig, /oneClick:\s*true/);
  assert.match(builderConfig, /perMachine:\s*false/);
  assert.doesNotMatch(builderConfig, /allowToChangeInstallationDirectory:\s*true/);
});
