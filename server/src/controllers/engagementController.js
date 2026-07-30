import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { emitToUsers } from '../realtime.js';
import { getChannelPermissions, requireChannelPermission } from '../utils/channelPermissions.js';
import {
  NOTIFICATION_SELECT,
  notificationById,
  notificationResponse
} from '../utils/notifications.js';
import { unreadCountsForChannels } from '../utils/unread.js';
import {
  markReadSchema,
  messageSearchSchema,
  notificationQuerySchema
} from '../validation/messageSchemas.js';
import { MESSAGE_SELECT, hydrateMessages } from './messageController.js';

function placeholders(values) {
  return values.map(() => '?').join(', ');
}

async function requireGuildMembership(guildId, userId) {
  const membership = await db.get(
    'SELECT id FROM guild_members WHERE guild_id = ? AND user_id = ?',
    [guildId, userId]
  );
  if (!membership) throw new ApiError(403, 'NOT_MEMBER', 'Du bist kein Mitglied dieses Servers.');
}

export async function markChannelRead(req, res) {
  await requireChannelPermission(req.params.channelId, req.userId, 'readHistory');
  const { messageId } = markReadSchema.parse(req.body || {});
  let target = null;
  if (messageId) {
    target = await db.get(
      'SELECT id, created_at FROM messages WHERE id = ? AND channel_id = ?',
      [messageId, req.params.channelId]
    );
    if (!target) throw new ApiError(404, 'MESSAGE_NOT_FOUND', 'Diese Nachricht wurde nicht gefunden.');
  } else {
    target = await db.get(
      'SELECT id, created_at FROM messages WHERE channel_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
      [req.params.channelId]
    );
  }

  const now = new Date().toISOString();
  const existing = await db.get(
    'SELECT last_read_at FROM channel_read_states WHERE user_id = ? AND channel_id = ?',
    [req.userId, req.params.channelId]
  );
  const targetReadAt = target?.created_at || now;
  if (!existing || targetReadAt > existing.last_read_at) {
    await db.run(
      `INSERT INTO channel_read_states
       (user_id, channel_id, last_read_message_id, last_read_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id, channel_id) DO UPDATE SET
         last_read_message_id = excluded.last_read_message_id,
         last_read_at = excluded.last_read_at,
         updated_at = excluded.updated_at`,
      [req.userId, req.params.channelId, target?.id || null, targetReadAt, now]
    );
  }
  const counts = await unreadCountsForChannels([req.params.channelId], req.userId);
  const payload = {
    channelId: req.params.channelId,
    unread_count: counts.get(req.params.channelId) || 0,
    last_read_message_id: target?.id || null
  };
  emitToUsers([req.userId], 'channel:read', payload);
  return res.json(payload);
}

export async function listNotifications(req, res) {
  const query = notificationQuerySchema.parse(req.query);
  const rows = await db.all(
    `${NOTIFICATION_SELECT}
     WHERE n.user_id = ? ${query.unreadOnly ? 'AND n.read_at IS NULL' : ''}
     ORDER BY n.created_at DESC
     LIMIT ?`,
    [req.userId, query.limit]
  );
  const unread = await db.get(
    'SELECT COUNT(*) AS count FROM user_notifications WHERE user_id = ? AND read_at IS NULL',
    [req.userId]
  );
  return res.json({
    notifications: rows.map(notificationResponse),
    unread_count: Number(unread.count || 0)
  });
}

export async function readNotification(req, res) {
  const notification = await notificationById(req.params.id, req.userId);
  if (!notification) {
    throw new ApiError(404, 'NOTIFICATION_NOT_FOUND', 'Diese Benachrichtigung wurde nicht gefunden.');
  }
  if (!notification.read_at) {
    await db.run(
      'UPDATE user_notifications SET read_at = ? WHERE id = ? AND user_id = ?',
      [new Date().toISOString(), notification.id, req.userId]
    );
  }
  return res.json({ notification: await notificationById(notification.id, req.userId) });
}

export async function readAllNotifications(req, res) {
  await db.run(
    'UPDATE user_notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL',
    [new Date().toISOString(), req.userId]
  );
  return res.status(204).end();
}

export async function searchMessages(req, res) {
  const query = messageSearchSchema.parse(req.query);
  await requireGuildMembership(req.params.guildId, req.userId);
  const allChannels = await db.all(
    "SELECT id, name FROM channels WHERE guild_id = ? AND type = 'text'",
    [req.params.guildId]
  );
  const readableChannels = (await Promise.all(allChannels.map(async (channel) => {
    const permissions = await getChannelPermissions(channel.id, req.userId);
    return permissions.viewChannel && permissions.readHistory ? channel : null;
  }))).filter(Boolean);
  const readableIds = readableChannels.map((channel) => channel.id);
  if (query.channelId && !readableIds.includes(query.channelId)) {
    throw new ApiError(403, 'FORBIDDEN', 'Du darfst diesen Channel nicht durchsuchen.');
  }
  const selectedIds = query.channelId ? [query.channelId] : readableIds;
  if (!selectedIds.length) return res.json({ results: [] });

  const conditions = [
    `m.channel_id IN (${placeholders(selectedIds)})`,
    'LOWER(m.content) LIKE ?'
  ];
  const params = [...selectedIds, `%${query.q.toLowerCase()}%`];
  if (query.authorId) {
    conditions.push('m.author_id = ?');
    params.push(query.authorId);
  }
  if (query.dateFrom) {
    conditions.push('m.created_at >= ?');
    params.push(query.dateFrom);
  }
  if (query.dateTo) {
    conditions.push('m.created_at <= ?');
    params.push(query.dateTo);
  }
  params.push(query.limit);
  const matches = await db.all(
    `SELECT m.id, m.channel_id
     FROM messages m
     WHERE ${conditions.join(' AND ')}
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT ?`,
    params
  );
  if (!matches.length) return res.json({ results: [] });

  const rows = await db.all(
    `${MESSAGE_SELECT}
     WHERE m.id IN (${placeholders(matches.map((match) => match.id))})`,
    matches.map((match) => match.id)
  );
  const hydrated = await hydrateMessages(rows);
  const messageById = new Map(hydrated.map((message) => [message.id, message]));
  const channelById = new Map(readableChannels.map((channel) => [channel.id, channel]));
  return res.json({
    results: matches.map((match) => ({
      ...messageById.get(match.id),
      channel: channelById.get(match.channel_id)
    }))
  });
}
