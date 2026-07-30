import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { emitToChannel } from '../realtime.js';
import { requireChannelPermission } from '../utils/channelPermissions.js';
import { messageBodySchema, messageQuerySchema } from '../validation/messageSchemas.js';

const MESSAGE_SELECT = `
  SELECT m.id, m.channel_id, m.author_id, m.content, m.created_at,
         m.updated_at, m.edited, u.username, u.display_name, u.avatar_url
  FROM messages m
  JOIN users u ON u.id = m.author_id`;

function messageResponse(message) {
  return {
    id: message.id,
    channel_id: message.channel_id,
    content: message.content,
    created_at: message.created_at,
    updated_at: message.updated_at,
    edited: Boolean(message.edited),
    author: {
      id: message.author_id,
      username: message.username,
      display_name: message.display_name,
      avatar_url: message.avatar_url
    }
  };
}

async function channelAccess(channelId, userId, permission) {
  const permissions = await requireChannelPermission(channelId, userId, 'viewChannel');
  if (permissions.channelType !== 'text') {
    throw new ApiError(400, 'INVALID_CHANNEL_TYPE', 'Nachrichten sind nur in Text-Channels möglich.');
  }
  if (permission) await requireChannelPermission(channelId, userId, permission);
  return permissions;
}

async function messageOrThrow(messageId) {
  const message = await db.get(`${MESSAGE_SELECT} WHERE m.id = ?`, [messageId]);
  if (!message) throw new ApiError(404, 'MESSAGE_NOT_FOUND', 'Diese Nachricht wurde nicht gefunden.');
  return message;
}

export async function getMessages(req, res) {
  await channelAccess(req.params.channelId, req.userId, 'readHistory');
  const query = messageQuerySchema.parse(req.query);
  const params = [req.params.channelId];
  let beforeClause = '';
  if (query.before) {
    beforeClause = 'AND m.created_at < ?';
    params.push(query.before);
  }
  params.push(query.limit + 1);
  const rows = await db.all(
    `${MESSAGE_SELECT}
     WHERE m.channel_id = ? ${beforeClause}
     ORDER BY m.created_at DESC, m.id DESC
     LIMIT ?`,
    params
  );
  const hasMore = rows.length > query.limit;
  const messages = rows.slice(0, query.limit).reverse().map(messageResponse);
  return res.json({ messages, has_more: hasMore });
}

export async function createMessage(req, res) {
  await channelAccess(req.params.channelId, req.userId, 'sendMessages');
  const data = messageBodySchema.parse(req.body);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.run(
    `INSERT INTO messages
     (id, channel_id, author_id, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, req.params.channelId, req.userId, data.content, createdAt, createdAt]
  );
  const message = messageResponse(await messageOrThrow(id));
  emitToChannel(req.params.channelId, 'message:create', { message });
  return res.status(201).json({ message });
}

export async function updateMessage(req, res) {
  const stored = await messageOrThrow(req.params.id);
  await channelAccess(stored.channel_id, req.userId, 'sendMessages');
  if (stored.author_id !== req.userId) {
    throw new ApiError(403, 'FORBIDDEN', 'Du kannst nur deine eigenen Nachrichten bearbeiten.');
  }
  const data = messageBodySchema.parse(req.body);
  const updatedAt = new Date().toISOString();
  await db.run(
    'UPDATE messages SET content = ?, updated_at = ?, edited = ? WHERE id = ?',
    [data.content, updatedAt, true, stored.id]
  );
  const message = messageResponse(await messageOrThrow(stored.id));
  emitToChannel(stored.channel_id, 'message:update', { message });
  return res.json({ message });
}

export async function deleteMessage(req, res) {
  const stored = await messageOrThrow(req.params.id);
  const permissions = await channelAccess(stored.channel_id, req.userId);
  if (stored.author_id !== req.userId && !permissions.manageMessages) {
    throw new ApiError(403, 'FORBIDDEN', 'Dir fehlt die Berechtigung, diese Nachricht zu löschen.');
  }
  await db.run('DELETE FROM messages WHERE id = ?', [stored.id]);
  emitToChannel(stored.channel_id, 'message:delete', { messageId: stored.id, channelId: stored.channel_id });
  return res.status(204).end();
}
