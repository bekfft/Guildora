import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { emitToChannel, emitToUsers } from '../realtime.js';
import { requireChannelPermission } from '../utils/channelPermissions.js';
import {
  createMessageSchema,
  messageQuerySchema,
  reactionSchema,
  updateMessageSchema
} from '../validation/messageSchemas.js';

const MESSAGE_SELECT = `
  SELECT m.id, m.channel_id, m.author_id, m.content, m.created_at,
         m.updated_at, m.edited, u.username, u.display_name, u.avatar_url,
         replies.reply_to_id,
         replied.content AS reply_content,
         replied_author.id AS reply_author_id,
         replied_author.username AS reply_username,
         replied_author.display_name AS reply_display_name,
         replied_author.avatar_url AS reply_avatar_url
  FROM messages m
  JOIN users u ON u.id = m.author_id
  LEFT JOIN message_replies replies ON replies.message_id = m.id
  LEFT JOIN messages replied ON replied.id = replies.reply_to_id
  LEFT JOIN users replied_author ON replied_author.id = replied.author_id`;

function placeholders(values) {
  return values.map(() => '?').join(', ');
}

function baseMessageResponse(message) {
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
    },
    reply_to: message.reply_to_id ? {
      id: message.reply_to_id,
      content: message.reply_content,
      author: {
        id: message.reply_author_id,
        username: message.reply_username,
        display_name: message.reply_display_name,
        avatar_url: message.reply_avatar_url
      }
    } : null,
    reactions: [],
    mentions: []
  };
}

async function hydrateMessages(rows) {
  if (!rows.length) return [];
  const ids = rows.map((message) => message.id);
  const markerList = placeholders(ids);
  const [reactionRows, mentionRows] = await Promise.all([
    db.all(
      `SELECT message_id, emoji, user_id
       FROM message_reactions
       WHERE message_id IN (${markerList})
       ORDER BY created_at ASC`,
      ids
    ),
    db.all(
      `SELECT mm.message_id, u.id, u.username, u.display_name, u.avatar_url
       FROM message_mentions mm
       JOIN users u ON u.id = mm.user_id
       WHERE mm.message_id IN (${markerList})
       ORDER BY u.username ASC`,
      ids
    )
  ]);

  const reactionsByMessage = new Map();
  for (const reaction of reactionRows) {
    const grouped = reactionsByMessage.get(reaction.message_id) || new Map();
    const item = grouped.get(reaction.emoji) || { emoji: reaction.emoji, count: 0, user_ids: [] };
    item.count += 1;
    item.user_ids.push(reaction.user_id);
    grouped.set(reaction.emoji, item);
    reactionsByMessage.set(reaction.message_id, grouped);
  }

  const mentionsByMessage = new Map();
  for (const mention of mentionRows) {
    const mentions = mentionsByMessage.get(mention.message_id) || [];
    mentions.push({
      id: mention.id,
      username: mention.username,
      display_name: mention.display_name,
      avatar_url: mention.avatar_url
    });
    mentionsByMessage.set(mention.message_id, mentions);
  }

  return rows.map((row) => ({
    ...baseMessageResponse(row),
    reactions: [...(reactionsByMessage.get(row.id)?.values() || [])],
    mentions: mentionsByMessage.get(row.id) || []
  }));
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

async function hydratedMessage(messageId) {
  return (await hydrateMessages([await messageOrThrow(messageId)]))[0];
}

function mentionedUsernames(content) {
  return [...new Set(
    [...content.matchAll(/(^|[^\w])@([a-z0-9._]{2,32})/gi)]
      .map((match) => match[2].toLowerCase())
  )];
}

async function syncMentions(messageId, channelId, content) {
  const previous = await db.all('SELECT user_id FROM message_mentions WHERE message_id = ?', [messageId]);
  const previousIds = new Set(previous.map((mention) => mention.user_id));
  const usernames = mentionedUsernames(content);
  let members = [];

  if (usernames.length) {
    members = await db.all(
      `SELECT DISTINCT u.id, u.username, u.display_name, u.avatar_url
       FROM users u
       JOIN guild_members gm ON gm.user_id = u.id
       JOIN channels c ON c.guild_id = gm.guild_id
       WHERE c.id = ? AND LOWER(u.username) IN (${placeholders(usernames)})`,
      [channelId, ...usernames]
    );
  }

  await db.run('DELETE FROM message_mentions WHERE message_id = ?', [messageId]);
  for (const member of members) {
    await db.run(
      'INSERT INTO message_mentions (message_id, user_id) VALUES (?, ?)',
      [messageId, member.id]
    );
  }

  return {
    mentions: members,
    newUserIds: members.filter((member) => !previousIds.has(member.id)).map((member) => member.id)
  };
}

async function reactionFor(messageId, emoji) {
  const rows = await db.all(
    `SELECT user_id FROM message_reactions
     WHERE message_id = ? AND emoji = ?
     ORDER BY created_at ASC`,
    [messageId, emoji]
  );
  return { emoji, count: rows.length, user_ids: rows.map((row) => row.user_id) };
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
  const messages = await hydrateMessages(rows.slice(0, query.limit).reverse());
  return res.json({ messages, has_more: hasMore });
}

export async function createMessage(req, res) {
  await channelAccess(req.params.channelId, req.userId, 'sendMessages');
  const data = createMessageSchema.parse(req.body);
  if (data.replyToId) {
    const replyTarget = await messageOrThrow(data.replyToId);
    if (replyTarget.channel_id !== req.params.channelId) {
      throw new ApiError(400, 'INVALID_REPLY_TARGET', 'Du kannst nur auf Nachrichten im selben Channel antworten.');
    }
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.run(
    `INSERT INTO messages
     (id, channel_id, author_id, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, req.params.channelId, req.userId, data.content, createdAt, createdAt]
  );
  if (data.replyToId) {
    await db.run(
      'INSERT INTO message_replies (message_id, reply_to_id) VALUES (?, ?)',
      [id, data.replyToId]
    );
  }

  const mentionSync = await syncMentions(id, req.params.channelId, data.content);
  const message = await hydratedMessage(id);
  emitToChannel(req.params.channelId, 'message:create', { message });
  const notifiedUsers = mentionSync.newUserIds.filter((userId) => userId !== req.userId);
  if (notifiedUsers.length) {
    emitToUsers(notifiedUsers, 'mention:create', { message, channelId: req.params.channelId });
  }
  return res.status(201).json({ message });
}

export async function updateMessage(req, res) {
  const stored = await messageOrThrow(req.params.id);
  await channelAccess(stored.channel_id, req.userId, 'sendMessages');
  if (stored.author_id !== req.userId) {
    throw new ApiError(403, 'FORBIDDEN', 'Du kannst nur deine eigenen Nachrichten bearbeiten.');
  }
  const data = updateMessageSchema.parse(req.body);
  const updatedAt = new Date().toISOString();
  await db.run(
    'UPDATE messages SET content = ?, updated_at = ?, edited = ? WHERE id = ?',
    [data.content, updatedAt, true, stored.id]
  );
  const mentionSync = await syncMentions(stored.id, stored.channel_id, data.content);
  const message = await hydratedMessage(stored.id);
  emitToChannel(stored.channel_id, 'message:update', { message });
  const notifiedUsers = mentionSync.newUserIds.filter((userId) => userId !== req.userId);
  if (notifiedUsers.length) {
    emitToUsers(notifiedUsers, 'mention:create', { message, channelId: stored.channel_id });
  }
  return res.json({ message });
}

export async function toggleReaction(req, res) {
  const stored = await messageOrThrow(req.params.id);
  await channelAccess(stored.channel_id, req.userId, 'sendMessages');
  const { emoji } = reactionSchema.parse(req.body);
  const existing = await db.get(
    'SELECT message_id FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
    [stored.id, req.userId, emoji]
  );
  const active = !existing;
  if (existing) {
    await db.run(
      'DELETE FROM message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?',
      [stored.id, req.userId, emoji]
    );
  } else {
    await db.run(
      'INSERT INTO message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)',
      [stored.id, req.userId, emoji]
    );
  }
  const reaction = await reactionFor(stored.id, emoji);
  const payload = {
    messageId: stored.id,
    channelId: stored.channel_id,
    userId: req.userId,
    active,
    reaction
  };
  emitToChannel(stored.channel_id, 'message:reaction', payload);
  return res.json(payload);
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
