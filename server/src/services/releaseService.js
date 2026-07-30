import { ApiError } from '../middleware/errorHandler.js';

const CACHE_TTL_MS = 15 * 60 * 1000;
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'bekfft';
const GITHUB_REPO = process.env.GITHUB_REPO || 'Guildora';

let cachedRelease = null;
let cachedAt = 0;

function selectWindowsAsset(assets = []) {
  return assets.find((asset) => (
    typeof asset?.name === 'string'
    && /setup.*\.exe$/i.test(asset.name)
    && typeof asset.browser_download_url === 'string'
  )) ?? assets.find((asset) => /\.exe$/i.test(asset?.name || ''));
}

function normalizeRelease(release) {
  const installer = selectWindowsAsset(release?.assets);
  if (!installer) throw new Error('Im neuesten Release fehlt der Windows-Installer.');
  return {
    version: String(release.tag_name || release.name || '').replace(/^desktop-v|^v/i, ''),
    publishedAt: release.published_at,
    windows: {
      url: installer.browser_download_url,
      sizeBytes: Number(installer.size) || 0
    }
  };
}

async function fetchLatestReleaseFromPage(signal) {
  const latestResponse = await fetch(
    `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
    {
      headers: { 'User-Agent': 'Guildora-Server' },
      redirect: 'manual',
      signal
    }
  );
  const location = latestResponse.headers.get('location') || latestResponse.url;
  const tag = decodeURIComponent(location.split('/').filter(Boolean).at(-1) || '');
  const version = tag.replace(/^desktop-v|^v/i, '');
  if (!latestResponse.ok && latestResponse.status !== 302) {
    throw new Error(`GitHub-Release-Seite antwortete mit HTTP ${latestResponse.status}.`);
  }
  if (!tag || !version || version === tag) throw new Error('Der aktuelle Release-Tag konnte nicht ermittelt werden.');

  const installerName = `Guildora-Setup-${version}.exe`;
  const assetsResponse = await fetch(
    `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/expanded_assets/${encodeURIComponent(tag)}`,
    { headers: { 'User-Agent': 'Guildora-Server' }, signal }
  );
  if (!assetsResponse.ok) {
    throw new Error(`GitHub-Assets antworteten mit HTTP ${assetsResponse.status}.`);
  }
  const assetsHtml = await assetsResponse.text();
  if (!assetsHtml.includes(installerName)) {
    throw new Error('Im neuesten Release fehlt der Windows-Installer.');
  }

  return {
    version,
    publishedAt: null,
    windows: {
      url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(installerName)}`,
      sizeBytes: 0
    }
  };
}

async function fetchLatestRelease() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const headers = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'Guildora-Server',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
    let normalized;
    try {
      const response = await fetch(
        `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`,
        { headers, signal: controller.signal }
      );
      if (!response.ok) throw new Error(`GitHub antwortete mit HTTP ${response.status}.`);
      normalized = normalizeRelease(await response.json());
    } catch {
      normalized = await fetchLatestReleaseFromPage(controller.signal);
    }
    cachedRelease = normalized;
    cachedAt = Date.now();
    return normalized;
  } finally {
    clearTimeout(timeout);
  }
}

export async function getLatestRelease() {
  if (cachedRelease && Date.now() - cachedAt < CACHE_TTL_MS) return cachedRelease;
  try {
    return await fetchLatestRelease();
  } catch (error) {
    if (cachedRelease) return cachedRelease;
    const unavailable = new ApiError(
      503,
      'RELEASE_UNAVAILABLE',
      'Die aktuelle Desktop-Version ist momentan nicht verfügbar.'
    );
    unavailable.cause = error;
    throw unavailable;
  }
}

export function clearReleaseCache() {
  cachedRelease = null;
  cachedAt = 0;
}

export { normalizeRelease };
