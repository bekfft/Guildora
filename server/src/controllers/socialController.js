import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { emitToConversation, emitToUsers, isUserOnline } from '../realtime.js';
import {
  dmMessageSchema,
  friendActionSchema,
  friendRequestSchema,
  userSearchSchema
} from '../validation/socialSchemas.js';

const USER_FIELDS = 'id, username, display_name, avatar_url';

function publicUser(row, prefix = '') {
  return {
    id: row[`${prefix}id`],
    username: row[`${prefix}username`],
    display_name: row[`${prefix}display_name`],
    avatar_url: row[`${prefix}avatar_url`],
    status: isUserOnline(row[`${prefix}id`]) ? 'online' : 'offline'
  };
}

async function relationshipBetween(first, second) {
  return db.get(
    `SELECT * FROM friendships
     WHERE (requester_id = ? AND addressee_id = ?)
        OR (requester_id = ? AND addressee_id = ?)
     LIMIT 1`,
    [first, second, second, first]
  );
}

function relationshipState(row, userId) {
  if (!row) return null;
  if (row.status === 'blocked') return row.requester_id === userId ? 'blocked' : 'blocked_by_other';
  if (row.status === 'accepted') return 'accepted';
  return row.requester_id === userId ? 'outgoing' : 'incoming';
}

async function notifySocial(userIds) {
  emitToUsers(userIds, 'social:refresh', {});
}

async function shareGuild(first, second) {
  const row = await db.get(
    `SELECT 1 AS value FROM guild_members first
     JOIN guild_members second ON second.guild_id = first.guild_id
     WHERE first.user_id = ? AND second.user_id = ? LIMIT 1`,
    [first, second]
  );
  return Boolean(row);
}

async function setting(userId, field, fallback) {
  const row = await db.get(`SELECT ${field} AS value FROM user_settings WHERE user_id = ?`, [userId]);
  return row?.value || fallback;
}

async function canDirectMessage(senderId, recipientId) {
  const preference = await setting(recipientId, 'direct_messages', 'friends');
  if (preference === 'none') return false;
  if (preference === 'everyone') return true;
  if (preference === 'shared_servers') return shareGuild(senderId, recipientId);
  const relationship = await relationshipBetween(senderId, recipientId);
  return relationship?.status === 'accepted';
}

export async function searchUsers(req, res) {
  const { q } = userSearchSchema.parse(req.query);
  const term = `%${q.toLowerCase()}%`;
  const rows = await db.all(
    `SELECT ${USER_FIELDS} FROM users
     WHERE id <> ? AND (LOWER(username) LIKE ? OR LOWER(display_name) LIKE ?)
     ORDER BY username ASC LIMIT 20`,
    [req.userId, term, term]
  );
  const users = await Promise.all(rows.map(async (user) => ({
    ...publicUser(user),
    relationship: relationshipState(await relationshipBetween(req.userId, user.id), req.userId)
  })));
  return res.json({ users });
}

export async function listFriends(req, res) {
  const rows = await db.all(
    `SELECT f.*,
      ru.id AS requester_user_id, ru.username AS requester_username,
      ru.display_name AS requester_display_name, ru.avatar_url AS requester_avatar_url,
      au.id AS addressee_user_id, au.username AS addressee_username,
      au.display_name AS addressee_display_name, au.avatar_url AS addressee_avatar_url
     FROM friendships f
     JOIN users ru ON ru.id = f.requester_id
     JOIN users au ON au.id = f.addressee_id
     WHERE f.requester_id = ? OR f.addressee_id = ?
     ORDER BY f.updated_at DESC`,
    [req.userId, req.userId]
  );
  const friends = rows
    .filter((row) => !(row.status === 'blocked' && row.requester_id !== req.userId))
    .map((row) => {
      const requesterIsCurrent = row.requester_id === req.userId;
      const userPrefix = requesterIsCurrent ? 'addressee' : 'requester';
      return {
        id: row.id,
        state: relationshipState(row, req.userId),
        created_at: row.created_at,
        user: {
          id: row[`${userPrefix}_user_id`],
          username: row[`${userPrefix}_username`],
          display_name: row[`${userPrefix}_display_name`],
          avatar_url: row[`${userPrefix}_avatar_url`],
          status: isUserOnline(row[`${userPrefix}_user_id`]) ? 'online' : 'offline'
        }
      };
    });
  return res.json({ friends });
}

export async function createFriendRequest(req, res) {
  const { username } = friendRequestSchema.parse(req.body);
  const target = await db.get(`SELECT ${USER_FIELDS} FROM users WHERE LOWER(username) = LOWER(?)`, [username]);
  if (!target) throw new ApiError(404, 'USER_NOT_FOUND', 'Dieser Nutzer wurde nicht gefunden.');
  if (target.id === req.userId) throw new ApiError(400, 'SELF_REQUEST', 'Du kannst dich nicht selbst hinzufügen.');
  const existing = await relationshipBetween(req.userId, target.id);
  if (existing?.status === 'blocked') throw new ApiError(403, 'FRIEND_BLOCKED', 'Diese Freundschaft kann nicht angefragt werden.');
  if (existing?.status === 'accepted') throw new ApiError(409, 'ALREADY_FRIENDS', 'Ihr seid bereits befreundet.');
  if (existing?.status === 'pending') {
    if (existing.addressee_id === req.userId) {
      await db.run('UPDATE friendships SET status = ?, updated_at = ? WHERE id = ?', ['accepted', new Date().toISOString(), existing.id]);
      await notifySocial([req.userId, target.id]);
      return res.json({ accepted: true });
    }
    throw new ApiError(409, 'REQUEST_EXISTS', 'Die Freundschaftsanfrage ist bereits offen.');
  }
  const preference = await setting(target.id, 'friend_requests', 'everyone');
  if (preference === 'none' || (preference === 'shared_servers' && !(await shareGuild(req.userId, target.id)))) {
    throw new ApiError(403, 'FRIEND_REQUESTS_DISABLED', 'Dieser Nutzer nimmt von dir keine Freundschaftsanfragen an.');
  }
  const id = crypto.randomUUID();
  await db.run(
    'INSERT INTO friendships (id, requester_id, addressee_id, status) VALUES (?, ?, ?, ?)',
    [id, req.userId, target.id, 'pending']
  );
  await notifySocial([req.userId, target.id]);
  const requester = await db.get(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`, [req.userId]);
  emitToUsers([target.id], 'social:friend-request', {
    request: {
      id,
      state: 'incoming',
      user: publicUser(requester)
    }
  });
  return res.status(201).json({ request: { id, user: publicUser(target), state: 'outgoing' } });
}

export async function respondFriendRequest(req, res) {
  const { action } = friendActionSchema.parse(req.body);
  const request = await db.get(
    'SELECT * FROM friendships WHERE id = ? AND addressee_id = ? AND status = ?',
    [req.params.id, req.userId, 'pending']
  );
  if (!request) throw new ApiError(404, 'REQUEST_NOT_FOUND', 'Diese Anfrage wurde nicht gefunden.');
  if (action === 'accept') {
    await db.run('UPDATE friendships SET status = ?, updated_at = ? WHERE id = ?', ['accepted', new Date().toISOString(), request.id]);
  } else {
    await db.run('DELETE FROM friendships WHERE id = ?', [request.id]);
  }
  await notifySocial([request.requester_id, request.addressee_id]);
  return res.status(action === 'accept' ? 200 : 204)[action === 'accept' ? 'json' : 'end'](
    action === 'accept' ? { accepted: true } : undefined
  );
}

export async function removeFriend(req, res) {
  const relationship = await db.get(
    'SELECT * FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)',
    [req.params.id, req.userId, req.userId]
  );
  if (!relationship) throw new ApiError(404, 'FRIEND_NOT_FOUND', 'Diese Verbindung wurde nicht gefunden.');
  const otherId = relationship.requester_id === req.userId ? relationship.addressee_id : relationship.requester_id;
  await db.run('DELETE FROM friendships WHERE id = ?', [relationship.id]);
  await notifySocial([req.userId, otherId]);
  return res.status(204).end();
}

export async function blockUser(req, res) {
  const target = await db.get(`SELECT ${USER_FIELDS} FROM users WHERE id = ?`, [req.params.userId]);
  if (!target || target.id === req.userId) throw new ApiError(404, 'USER_NOT_FOUND', 'Dieser Nutzer wurde nicht gefunden.');
  const existing = await relationshipBetween(req.userId, target.id);
  if (existing) await db.run('DELETE FROM friendships WHERE id = ?', [existing.id]);
  await db.run(
    'INSERT INTO friendships (id, requester_id, addressee_id, status) VALUES (?, ?, ?, ?)',
    [crypto.randomUUID(), req.userId, target.id, 'blocked']
  );
  await notifySocial([req.userId, target.id]);
  return res.status(204).end();
}

export async function unblockUser(req, res) {
  const blocked = await db.get(
    'SELECT * FROM friendships WHERE requester_id = ? AND addressee_id = ? AND status = ?',
    [req.userId, req.params.userId, 'blocked']
  );
  if (!blocked) throw new ApiError(404, 'BLOCK_NOT_FOUND', 'Diese Blockierung wurde nicht gefunden.');
  await db.run('DELETE FROM friendships WHERE id = ?', [blocked.id]);
  await notifySocial([req.userId, req.params.userId]);
  return res.status(204).end();
}

async function requireConversation(conversationId, userId) {
  const conversation = await db.get(
    `SELECT c.* FROM dm_conversations c
     JOIN dm_members dm ON dm.conversation_id = c.id
     WHERE c.id = ? AND dm.user_id = ?`,
    [conversationId, userId]
  );
  if (!conversation) throw new ApiError(403, 'DM_FORBIDDEN', 'Du darfst diese Unterhaltung nicht öffnen.');
  return conversation;
}

async function dmParticipants(conversationId) {
  return db.all(
    `SELECT u.id, u.username, u.display_name, u.avatar_url
     FROM dm_members dm JOIN users u ON u.id = dm.user_id
     WHERE dm.conversation_id = ?`,
    [conversationId]
  );
}

async function attachmentsForDm(ids) {
  if (!ids.length) return new Map();
  const markers = ids.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT id, dm_message_id, original_name, mime_type, size_bytes
     FROM attachments WHERE dm_message_id IN (${markers}) ORDER BY created_at`,
    ids
  );
  const grouped = new Map();
  for (const row of rows) {
    const list = grouped.get(row.dm_message_id) || [];
    list.push({ id: row.id, name: row.original_name, mime_type: row.mime_type, size_bytes: Number(row.size_bytes), url: `/api/uploads/${row.id}` });
    grouped.set(row.dm_message_id, list);
  }
  return grouped;
}

async function hydrateDmMessages(rows) {
  const grouped = await attachmentsForDm(rows.map((row) => row.id));
  return rows.map((row) => ({
    id: row.id,
    conversation_id: row.conversation_id,
    content: row.content,
    created_at: row.created_at,
    updated_at: row.updated_at,
    edited: Boolean(row.edited),
    author: { id: row.author_id, username: row.username, display_name: row.display_name, avatar_url: row.avatar_url },
    attachments: grouped.get(row.id) || []
  }));
}

const DM_SELECT = `SELECT m.*, u.username, u.display_name, u.avatar_url
  FROM dm_messages m JOIN users u ON u.id = m.author_id`;

export async function listConversations(req, res) {
  const rows = await db.all(
    `SELECT c.id, c.updated_at,
      (SELECT content FROM dm_messages lm WHERE lm.conversation_id = c.id ORDER BY lm.created_at DESC, lm.id DESC LIMIT 1) AS last_content,
      (SELECT created_at FROM dm_messages lm WHERE lm.conversation_id = c.id ORDER BY lm.created_at DESC, lm.id DESC LIMIT 1) AS last_message_at,
      (SELECT COUNT(*) FROM dm_messages um
       WHERE um.conversation_id = c.id AND um.author_id <> ?
         AND um.created_at > COALESCE((SELECT dr.last_read_at FROM dm_read_states dr WHERE dr.conversation_id = c.id AND dr.user_id = ?), '1970-01-01')) AS unread_count
     FROM dm_conversations c JOIN dm_members mine ON mine.conversation_id = c.id
     WHERE mine.user_id = ? ORDER BY COALESCE(last_message_at, c.updated_at) DESC`,
    [req.userId, req.userId, req.userId]
  );
  const conversations = await Promise.all(rows.map(async (row) => {
    const participants = await dmParticipants(row.id);
    return {
      id: row.id,
      updated_at: row.updated_at,
      last_content: row.last_content,
      last_message_at: row.last_message_at,
      unread_count: Number(row.unread_count || 0),
      user: publicUser(participants.find((user) => user.id !== req.userId))
    };
  }));
  return res.json({ conversations });
}

export async function createConversation(req, res) {
  const targetId = req.params.userId;
  const relationship = await relationshipBetween(req.userId, targetId);
  if (relationship?.status === 'blocked' || !(await canDirectMessage(req.userId, targetId))) {
    throw new ApiError(403, 'DM_PRIVACY', 'Die Datenschutzeinstellungen dieses Nutzers erlauben keine Direktnachricht.');
  }
  const existing = await db.get(
    `SELECT first.conversation_id AS id FROM dm_members first
     JOIN dm_members second ON second.conversation_id = first.conversation_id
     WHERE first.user_id = ? AND second.user_id = ?
       AND (SELECT COUNT(*) FROM dm_members total WHERE total.conversation_id = first.conversation_id) = 2
     LIMIT 1`,
    [req.userId, targetId]
  );
  const id = existing?.id || crypto.randomUUID();
  if (!existing) {
    await db.run('INSERT INTO dm_conversations (id) VALUES (?)', [id]);
    await db.run('INSERT INTO dm_members (conversation_id, user_id) VALUES (?, ?)', [id, req.userId]);
    await db.run('INSERT INTO dm_members (conversation_id, user_id) VALUES (?, ?)', [id, targetId]);
  }
  await notifySocial([req.userId, targetId]);
  return res.status(existing ? 200 : 201).json({ conversation: { id } });
}

export async function getDmMessages(req, res) {
  await requireConversation(req.params.id, req.userId);
  const rows = await db.all(
    `${DM_SELECT} WHERE m.conversation_id = ? ORDER BY m.created_at DESC, m.id DESC LIMIT 51`,
    [req.params.id]
  );
  const readBy = await db.all(
    'SELECT user_id, last_read_message_id FROM dm_read_states WHERE conversation_id = ? AND user_id <> ?',
    [req.params.id, req.userId]
  );
  return res.json({
    messages: await hydrateDmMessages(rows.slice(0, 50).reverse()),
    has_more: rows.length > 50,
    read_by: readBy
  });
}

export async function createDmMessage(req, res) {
  await requireConversation(req.params.id, req.userId);
  const data = dmMessageSchema.parse(req.body);
  const participants = await dmParticipants(req.params.id);
  const other = participants.find((participant) => participant.id !== req.userId);
  const friendship = other && await relationshipBetween(req.userId, other.id);
  if (friendship?.status === 'blocked' || !other || !(await canDirectMessage(req.userId, other.id))) {
    throw new ApiError(403, 'DM_PRIVACY', 'Die Datenschutzeinstellungen dieses Nutzers erlauben keine Direktnachricht.');
  }
  const attachments = data.attachmentIds.length ? await db.all(
    `SELECT id FROM attachments WHERE owner_id = ? AND message_id IS NULL AND dm_message_id IS NULL
     AND id IN (${data.attachmentIds.map(() => '?').join(',')})`,
    [req.userId, ...data.attachmentIds]
  ) : [];
  if (attachments.length !== data.attachmentIds.length) throw new ApiError(400, 'INVALID_ATTACHMENTS', 'Mindestens ein Anhang ist ungültig.');
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.run(
    'INSERT INTO dm_messages (id, conversation_id, author_id, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [id, req.params.id, req.userId, data.content.trim(), now, now]
  );
  for (const attachment of attachments) await db.run('UPDATE attachments SET dm_message_id = ? WHERE id = ?', [id, attachment.id]);
  await db.run('UPDATE dm_conversations SET updated_at = ? WHERE id = ?', [now, req.params.id]);
  const message = (await hydrateDmMessages([await db.get(`${DM_SELECT} WHERE m.id = ?`, [id])]))[0];
  emitToConversation(req.params.id, 'dm:message', { message });
  emitToUsers(participants.map((user) => user.id), 'dm:refresh', { conversationId: req.params.id });
  emitToUsers(
    participants.filter((user) => user.id !== req.userId).map((user) => user.id),
    'dm:notification',
    { conversationId: req.params.id, message }
  );
  return res.status(201).json({ message });
}

export async function markDmRead(req, res) {
  await requireConversation(req.params.id, req.userId);
  const latest = await db.get(
    'SELECT id, created_at FROM dm_messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
    [req.params.id]
  );
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO dm_read_states (conversation_id, user_id, last_read_message_id, last_read_at)
     VALUES (?, ?, ?, ?) ON CONFLICT(conversation_id, user_id) DO UPDATE SET
       last_read_message_id = excluded.last_read_message_id, last_read_at = excluded.last_read_at`,
    [req.params.id, req.userId, latest?.id || null, latest?.created_at || now]
  );
  emitToConversation(req.params.id, 'dm:read', { conversationId: req.params.id, userId: req.userId, messageId: latest?.id || null });
  emitToUsers([req.userId], 'dm:refresh', { conversationId: req.params.id });
  return res.json({ last_read_message_id: latest?.id || null });
}
