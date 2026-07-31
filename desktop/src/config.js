const FALLBACK_URL = process.env.APP_URL
  ?? 'https://bekfft.de';
const DEV_URL = process.env.APP_URL ?? 'http://localhost:5173';
const GITHUB_OWNER = process.env.GITHUB_OWNER ?? 'bekfft';
const GITHUB_REPO = process.env.GITHUB_REPO ?? 'Guildora';
const CONFIG_URL =
  `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/main/desktop-config.json`;

module.exports = {
  APP_NAME: 'Guildora',
  APP_PROTOCOL: 'guildora',
  CONFIG_REFRESH_MS: 30 * 60 * 1000,
  CONFIG_TIMEOUT_MS: 4_000,
  CONFIG_URL,
  DEV_URL,
  FALLBACK_URL,
  GITHUB_OWNER,
  GITHUB_REPO
};
