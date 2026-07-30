const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');

const DEFAULTS = {
  autostart: false,
  minimizeToTray: true,
  trayHintShown: false,
  zoomFactor: 1
};

function settingsPath() {
  return path.join(app.getPath('userData'), 'desktop-settings.json');
}

function readSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(settingsPath(), 'utf8')) };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeSettings(partial) {
  const next = { ...readSettings(), ...partial };
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8');
  app.setLoginItemSettings({ openAtLogin: Boolean(next.autostart) });
  return next;
}

module.exports = { readSettings, writeSettings };
