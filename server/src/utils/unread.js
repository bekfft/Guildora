import { db } from '../db/index.js';
import { getChannelPermissions } from './channelPermissions.js';

function placeholders(values) {
  return values.map(() => '?').join(', ');
}

export async function readableTextChannelIds(guildId, userId) {
  const channels = await db.all(
    "SELECT id FROM channels WHERE guild_id = ? AND type = 'text' ORDER BY position, created_at",
    [guildId]
  );
  const readable = await Promise.all(channels.map(async (channel) => {
    const permissions = await getChannelPermissions(channel.id, userId);
    return permissions.viewChannel && permissions.readHistory ? channel.id : null;
  }));
  return readable.filter(Boolean);
}

export async function unreadCountsForChannels(channelIds, userId) {
  if (!channelIds.length) return new Map();
  const rows = await db.all(
    `SELECT c.id AS channel_id, COUNT(m.id) AS unread_count
     FROM channels c
     LEFT JOIN channel_read_states cr
       ON cr.channel_id = c.id AND cr.user_id = ?
     LEFT JOIN messages m
       ON m.channel_id = c.id
      AND m.author_id <> ?
      AND (cr.last_read_at IS NULL OR m.created_at > cr.last_read_at)
     WHERE c.id IN (${placeholders(channelIds)})
     GROUP BY c.id`,
    [userId, userId, ...channelIds]
  );
  return new Map(rows.map((row) => [row.channel_id, Number(row.unread_count || 0)]));
}

export async function unreadCountForGuild(guildId, userId) {
  const channelIds = await readableTextChannelIds(guildId, userId);
  const counts = await unreadCountsForChannels(channelIds, userId);
  return [...counts.values()].reduce((sum, value) => sum + value, 0);
}

export async function initializeGuildReadStates(guildId, userId) {
  const channels = await db.all(
    "SELECT id FROM channels WHERE guild_id = ? AND type = 'text'",
    [guildId]
  );
  const now = new Date().toISOString();
  for (const channel of channels) {
    const latest = await db.get(
      'SELECT id, created_at FROM messages WHERE channel_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
      [channel.id]
    );
    await db.run(
      `INSERT INTO channel_read_states
       (user_id, channel_id, last_read_message_id, last_read_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, channel_id) DO NOTHING`,
      [userId, channel.id, latest?.id || null, latest?.created_at || now, now]
    );
  }
}
