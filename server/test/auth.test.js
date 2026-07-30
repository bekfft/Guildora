import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { io as connectSocket } from 'socket.io-client';

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'guildora-test-'));
process.env.NODE_ENV = 'test';
process.env.SQLITE_PATH = path.join(temporaryDirectory, 'auth.sqlite');
process.env.JWT_ACCESS_SECRET = 'test-access-secret-with-sufficient-length';
process.env.REFRESH_TOKEN_SECRET = 'test-refresh-secret-with-sufficient-length';
process.env.LIVEKIT_URL = 'ws://127.0.0.1:7880';
process.env.LIVEKIT_API_KEY = 'test-livekit-key';
process.env.LIVEKIT_API_SECRET = 'test-livekit-secret-with-more-than-thirty-two-characters';

const { app } = await import('../src/index.js');
const { db, runMigrations } = await import('../src/db/index.js');
const { configureRealtime } = await import('../src/realtime.js');
const { signAccessToken } = await import('../src/utils/tokens.js');
const { TokenVerifier } = await import('livekit-server-sdk');

let server;
let baseUrl;
let authCookie;
let registeredUserId;
let createdGuildId;
let createdChannelId;
let createdVoiceChannelId;

function cookiesFrom(response) {
  return response.headers.getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

async function request(pathname, { body, cookie, method = body ? 'POST' : 'GET' } = {}) {
  return fetch(`${baseUrl}${pathname}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

before(async () => {
  await runMigrations();
  await new Promise((resolve) => {
    server = http.createServer(app);
    configureRealtime(server);
    server.listen(0, '127.0.0.1', () => {
      baseUrl = `http://127.0.0.1:${server.address().port}`;
      resolve();
    });
  });
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await db.close();
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

test('Registrierung speichert nur den Hash und setzt sichere Cookies', async () => {
  const response = await request('/api/auth/register', {
    body: {
      email: 'Mira@example.de',
      username: 'mira.test',
      password: 'SicheresPasswort42',
      birthdate: '2000-05-20',
      newsletter: false
    }
  });
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.deepEqual(Object.keys(body.user).sort(), ['avatar_url', 'created_at', 'display_name', 'email', 'id', 'username']);
  assert.equal(body.user.email, 'mira@example.de');
  assert.equal(body.user.display_name, 'mira.test');
  registeredUserId = body.user.id;

  const cookies = response.headers.getSetCookie();
  assert.equal(cookies.length, 2);
  assert.ok(cookies.every((cookie) => cookie.toLowerCase().includes('httponly')));
  assert.ok(cookies.every((cookie) => cookie.toLowerCase().includes('samesite=lax')));
  authCookie = cookiesFrom(response);

  const stored = await db.get('SELECT password_hash FROM users WHERE id = ?', [body.user.id]);
  assert.notEqual(stored.password_hash, 'SicheresPasswort42');
  assert.ok(stored.password_hash.startsWith('$2'));
});

test('/me liefert nur das öffentliche Nutzerobjekt', async () => {
  const response = await request('/api/auth/me', { cookie: authCookie });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.user.username, 'mira.test');
  assert.equal('password_hash' in body.user, false);
  assert.equal('birthdate' in body.user, false);
});

test('Doppelte E-Mail und doppelter Benutzername erzeugen Feldfehler', async () => {
  const duplicateEmail = await request('/api/auth/register', {
    body: {
      email: 'mira@example.de',
      username: 'andere.mira',
      password: 'SicheresPasswort42',
      birthdate: '2000-05-20'
    }
  });
  assert.equal(duplicateEmail.status, 409);
  assert.equal((await duplicateEmail.json()).error.code, 'EMAIL_TAKEN');

  const duplicateUsername = await request('/api/auth/register', {
    body: {
      email: 'andere@example.de',
      username: 'mira.test',
      password: 'SicheresPasswort42',
      birthdate: '2000-05-20'
    }
  });
  assert.equal(duplicateUsername.status, 409);
  const body = await duplicateUsername.json();
  assert.equal(body.error.code, 'USERNAME_TAKEN');
  assert.equal(body.error.field, 'username');
});

test('Login verrät keine Details und akzeptiert E-Mail oder Benutzername', async () => {
  const wrong = await request('/api/auth/login', {
    body: { identifier: 'mira.test', password: 'Falsch123' }
  });
  assert.equal(wrong.status, 401);
  assert.equal((await wrong.json()).error.code, 'INVALID_CREDENTIALS');

  const correct = await request('/api/auth/login', {
    body: { identifier: 'MIRA.TEST', password: 'SicheresPasswort42' }
  });
  assert.equal(correct.status, 200);
  authCookie = cookiesFrom(correct);
});

test('Server erstellen erzeugt Standards, Mitgliedschaft und geschützte Details', async () => {
  const created = await request('/api/guilds', {
    cookie: authCookie,
    body: { name: 'Test Community' }
  });
  assert.equal(created.status, 201);
  const body = await created.json();
  assert.equal(body.guild.name, 'Test Community');
  assert.equal(body.channel.name, 'allgemein');
  createdGuildId = body.guild.id;
  createdChannelId = body.channel.id;

  const mine = await request('/api/guilds/@me', { cookie: authCookie });
  assert.equal(mine.status, 200);
  assert.ok((await mine.json()).guilds.some((guild) => guild.id === body.guild.id));

  const details = await request(`/api/guilds/${body.guild.id}`, { cookie: authCookie });
  assert.equal(details.status, 200);
  const detailsBody = await details.json();
  assert.equal(detailsBody.categories.length, 2);
  assert.equal(detailsBody.channels.length, 2);
  createdVoiceChannelId = detailsBody.channels.find((channel) => channel.type === 'voice').id;
  assert.equal(detailsBody.roles.length, 1);
  assert.equal(detailsBody.roles[0].name, '@everyone');
  assert.equal(detailsBody.roles[0].is_default, true);

  const members = await request(`/api/guilds/${body.guild.id}/members`, { cookie: authCookie });
  assert.equal(members.status, 200);
  const owner = (await members.json()).members.find((member) => member.user_id === registeredUserId);
  assert.equal(owner.is_owner, true);
  assert.deepEqual(owner.roles, []);

  const ownerLeave = await request(`/api/guilds/${body.guild.id}/leave`, { method: 'DELETE', cookie: authCookie });
  assert.equal(ownerLeave.status, 403);
  assert.equal((await ownerLeave.json()).error.code, 'OWNER_CANNOT_LEAVE');
});

test('Voice-Tokens sind kurzlebig, rechtegeprüft und nur für Sprachkanäle gültig', async () => {
  const status = await request('/api/voice/status', { cookie: authCookie });
  assert.equal(status.status, 200);
  assert.deepEqual(await status.json(), { provider: 'livekit', available: true });

  const tokenResponse = await request(`/api/voice/channels/${createdVoiceChannelId}/token`, {
    method: 'POST',
    cookie: authCookie
  });
  assert.equal(tokenResponse.status, 201);
  const body = await tokenResponse.json();
  assert.equal(body.url, 'ws://127.0.0.1:7880/');
  assert.equal(body.room.channel_id, createdVoiceChannelId);
  assert.equal(body.participant.id, registeredUserId);
  assert.ok(body.token.length > 100);

  const verifier = new TokenVerifier(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET
  );
  const claims = await verifier.verify(body.token);
  assert.equal(claims.sub, registeredUserId);
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.room, body.room.name);
  assert.equal(claims.video.canPublish, true);
  assert.equal(claims.video.canSubscribe, true);
  assert.equal(claims.video.canPublishData, false);

  const textChannel = await request(`/api/voice/channels/${createdChannelId}/token`, {
    method: 'POST',
    cookie: authCookie
  });
  assert.equal(textChannel.status, 400);
  assert.equal((await textChannel.json()).error.code, 'NOT_A_VOICE_CHANNEL');

  const outsiderId = crypto.randomUUID();
  await db.run(
    `INSERT INTO users
     (id, email, username, display_name, password_hash, birthdate)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [outsiderId, 'voice-outsider@example.de', 'voice.outsider', 'Voice Outsider', 'not-used', '1995-01-01']
  );
  const outsider = await request(`/api/voice/channels/${createdVoiceChannelId}/token`, {
    method: 'POST',
    cookie: `access_token=${signAccessToken(outsiderId)}`
  });
  assert.equal(outsider.status, 403);

  const saved = {
    url: process.env.LIVEKIT_URL,
    key: process.env.LIVEKIT_API_KEY,
    secret: process.env.LIVEKIT_API_SECRET
  };
  delete process.env.LIVEKIT_URL;
  delete process.env.LIVEKIT_API_KEY;
  delete process.env.LIVEKIT_API_SECRET;
  const unavailable = await request(`/api/voice/channels/${createdVoiceChannelId}/token`, {
    method: 'POST',
    cookie: authCookie
  });
  const unavailableParticipants = await request(
    `/api/voice/channels/${createdVoiceChannelId}/participants`,
    { cookie: authCookie }
  );
  process.env.LIVEKIT_URL = saved.url;
  process.env.LIVEKIT_API_KEY = saved.key;
  process.env.LIVEKIT_API_SECRET = saved.secret;
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).error.code, 'VOICE_UNAVAILABLE');
  assert.equal(unavailableParticipants.status, 503);
  assert.equal((await unavailableParticipants.json()).error.code, 'VOICE_UNAVAILABLE');
});

test('Serververwaltung ändert Profil, Kategorien, Channels, Rollen und Mitglieder', async () => {
  const profile = await request(`/api/guilds/${createdGuildId}`, {
    method: 'PATCH',
    cookie: authCookie,
    body: {
      name: 'Test Community Plus',
      description: 'Echte Verwaltung im Integrationstest',
      category: 'Technik'
    }
  });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).guild.name, 'Test Community Plus');

  const ownerCannotPublish = await request(`/api/guilds/${createdGuildId}`, {
    method: 'PATCH',
    cookie: authCookie,
    body: {
      name: 'Test Community Plus',
      description: 'Echte Verwaltung im Integrationstest',
      category: 'Technik',
      isPublic: true
    }
  });
  assert.equal(ownerCannotPublish.status, 400);

  const category = await request(`/api/guilds/${createdGuildId}/categories`, {
    cookie: authCookie,
    body: { name: 'Projekte' }
  });
  assert.equal(category.status, 201);
  const categoryBody = await category.json();
  assert.equal(categoryBody.category.name, 'PROJEKTE');

  const channel = await request(`/api/guilds/${createdGuildId}/channels`, {
    cookie: authCookie,
    body: {
      name: 'Projekt Planung',
      type: 'text',
      categoryId: categoryBody.category.id,
      topic: 'Planung und Abstimmung'
    }
  });
  assert.equal(channel.status, 201);
  const channelBody = await channel.json();
  assert.equal(channelBody.channel.name, 'projekt-planung');

  const updatedChannel = await request(`/api/guilds/${createdGuildId}/channels/${channelBody.channel.id}`, {
    method: 'PATCH',
    cookie: authCookie,
    body: {
      name: 'Projekt Chat',
      type: 'text',
      categoryId: categoryBody.category.id,
      topic: 'Aktualisiert',
      position: 5
    }
  });
  assert.equal(updatedChannel.status, 200);
  assert.equal((await updatedChannel.json()).channel.name, 'projekt-chat');

  const role = await request(`/api/guilds/${createdGuildId}/roles`, {
    cookie: authCookie,
    body: {
      name: 'Projektleitung',
      color: '#22AA88',
      permissions: {
        manageServer: false,
        manageChannels: true,
        manageRoles: false,
        kickMembers: false,
        manageMessages: true
      }
    }
  });
  assert.equal(role.status, 201);
  const roleBody = await role.json();
  assert.equal(roleBody.role.permissions.manageChannels, true);

  const membersResponse = await request(`/api/guilds/${createdGuildId}/members`, { cookie: authCookie });
  const ownerMember = (await membersResponse.json()).members.find((member) => member.user_id === registeredUserId);
  const assigned = await request(`/api/guilds/${createdGuildId}/members/${ownerMember.id}/roles`, {
    method: 'PUT',
    cookie: authCookie,
    body: { roleIds: [roleBody.role.id] }
  });
  assert.equal(assigned.status, 200);
  assert.deepEqual((await assigned.json()).role_ids, [roleBody.role.id]);

  const nickname = await request(`/api/guilds/${createdGuildId}/members/${ownerMember.id}`, {
    method: 'PATCH',
    cookie: authCookie,
    body: { nickname: 'Mira im Server' }
  });
  assert.equal(nickname.status, 200);
  assert.equal((await nickname.json()).member.nickname, 'Mira im Server');

  const details = await request(`/api/guilds/${createdGuildId}`, { cookie: authCookie });
  const detailsBody = await details.json();
  assert.equal(detailsBody.roles.find((item) => item.id === roleBody.role.id).permissions.manageMessages, true);

  assert.equal((await request(`/api/guilds/${createdGuildId}/roles/${roleBody.role.id}`, { method: 'DELETE', cookie: authCookie })).status, 204);
  assert.equal((await request(`/api/guilds/${createdGuildId}/channels/${channelBody.channel.id}`, { method: 'DELETE', cookie: authCookie })).status, 204);
  assert.equal((await request(`/api/guilds/${createdGuildId}/categories/${categoryBody.category.id}`, { method: 'DELETE', cookie: authCookie })).status, 204);
});

test('Nachrichten unterstützen Antworten, Reaktionen, Erwähnungen und Echtzeit', async () => {
  const secondUser = { id: crypto.randomUUID(), username: 'alex.test' };
  await db.run(
    `INSERT INTO users
     (id, email, username, display_name, password_hash, birthdate)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [secondUser.id, 'alex@example.de', secondUser.username, 'Alex Test', 'not-used-in-this-test', '1998-07-12']
  );
  const secondCookie = `access_token=${signAccessToken(secondUser.id)}`;
  await db.run(
    'INSERT INTO guild_members (id, guild_id, user_id) VALUES (?, ?, ?)',
    [crypto.randomUUID(), createdGuildId, secondUser.id]
  );

  const realtimeClient = connectSocket(baseUrl, {
    path: '/api/socket.io',
    transports: ['websocket'],
    extraHeaders: { Cookie: authCookie }
  });
  const mentionedClient = connectSocket(baseUrl, {
    path: '/api/socket.io',
    transports: ['websocket'],
    extraHeaders: { Cookie: secondCookie }
  });
  await new Promise((resolve, reject) => {
    realtimeClient.once('connect', resolve);
    realtimeClient.once('connect_error', reject);
  });
  await new Promise((resolve, reject) => {
    mentionedClient.once('connect', resolve);
    mentionedClient.once('connect_error', reject);
  });
  const joined = await new Promise((resolve) => {
    realtimeClient.emit('channel:join', { channelId: createdChannelId }, resolve);
  });
  assert.deepEqual(joined, { ok: true });
  const realtimeMessage = new Promise((resolve) => realtimeClient.once('message:create', resolve));

  const created = await request(`/api/channels/${createdChannelId}/messages`, {
    cookie: authCookie,
    body: { content: 'Hallo aus dem Integrationstest' }
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.equal(createdBody.message.content, 'Hallo aus dem Integrationstest');
  assert.equal(createdBody.message.author.id, registeredUserId);
  assert.equal(createdBody.message.channel_id, createdChannelId);
  assert.ok(createdBody.message.created_at.endsWith('Z'));
  const realtimeBody = await realtimeMessage;
  assert.equal(realtimeBody.message.id, createdBody.message.id);

  const mentionEvent = new Promise((resolve) => mentionedClient.once('mention:create', resolve));
  const realtimeReply = new Promise((resolve) => realtimeClient.once('message:create', resolve));
  const reply = await request(`/api/channels/${createdChannelId}/messages`, {
    cookie: authCookie,
    body: {
      content: 'Hallo @alex.test, das ist meine Antwort.',
      replyToId: createdBody.message.id
    }
  });
  assert.equal(reply.status, 201);
  const replyBody = await reply.json();
  assert.equal(replyBody.message.reply_to.id, createdBody.message.id);
  assert.equal(replyBody.message.mentions.length, 1);
  assert.equal(replyBody.message.mentions[0].id, secondUser.id);
  assert.equal((await realtimeReply).message.id, replyBody.message.id);
  assert.equal((await mentionEvent).message.id, replyBody.message.id);

  const reactionEvent = new Promise((resolve) => realtimeClient.once('message:reaction', resolve));
  const reacted = await request(`/api/messages/${replyBody.message.id}/reactions`, {
    method: 'PUT',
    cookie: secondCookie,
    body: { emoji: '❤️' }
  });
  assert.equal(reacted.status, 200);
  const reactedBody = await reacted.json();
  assert.equal(reactedBody.active, true);
  assert.equal(reactedBody.reaction.count, 1);
  assert.deepEqual(reactedBody.reaction.user_ids, [secondUser.id]);
  assert.equal((await reactionEvent).messageId, replyBody.message.id);

  const listed = await request(`/api/channels/${createdChannelId}/messages?limit=25`, { cookie: authCookie });
  assert.equal(listed.status, 200);
  const listedBody = await listed.json();
  assert.equal(listedBody.messages.length, 2);
  assert.equal(listedBody.messages[0].id, createdBody.message.id);
  assert.equal(listedBody.messages[1].reply_to.id, createdBody.message.id);
  assert.equal(listedBody.messages[1].reactions[0].count, 1);
  assert.equal(listedBody.has_more, false);

  const secondNotifications = await request('/api/notifications', { cookie: secondCookie });
  assert.equal(secondNotifications.status, 200);
  const secondNotificationBody = await secondNotifications.json();
  assert.equal(secondNotificationBody.unread_count, 1);
  assert.equal(secondNotificationBody.notifications[0].type, 'mention');
  assert.equal(secondNotificationBody.notifications[0].message_id, replyBody.message.id);

  const markedRead = await request(`/api/channels/${createdChannelId}/read`, {
    method: 'POST',
    cookie: secondCookie,
    body: { messageId: replyBody.message.id }
  });
  assert.equal(markedRead.status, 200);
  assert.equal((await markedRead.json()).unread_count, 0);

  const unreadEvent = new Promise((resolve) => mentionedClient.once('unread:refresh', resolve));
  const searchable = await request(`/api/channels/${createdChannelId}/messages`, {
    cookie: authCookie,
    body: { content: 'Diese eindeutig suchbare Nachricht bleibt auffindbar.' }
  });
  assert.equal(searchable.status, 201);
  const searchableBody = await searchable.json();
  assert.equal((await unreadEvent).channelId, createdChannelId);

  const guildWithUnread = await request(`/api/guilds/${createdGuildId}`, { cookie: secondCookie });
  assert.equal(guildWithUnread.status, 200);
  const unreadChannel = (await guildWithUnread.json()).channels.find((channel) => channel.id === createdChannelId);
  assert.equal(unreadChannel.unread_count, 1);

  const search = await request(
    `/api/guilds/${createdGuildId}/messages/search?q=${encodeURIComponent('eindeutig suchbare')}`,
    { cookie: secondCookie }
  );
  assert.equal(search.status, 200);
  const searchBody = await search.json();
  assert.equal(searchBody.results.length, 1);
  assert.equal(searchBody.results[0].id, searchableBody.message.id);
  assert.equal(searchBody.results[0].channel.id, createdChannelId);

  const around = await request(
    `/api/channels/${createdChannelId}/messages?around=${searchableBody.message.id}&limit=25`,
    { cookie: secondCookie }
  );
  assert.equal(around.status, 200);
  assert.ok((await around.json()).messages.some((message) => message.id === searchableBody.message.id));

  const replyNotificationEvent = new Promise((resolve) => realtimeClient.once('notification:create', resolve));
  const secondReply = await request(`/api/channels/${createdChannelId}/messages`, {
    cookie: secondCookie,
    body: {
      content: 'Antwort von Alex auf den Suchtreffer.',
      replyToId: searchableBody.message.id
    }
  });
  assert.equal(secondReply.status, 201);
  const secondReplyBody = await secondReply.json();
  const replyNotification = await replyNotificationEvent;
  assert.equal(replyNotification.notification.type, 'reply');
  assert.equal(replyNotification.notification.message_id, secondReplyBody.message.id);

  const ownerNotifications = await request('/api/notifications?unreadOnly=true', { cookie: authCookie });
  assert.equal(ownerNotifications.status, 200);
  const ownerNotificationBody = await ownerNotifications.json();
  assert.equal(ownerNotificationBody.unread_count, 1);
  assert.equal(ownerNotificationBody.notifications[0].type, 'reply');
  assert.equal((await request(`/api/notifications/${ownerNotificationBody.notifications[0].id}/read`, {
    method: 'PATCH',
    cookie: authCookie
  })).status, 200);
  assert.equal((await (await request('/api/notifications', { cookie: authCookie })).json()).unread_count, 0);

  const updated = await request(`/api/messages/${replyBody.message.id}`, {
    method: 'PATCH',
    cookie: authCookie,
    body: { content: 'Bearbeitete Nachricht' }
  });
  assert.equal(updated.status, 200);
  const updatedBody = await updated.json();
  assert.equal(updatedBody.message.content, 'Bearbeitete Nachricht');
  assert.equal(updatedBody.message.edited, true);
  assert.equal(updatedBody.message.mentions.length, 0);
  assert.equal(updatedBody.message.reply_to.id, createdBody.message.id);

  const unreacted = await request(`/api/messages/${replyBody.message.id}/reactions`, {
    method: 'PUT',
    cookie: secondCookie,
    body: { emoji: '❤️' }
  });
  assert.equal(unreacted.status, 200);
  assert.equal((await unreacted.json()).active, false);

  assert.equal((await request(`/api/messages/${secondReplyBody.message.id}`, {
    method: 'DELETE',
    cookie: secondCookie
  })).status, 204);
  assert.equal((await request(`/api/messages/${searchableBody.message.id}`, {
    method: 'DELETE',
    cookie: authCookie
  })).status, 204);

  const removed = await request(`/api/messages/${createdBody.message.id}`, {
    method: 'DELETE',
    cookie: authCookie
  });
  assert.equal(removed.status, 204);

  const replySurvives = await request(`/api/channels/${createdChannelId}/messages`, { cookie: authCookie });
  const survivingMessages = (await replySurvives.json()).messages;
  assert.equal(survivingMessages.length, 1);
  assert.equal(survivingMessages[0].id, replyBody.message.id);
  assert.equal(survivingMessages[0].reply_to, null);

  assert.equal((await request(`/api/messages/${replyBody.message.id}`, {
    method: 'DELETE',
    cookie: authCookie
  })).status, 204);
  realtimeClient.disconnect();
  mentionedClient.disconnect();
});

test('Discovery, Join und Leave funktionieren vollständig', async () => {
  const guildId = crypto.randomUUID();
  const ownerId = crypto.randomUUID();
  const roleId = crypto.randomUUID();
  const categoryId = crypto.randomUUID();
  const channelId = crypto.randomUUID();
  await db.run(
    `INSERT INTO users
     (id, email, username, display_name, password_hash, birthdate)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [ownerId, 'owner@test.local', 'test.owner', 'Test Owner', 'not-used-in-this-test', '1990-01-01']
  );
  await db.run(
    `INSERT INTO guilds
     (id, name, slug, description, owner_id, is_public, category)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [guildId, 'Offener Testserver', 'offener-testserver', 'Für den API-Test', ownerId, true, 'Community']
  );
  await db.run(
    'INSERT INTO roles (id, guild_id, name, position, is_default) VALUES (?, ?, ?, ?, ?)',
    [roleId, guildId, 'Mitglied', 0, true]
  );
  await db.run('INSERT INTO channel_categories (id, guild_id, name, position) VALUES (?, ?, ?, ?)', [categoryId, guildId, 'START', 0]);
  await db.run(
    'INSERT INTO channels (id, guild_id, category_id, name, type, position) VALUES (?, ?, ?, ?, ?, ?)',
    [channelId, guildId, categoryId, 'willkommen', 'text', 0]
  );

  const hiddenDiscovery = await request('/api/guilds/discovery?q=offener', { cookie: authCookie });
  assert.equal(hiddenDiscovery.status, 200);
  assert.equal((await hiddenDiscovery.json()).guilds.length, 0);

  await db.run('UPDATE guilds SET is_public = ?, is_verified = ? WHERE id = ?', [true, true, guildId]);
  const discovery = await request('/api/guilds/discovery?q=offener', { cookie: authCookie });
  assert.equal(discovery.status, 200);
  assert.equal((await discovery.json()).guilds[0].is_member, false);

  const joined = await request(`/api/guilds/${guildId}/join`, { method: 'POST', cookie: authCookie });
  assert.equal(joined.status, 201);
  assert.equal((await joined.json()).channel.id, channelId);

  const ownerOnly = await request(`/api/guilds/${guildId}`, {
    method: 'PATCH',
    cookie: authCookie,
    body: {
      name: 'Nicht erlaubt',
      description: '',
      category: 'Community'
    }
  });
  assert.equal(ownerOnly.status, 403);
  assert.equal((await ownerOnly.json()).error.code, 'MISSING_PERMISSION');

  await db.run(
    `INSERT INTO role_permissions
     (role_id, manage_server, manage_channels, manage_roles, kick_members, manage_messages)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [roleId, true, false, false, false, false]
  );
  const delegated = await request(`/api/guilds/${guildId}`, {
    method: 'PATCH',
    cookie: authCookie,
    body: {
      name: 'Delegiert verwaltet',
      description: 'Rollenrechte sind wirksam.',
      category: 'Community'
    }
  });
  assert.equal(delegated.status, 200);
  assert.equal((await delegated.json()).guild.name, 'Delegiert verwaltet');

  const members = await request(`/api/guilds/${guildId}/members`, { cookie: authCookie });
  assert.equal(members.status, 200);
  assert.equal((await members.json()).members.length, 1);

  const left = await request(`/api/guilds/${guildId}/leave`, { method: 'DELETE', cookie: authCookie });
  assert.equal(left.status, 204);
  const forbidden = await request(`/api/guilds/${guildId}`, { cookie: authCookie });
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, 'NOT_MEMBER');
});

test('Refresh rotiert den Token und Logout beendet die Cookie-Sitzung', async () => {
  const oldCookie = authCookie;
  const refreshed = await request('/api/auth/refresh', { method: 'POST', cookie: oldCookie });
  assert.equal(refreshed.status, 200);
  authCookie = cookiesFrom(refreshed);

  const reused = await request('/api/auth/refresh', { method: 'POST', cookie: oldCookie });
  assert.equal(reused.status, 401);

  const logout = await request('/api/auth/logout', { method: 'POST', cookie: authCookie });
  assert.equal(logout.status, 204);
  assert.ok(logout.headers.getSetCookie().every((cookie) => /Expires=Thu, 01 Jan 1970|Max-Age=0/i.test(cookie)));

  const anonymous = await request('/api/auth/me');
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).error.code, 'UNAUTHORIZED');
});

test('Channel-Rechte filtern Channels und schuetzen Verlauf sowie Schreiben', async () => {
  const login = await request('/api/auth/login', {
    body: { identifier: 'mira.test', password: 'SicheresPasswort42' }
  });
  assert.equal(login.status, 200);
  const ownerCookie = cookiesFrom(login);

  const details = await request(`/api/guilds/${createdGuildId}`, { cookie: ownerCookie });
  assert.equal(details.status, 200);
  const defaultRole = (await details.json()).roles.find((role) => role.is_default);
  assert.ok(defaultRole);

  const restricted = await request(
    `/api/guilds/${createdGuildId}/channels/${createdChannelId}/permissions/${defaultRole.id}`,
    {
      method: 'PUT',
      cookie: ownerCookie,
      body: {
        viewChannel: -1,
        readHistory: -1,
        sendMessages: -1,
        attachFiles: -1,
        manageMessages: 0
      }
    }
  );
  assert.equal(restricted.status, 200);
  await db.run('UPDATE guilds SET is_public = ?, is_verified = ? WHERE id = ?', [true, true, createdGuildId]);

  const memberUserId = crypto.randomUUID();
  await db.run(
    `INSERT INTO users
     (id, email, username, display_name, password_hash, birthdate)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      memberUserId,
      'channel.member@example.de',
      'channel.member',
      'channel.member',
      'not-used-in-this-test',
      '1998-04-12'
    ]
  );
  const memberCookie = `access_token=${signAccessToken(memberUserId)}`;

  const joined = await request(`/api/guilds/${createdGuildId}/join`, {
    method: 'POST',
    cookie: memberCookie
  });
  assert.equal(joined.status, 201);

  const membersAfterJoin = await request(`/api/guilds/${createdGuildId}/members`, { cookie: ownerCookie });
  const joinedMember = (await membersAfterJoin.json()).members.find((member) => member.user_id === memberUserId);
  assert.equal(joinedMember.is_owner, false);
  assert.deepEqual(joinedMember.roles, []);
  assert.equal(joinedMember.status, 'offline');

  const presenceClient = connectSocket(baseUrl, {
    path: '/api/socket.io',
    transports: ['websocket'],
    extraHeaders: { Cookie: memberCookie }
  });
  await new Promise((resolve, reject) => {
    presenceClient.once('connect', resolve);
    presenceClient.once('connect_error', reject);
  });
  const presenceJoined = await new Promise((resolve) => {
    presenceClient.emit('guild:join', { guildId: createdGuildId }, resolve);
  });
  assert.deepEqual(presenceJoined, { ok: true });
  const membersWhileOnline = await request(`/api/guilds/${createdGuildId}/members`, { cookie: ownerCookie });
  assert.equal(
    (await membersWhileOnline.json()).members.find((member) => member.user_id === memberUserId).status,
    'online'
  );
  presenceClient.disconnect();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const membersAfterDisconnect = await request(`/api/guilds/${createdGuildId}/members`, { cookie: ownerCookie });
  assert.equal(
    (await membersAfterDisconnect.json()).members.find((member) => member.user_id === memberUserId).status,
    'offline'
  );

  const hiddenGuild = await request(`/api/guilds/${createdGuildId}`, { cookie: memberCookie });
  assert.equal(hiddenGuild.status, 200);
  assert.equal((await hiddenGuild.json()).channels.some((channel) => channel.id === createdChannelId), false);

  const hiddenHistory = await request(`/api/channels/${createdChannelId}/messages`, { cookie: memberCookie });
  assert.equal(hiddenHistory.status, 403);
  assert.equal((await hiddenHistory.json()).error.code, 'CHANNEL_PERMISSION_DENIED');

  const visibleWithoutMessaging = await request(
    `/api/guilds/${createdGuildId}/channels/${createdChannelId}/permissions/${defaultRole.id}`,
    {
      method: 'PUT',
      cookie: ownerCookie,
      body: {
        viewChannel: 1,
        readHistory: -1,
        sendMessages: -1,
        attachFiles: -1,
        manageMessages: 0
      }
    }
  );
  assert.equal(visibleWithoutMessaging.status, 200);

  const visibleGuild = await request(`/api/guilds/${createdGuildId}`, { cookie: memberCookie });
  const visibleChannel = (await visibleGuild.json()).channels.find((channel) => channel.id === createdChannelId);
  assert.ok(visibleChannel);
  assert.equal(visibleChannel.permissions.viewChannel, true);
  assert.equal(visibleChannel.permissions.readHistory, false);
  assert.equal(visibleChannel.permissions.sendMessages, false);

  assert.equal((await request(`/api/channels/${createdChannelId}/messages`, { cookie: memberCookie })).status, 403);
  assert.equal((await request(`/api/channels/${createdChannelId}/messages`, {
    cookie: memberCookie,
    body: { content: 'Diese Nachricht darf nicht gesendet werden.' }
  })).status, 403);

  const allowed = await request(
    `/api/guilds/${createdGuildId}/channels/${createdChannelId}/permissions/${defaultRole.id}`,
    {
      method: 'PUT',
      cookie: ownerCookie,
      body: {
        viewChannel: 1,
        readHistory: 1,
        sendMessages: 1,
        attachFiles: -1,
        manageMessages: 0
      }
    }
  );
  assert.equal(allowed.status, 200);
  assert.equal((await request(`/api/channels/${createdChannelId}/messages`, { cookie: memberCookie })).status, 200);

  const created = await request(`/api/channels/${createdChannelId}/messages`, {
    cookie: memberCookie,
    body: { content: 'Erlaubte Channel-Nachricht' }
  });
  assert.equal(created.status, 201);
  const createdMessage = await created.json();
  assert.equal((await request(`/api/messages/${createdMessage.message.id}`, {
    method: 'DELETE',
    cookie: memberCookie
  })).status, 204);

  const configured = await request(
    `/api/guilds/${createdGuildId}/channels/${createdChannelId}/permissions`,
    { cookie: ownerCookie }
  );
  assert.equal(configured.status, 200);
  assert.ok((await configured.json()).permissions.some((permission) => permission.roleId === defaultRole.id));

  const reset = await request(
    `/api/guilds/${createdGuildId}/channels/${createdChannelId}/permissions/${defaultRole.id}`,
    { method: 'DELETE', cookie: ownerCookie }
  );
  assert.equal(reset.status, 204);
});

test('Servereinladungen haben Vorschau, Limits, Beitritt und Widerruf', async () => {
  const created = await request(`/api/guilds/${createdGuildId}/invites`, {
    cookie: authCookie,
    body: { expiresIn: 3600, maxUses: 1 }
  });
  assert.equal(created.status, 201);
  const createdBody = await created.json();
  assert.match(createdBody.invite.code, /^[A-Za-z0-9_-]{8,32}$/);
  assert.equal(createdBody.invite.max_uses, 1);
  assert.equal(createdBody.invite.uses, 0);
  assert.equal(createdBody.invite.is_active, true);

  const preview = await request(`/api/invites/${createdBody.invite.code}`);
  assert.equal(preview.status, 200);
  const previewBody = await preview.json();
  assert.equal(previewBody.invite.guild.id, createdGuildId);
  assert.equal(previewBody.invite.is_active, true);

  const inviteeUserId = crypto.randomUUID();
  await db.run(
    `INSERT INTO users
     (id, email, username, display_name, password_hash, birthdate)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      inviteeUserId,
      'invitee@example.de',
      'invitee.test',
      'invitee.test',
      'not-used-in-this-test',
      '2001-06-15'
    ]
  );
  const inviteeCookie = `access_token=${signAccessToken(inviteeUserId)}`;

  const joined = await request(`/api/invites/${createdBody.invite.code}/join`, {
    method: 'POST',
    cookie: inviteeCookie
  });
  assert.equal(joined.status, 201);
  const joinedBody = await joined.json();
  assert.equal(joinedBody.guild.id, createdGuildId);
  assert.ok(joinedBody.channel.id);
  assert.equal(joinedBody.already_member, false);

  const joinedAgain = await request(`/api/invites/${createdBody.invite.code}/join`, {
    method: 'POST',
    cookie: inviteeCookie
  });
  assert.equal(joinedAgain.status, 200);
  assert.equal((await joinedAgain.json()).already_member, true);

  const exhaustedPreview = await request(`/api/invites/${createdBody.invite.code}`);
  assert.equal(exhaustedPreview.status, 200);
  assert.equal((await exhaustedPreview.json()).invite.is_exhausted, true);

  const secondInvite = await request(`/api/guilds/${createdGuildId}/invites`, {
    cookie: authCookie,
    body: { expiresIn: null, maxUses: null }
  });
  assert.equal(secondInvite.status, 201);
  const secondInviteBody = await secondInvite.json();
  assert.equal(secondInviteBody.invite.expires_at, null);
  assert.equal(secondInviteBody.invite.max_uses, null);

  const listed = await request(`/api/guilds/${createdGuildId}/invites`, { cookie: authCookie });
  assert.equal(listed.status, 200);
  assert.equal((await listed.json()).invites.length, 2);

  const revoked = await request(`/api/guilds/${createdGuildId}/invites/${secondInviteBody.invite.id}`, {
    method: 'DELETE',
    cookie: authCookie
  });
  assert.equal(revoked.status, 204);

  const revokedPreview = await request(`/api/invites/${secondInviteBody.invite.code}`);
  assert.equal(revokedPreview.status, 404);
});
