export const APP_VERSION = typeof __GUILDORA_VERSION__ === 'string'
  ? __GUILDORA_VERSION__
  : '0.0.0';

function numericVersion(version) {
  return String(version || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function compareVersions(left, right) {
  const leftParts = numericVersion(left);
  const rightParts = numericVersion(right);
  const length = Math.max(leftParts.length, rightParts.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export function isNewerVersion(candidate, current = APP_VERSION) {
  return compareVersions(candidate, current) > 0;
}
