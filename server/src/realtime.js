import { parse } from 'cookie';
import { Server } from 'socket.io';
import { db } from './db/index.js';
import { verifyAccessToken } from './utils/tokens.js';
import { getChannelPermissions } from './utils/channelPermissions.js';
import { clientOrigins } from './config/clientOrigins.js';

let io;
const onlineUsers = new Map();

function addOnlineUser(userId) {
  onlineUsers.set(userId, (onlineUsers.get(userId) || 0) + 1);
}

function removeOnlineUser(userId) {
  const remaining = Math.max(0, (onlineUsers.get(userId) || 1) - 1);
  if (remaining) onlineUsers.set(userId, remaining);
  else onlineUsers.delete(userId);
  return remaining > 0;
}

export function isUserOnline(userId) {
  return onlineUsers.has(userId);
}

async function canAccessChannel(userId, channelId) {
  try {
    const permissions = await getChannelPermissions(channelId, userId);
    return permissions.viewChannel;
  } catch {
    return false;
  }
}

async function canAccessConversation(userId, conversationId) {
  return Boolean(conversationId && await db.get(
    'SELECT 1 AS allowed FROM dm_members WHERE conversation_id = ? AND user_id = ?',
    [conversationId, userId]
  ));
}

async function emitFriendPresence(userId, status) {
  const rows = await db.all(
    `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS user_id
     FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`,
    [userId, userId, userId]
  );
  emitToUsers(rows.map((row) => row.user_id), 'social:presence', { userId, status });
}

export function configureRealtime(httpServer) {
  io = new Server(httpServer, {
    path: '/api/socket.io',
    cors: {
      origin: clientOrigins,
      credentials: true
    }
  });

  io.use((socket, next) => {
    try {
      const cookies = parse(socket.handshake.headers.cookie || '');
      const payload = verifyAccessToken(cookies.access_token);
      socket.data.userId = payload.sub;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket) => {
    addOnlineUser(socket.data.userId);
    socket.join(`user:${socket.data.userId}`);
    void emitFriendPresence(socket.data.userId, 'online');

    socket.on('guild:join', async ({ guildId } = {}, acknowledge = () => {}) => {
      try {
        const membership = guildId && await db.get(
          'SELECT id FROM guild_members WHERE guild_id = ? AND user_id = ?',
          [guildId, socket.data.userId]
        );
        if (!membership) {
          acknowledge({ ok: false, error: 'NOT_MEMBER' });
          return;
        }
        for (const room of socket.rooms) {
          if (room.startsWith('guild:')) socket.leave(room);
        }
        socket.join(`guild:${guildId}`);
        io.to(`guild:${guildId}`).emit('presence:update', {
          userId: socket.data.userId,
          status: 'online'
        });
        acknowledge({ ok: true });
      } catch {
        acknowledge({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('channel:join', async ({ channelId } = {}, acknowledge = () => {}) => {
      try {
        if (!channelId || !(await canAccessChannel(socket.data.userId, channelId))) {
          acknowledge({ ok: false, error: 'NOT_MEMBER' });
          return;
        }
        for (const room of socket.rooms) {
          if (room.startsWith('channel:')) socket.leave(room);
        }
        socket.join(`channel:${channelId}`);
        acknowledge({ ok: true });
      } catch {
        acknowledge({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('channel:typing', async ({ channelId, typing } = {}) => {
      if (!channelId || !(await canAccessChannel(socket.data.userId, channelId))) return;
      socket.to(`channel:${channelId}`).emit('channel:typing', {
        channelId,
        userId: socket.data.userId,
        typing: Boolean(typing)
      });
    });

    socket.on('dm:join', async ({ conversationId } = {}, acknowledge = () => {}) => {
      try {
        if (!(await canAccessConversation(socket.data.userId, conversationId))) {
          acknowledge({ ok: false, error: 'NOT_MEMBER' });
          return;
        }
        for (const room of socket.rooms) {
          if (room.startsWith('dm:')) socket.leave(room);
        }
        socket.join(`dm:${conversationId}`);
        acknowledge({ ok: true });
      } catch {
        acknowledge({ ok: false, error: 'INTERNAL_ERROR' });
      }
    });

    socket.on('dm:typing', async ({ conversationId, typing } = {}) => {
      if (!(await canAccessConversation(socket.data.userId, conversationId))) return;
      socket.to(`dm:${conversationId}`).emit('dm:typing', {
        conversationId,
        userId: socket.data.userId,
        typing: Boolean(typing)
      });
    });

    socket.on('disconnecting', async () => {
      const guildRooms = [...socket.rooms].filter((room) => room.startsWith('guild:'));
      const staysOnline = removeOnlineUser(socket.data.userId);
      if (staysOnline) return;
      await emitFriendPresence(socket.data.userId, 'offline');
      for (const room of guildRooms) {
        io.to(room).emit('presence:update', {
          userId: socket.data.userId,
          status: 'offline'
        });
      }
    });
  });

  return io;
}

export function emitToChannel(channelId, event, payload) {
  io?.to(`channel:${channelId}`).emit(event, payload);
}

export function emitToUsers(userIds, event, payload) {
  for (const userId of new Set(userIds)) {
    io?.to(`user:${userId}`).emit(event, payload);
  }
}

export function emitToConversation(conversationId, event, payload) {
  io?.to(`dm:${conversationId}`).emit(event, payload);
}

export async function emitGuildRefresh(guildId, scopes = ['guild', 'members', 'list'], extraUserIds = []) {
  if (!io || !guildId) return;
  const members = await db.all('SELECT user_id FROM guild_members WHERE guild_id = ?', [guildId]);
  let target = io.to(`guild:${guildId}`);
  for (const userId of new Set([...members.map((member) => member.user_id), ...extraUserIds])) {
    target = target.to(`user:${userId}`);
  }
  target.emit('guild:refresh', { guildId, scopes });
}

export function emitGuildRemoved(userId, guildId, reason = 'removed') {
  if (!io || !userId || !guildId) return;
  io.to(`user:${userId}`).emit('guild:removed', { guildId, reason });
  io.in(`user:${userId}`).socketsLeave(`guild:${guildId}`);
}
