import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { emitToChannel, emitToUsers } from '../realtime.js';
import { requireChannelPermission } from '../utils/channelPermissions.js';
import { createNotification } from '../utils/notifications.js';
import { requireNotTimedOut } from '../utils/moderation.js';
import { assertCapability } from '../services/platformModeration.js';
import { createLinkPreview } from '../services/linkPreviewService.js';
import {
  createMessageSchema,
  messageQuerySchema,
  reactionSchema,
  updateMessageSchema
} from '../validation/messageSchemas.js';

export const MESSAGE_SELECT = `
  SELECT m.id, m.channel_id, m.author_id, m.content, m.created_at,
         m.updated_at, m.edited, u.username,
         COALESCE(NULLIF(gmp.display_name, ''), gm.nickname, u.display_name) AS display_name,
         COALESCE(gmp.avatar_url, u.avatar_url) AS avatar_url,
         CASE WHEN author_bot.id IS NULL THEN 0 ELSE 1 END AS author_is_bot,
         replies.reply_to_id,
         replied.content AS reply_content,
         replied_author.id AS reply_author_id,
         replied_author.username AS reply_username,
         COALESCE(NULLIF(replied_gmp.display_name, ''), replied_gm.nickname, replied_author.display_name) AS reply_display_name,
         COALESCE(replied_gmp.avatar_url, replied_author.avatar_url) AS reply_avatar_url,
         CASE WHEN reply_bot.id IS NULL THEN 0 ELSE 1 END AS reply_author_is_bot
  FROM messages m
  JOIN channels message_channel ON message_channel.id = m.channel_id
  JOIN users u ON u.id = m.author_id
  LEFT JOIN guild_members gm ON gm.guild_id = message_channel.guild_id AND gm.user_id = m.author_id
  LEFT JOIN guild_member_profiles gmp ON gmp.guild_id = message_channel.guild_id AND gmp.user_id = m.author_id
  LEFT JOIN bot_applications author_bot ON author_bot.bot_user_id = m.author_id
  LEFT JOIN message_replies replies ON replies.message_id = m.id
  LEFT JOIN messages replied ON replied.id = replies.reply_to_id
  LEFT JOIN users replied_author ON replied_author.id = replied.author_id
  LEFT JOIN guild_members replied_gm ON replied_gm.guild_id = message_channel.guild_id AND replied_gm.user_id = replied.author_id
  LEFT JOIN guild_member_profiles replied_gmp ON replied_gmp.guild_id = message_channel.guild_id AND replied_gmp.user_id = replied.author_id
  LEFT JOIN bot_applications reply_bot ON reply_bot.bot_user_id = replied.author_id`;

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
      avatar_url: message.avatar_url,
      is_bot: Boolean(message.author_is_bot)
    },
    reply_to: message.reply_to_id ? {
      id: message.reply_to_id,
      content: message.reply_content,
      author: {
        id: message.reply_author_id,
        username: message.reply_username,
        display_name: message.reply_display_name,
        avatar_url: message.reply_avatar_url,
        is_bot: Boolean(message.reply_author_is_bot)
      }
    } : null,
    reactions: [],
    mentions: [],
    link_previews: []
  };
}

export async function hydrateMessages(rows) {
  if (!rows.length) return [];
  const ids = rows.map((message) => message.id);
  const markerList = placeholders(ids);
  const [reactionRows, mentionRows, attachmentRows, previewRows] = await Promise.all([
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
    ),
    db.all(
      `SELECT a.id, a.message_id, a.original_name, a.mime_type, a.size_bytes,
              voice.duration_ms, voice.waveform
       FROM attachments a
       LEFT JOIN voice_message_attachments voice ON voice.attachment_id = a.id
       WHERE a.message_id IN (${markerList}) ORDER BY a.created_at`,
      ids
    ),
    db.all(
      `SELECT id, message_id, url, site_name, title, description
       FROM message_link_previews WHERE message_id IN (${markerList}) ORDER BY created_at`,
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

  const attachmentsByMessage = new Map();
  for (const attachment of attachmentRows) {
    const list = attachmentsByMessage.get(attachment.message_id) || [];
    list.push({
      id: attachment.id,
      name: attachment.original_name,
      mime_type: attachment.mime_type,
      size_bytes: Number(attachment.size_bytes),
      is_voice_message: attachment.duration_ms !== null,
      duration_ms: attachment.duration_ms === null ? null : Number(attachment.duration_ms),
      waveform: attachment.waveform ? JSON.parse(attachment.waveform) : null,
      url: `/api/uploads/${attachment.id}`
    });
    attachmentsByMessage.set(attachment.message_id, list);
  }

  const previewsByMessage = new Map();
  for (const preview of previewRows) {
    const list = previewsByMessage.get(preview.message_id) || [];
    list.push({
      id: preview.id,
      url: preview.url,
      site_name: preview.site_name,
      title: preview.title,
      description: preview.description
    });
    previewsByMessage.set(preview.message_id, list);
  }

  return rows.map((row) => ({
    ...baseMessageResponse(row),
    reactions: [...(reactionsByMessage.get(row.id)?.values() || [])],
    mentions: mentionsByMessage.get(row.id) || [],
    attachments: attachmentsByMessage.get(row.id) || [],
    link_previews: previewsByMessage.get(row.id) || []
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

export async function createBotMessage({ channelId, authorId, content }) {
  await channelAccess(channelId, authorId, 'sendMessages');
  const normalized = String(content || '').trim();
  if (!normalized || normalized.length > 4000) {
    throw new ApiError(400, 'INVALID_BOT_MESSAGE', 'Bot-Nachrichten müssen zwischen 1 und 4000 Zeichen lang sein.');
  }
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  await db.run(
    `INSERT INTO messages (id, channel_id, author_id, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, channelId, authorId, normalized, createdAt, createdAt]
  );
  const message = await hydratedMessage(id);
  emitToChannel(channelId, 'message:create', { message });
  const channel = await db.get('SELECT guild_id FROM channels WHERE id = ?', [channelId]);
  const members = await db.all(
    'SELECT user_id FROM guild_members WHERE guild_id = ? AND user_id <> ?',
    [channel.guild_id, authorId]
  );
  emitToUsers(members.map((member) => member.user_id), 'unread:refresh', {
    guildId: channel.guild_id,
    channelId
  });
  return message;
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
  if (query.around) {
    const target = await messageOrThrow(query.around);
    if (target.channel_id !== req.params.channelId) {
      throw new ApiError(400, 'INVALID_MESSAGE_TARGET', 'Die Zielnachricht gehört nicht zu diesem Channel.');
    }
    const beforeLimit = Math.ceil(query.limit / 2);
    const beforeRows = await db.all(
      `${MESSAGE_SELECT}
       WHERE m.channel_id = ?
         AND (m.created_at < ? OR (m.created_at = ? AND m.id <= ?))
       ORDER BY m.created_at DESC, m.id DESC
       LIMIT ?`,
      [req.params.channelId, target.created_at, target.created_at, target.id, beforeLimit + 1]
    );
    const afterRows = await db.all(
      `${MESSAGE_SELECT}
       WHERE m.channel_id = ?
         AND (m.created_at > ? OR (m.created_at = ? AND m.id > ?))
       ORDER BY m.created_at ASC, m.id ASC
       LIMIT ?`,
      [req.params.channelId, target.created_at, target.created_at, target.id, Math.floor(query.limit / 2)]
    );
    const hasMore = beforeRows.length > beforeLimit;
    const rows = [...beforeRows.slice(0, beforeLimit).reverse(), ...afterRows];
    return res.json({ messages: await hydrateMessages(rows), has_more: hasMore });
  }
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
  await assertCapability(req.userId, 'communicate');
  const permissions = await channelAccess(req.params.channelId, req.userId, 'sendMessages');
  await requireNotTimedOut(permissions.guildId, req.userId);
  const data = createMessageSchema.parse(req.body);
  if (data.attachmentIds.length) await channelAccess(req.params.channelId, req.userId, 'attachFiles');
  const attachments = data.attachmentIds.length ? await db.all(
    `SELECT id FROM attachments WHERE owner_id = ? AND message_id IS NULL AND dm_message_id IS NULL
     AND id IN (${data.attachmentIds.map(() => '?').join(',')})`,
    [req.userId, ...data.attachmentIds]
  ) : [];
  if (attachments.length !== data.attachmentIds.length) {
    throw new ApiError(400, 'INVALID_ATTACHMENTS', 'Mindestens ein Anhang ist ungültig.');
  }
  if (data.voiceMessage) {
    const voiceAttachment = await db.get('SELECT mime_type FROM attachments WHERE id = ?', [data.voiceMessage.attachmentId]);
    if (!voiceAttachment?.mime_type?.startsWith('audio/')) {
      throw new ApiError(400, 'INVALID_VOICE_MESSAGE', 'Eine Sprachnachricht muss eine Audiodatei enthalten.');
    }
  }
  let replyTarget = null;
  if (data.replyToId) {
    replyTarget = await messageOrThrow(data.replyToId);
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
    [id, req.params.channelId, req.userId, data.content.trim(), createdAt, createdAt]
  );
  for (const attachment of attachments) {
    await db.run('UPDATE attachments SET message_id = ? WHERE id = ?', [id, attachment.id]);
  }
  if (data.voiceMessage) {
    await db.run(
      `INSERT INTO voice_message_attachments (attachment_id, duration_ms, waveform)
       VALUES (?, ?, ?)`,
      [data.voiceMessage.attachmentId, data.voiceMessage.durationMs, JSON.stringify(data.voiceMessage.waveform)]
    );
  }
  if (data.replyToId) {
    await db.run(
      'INSERT INTO message_replies (message_id, reply_to_id) VALUES (?, ?)',
      [id, data.replyToId]
    );
  }

  const mentionSync = await syncMentions(id, req.params.channelId, data.content);
  await createLinkPreview(id, data.content);
  const message = await hydratedMessage(id);
  emitToChannel(req.params.channelId, 'message:create', { message });
  const notifiedUsers = mentionSync.newUserIds.filter(
    (userId) => userId !== req.userId && userId !== replyTarget?.author_id
  );
  if (notifiedUsers.length) {
    emitToUsers(notifiedUsers, 'mention:create', { message, channelId: req.params.channelId });
  }
  for (const userId of notifiedUsers) {
    await createNotification({
      userId,
      type: 'mention',
      messageId: id,
      channelId: req.params.channelId,
      actorId: req.userId
    });
  }
  if (replyTarget?.author_id && replyTarget.author_id !== req.userId) {
    await createNotification({
      userId: replyTarget.author_id,
      type: 'reply',
      messageId: id,
      channelId: req.params.channelId,
      actorId: req.userId
    });
  }
  const channel = await db.get('SELECT guild_id FROM channels WHERE id = ?', [req.params.channelId]);
  const guildMembers = await db.all(
    'SELECT user_id FROM guild_members WHERE guild_id = ? AND user_id <> ?',
    [channel.guild_id, req.userId]
  );
  emitToUsers(
    guildMembers.map((member) => member.user_id),
    'unread:refresh',
    { guildId: channel.guild_id, channelId: req.params.channelId }
  );
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
  for (const userId of notifiedUsers) {
    await createNotification({
      userId,
      type: 'mention',
      messageId: stored.id,
      channelId: stored.channel_id,
      actorId: req.userId
    });
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
