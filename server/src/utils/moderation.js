import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';

export async function requireNotBanned(guildId, userId) {
  const ban = await db.get('SELECT reason FROM guild_bans WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
  if (ban) throw new ApiError(403, 'GUILD_BANNED', ban.reason || 'Du wurdest von diesem Server gesperrt.');
}

export async function requireNotTimedOut(guildId, userId) {
  const timeout = await db.get(
    'SELECT expires_at, reason FROM guild_timeouts WHERE guild_id = ? AND user_id = ? AND expires_at > ?',
    [guildId, userId, new Date().toISOString()]
  );
  if (timeout) {
    throw new ApiError(403, 'GUILD_TIMEOUT', `Du bist bis ${new Date(timeout.expires_at).toLocaleString('de-DE')} im Timeout.`);
  }
}
