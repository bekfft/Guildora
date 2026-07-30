import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { emitToUsers } from '../realtime.js';

export const NOTIFICATION_SELECT = `
  SELECT n.id, n.type, n.message_id, n.channel_id, n.created_at, n.read_at,
         m.content, g.id AS guild_id, g.name AS guild_name, c.name AS channel_name,
         actor.id AS actor_id, actor.username AS actor_username,
         actor.display_name AS actor_display_name, actor.avatar_url AS actor_avatar_url
  FROM user_notifications n
  JOIN messages m ON m.id = n.message_id
  JOIN channels c ON c.id = n.channel_id
  JOIN guilds g ON g.id = c.guild_id
  JOIN users actor ON actor.id = n.actor_id`;

export function notificationResponse(row) {
  return {
    id: row.id,
    type: row.type,
    message_id: row.message_id,
    channel_id: row.channel_id,
    guild_id: row.guild_id,
    guild_name: row.guild_name,
    channel_name: row.channel_name,
    content: row.content,
    created_at: row.created_at,
    read_at: row.read_at,
    actor: {
      id: row.actor_id,
      username: row.actor_username,
      display_name: row.actor_display_name,
      avatar_url: row.actor_avatar_url
    }
  };
}

export async function notificationById(id, userId) {
  const row = await db.get(
    `${NOTIFICATION_SELECT} WHERE n.id = ? AND n.user_id = ?`,
    [id, userId]
  );
  return row ? notificationResponse(row) : null;
}

export async function createNotification({ userId, type, messageId, channelId, actorId }) {
  if (!userId || userId === actorId) return null;
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const result = await db.run(
    `INSERT INTO user_notifications
     (id, user_id, type, message_id, channel_id, actor_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, type, message_id) DO NOTHING`,
    [id, userId, type, messageId, channelId, actorId, createdAt]
  );
  if (!Number(result.changes || result.rowCount || 0)) return null;
  const notification = await notificationById(id, userId);
  if (notification) emitToUsers([userId], 'notification:create', { notification });
  return notification;
}
