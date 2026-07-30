const fs = require('node:fs/promises');
const path = require('node:path');
const { app } = require('electron');
const log = require('electron-log/main');
const {
  CONFIG_TIMEOUT_MS,
  CONFIG_URL,
  DEV_URL,
  FALLBACK_URL
} = require('./config');

function normalizeConfig(value) {
  if (!value || typeof value !== 'object' || typeof value.appUrl !== 'string') return null;
  let parsed;
  try {
    parsed = new URL(value.appUrl);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:') return null;
  return {
    appUrl: parsed.toString().replace(/\/$/, ''),
    minVersion: typeof value.minVersion === 'string' ? value.minVersion : '0.0.0',
    notice: typeof value.notice === 'string' && value.notice.trim() ? value.notice.trim() : null
  };
}

function getCachePath() {
  return path.join(app.getPath('userData'), 'app-config.json');
}

async function readCachedConfig() {
  try {
    const value = JSON.parse(await fs.readFile(getCachePath(), 'utf8'));
    return normalizeConfig(value);
  } catch {
    return null;
  }
}

async function writeCachedConfig(config) {
  await fs.mkdir(path.dirname(getCachePath()), { recursive: true });
  await fs.writeFile(getCachePath(), JSON.stringify(config, null, 2), 'utf8');
}

async function fetchRemoteConfig() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CONFIG_TIMEOUT_MS);
  try {
    const response = await fetch(CONFIG_URL, {
      headers: { 'User-Agent': 'Guildora-Desktop' },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const config = normalizeConfig(await response.json());
    if (!config) throw new Error('Ungültige Desktop-Konfiguration');
    await writeCachedConfig(config);
    return config;
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshRemoteConfig() {
  try {
    return await fetchRemoteConfig();
  } catch (error) {
    log.warn('Remote-Konfiguration konnte nicht geladen werden:', error.message);
    return null;
  }
}

async function resolveAppUrl() {
  if (!app.isPackaged) {
    const config = { appUrl: DEV_URL, minVersion: '0.0.0', notice: null };
    return { config, refreshPromise: Promise.resolve(null) };
  }
  const cached = await readCachedConfig();
  const config = cached ?? { appUrl: FALLBACK_URL, minVersion: '0.0.0', notice: null };
  return { config, refreshPromise: refreshRemoteConfig() };
}

module.exports = {
  fetchRemoteConfig,
  normalizeConfig,
  readCachedConfig,
  refreshRemoteConfig,
  resolveAppUrl
};
