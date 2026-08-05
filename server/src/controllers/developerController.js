import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { hashBotToken, issueBotToken } from '../middleware/requireBotAuth.js';
import { requirePermission } from './guildAdminController.js';
import { createBotMessage } from './messageController.js';

const VALID_SCOPES = new Set(['messages.write', 'commands', 'events.read']);

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function text(value, name, { min = 0, max = 200 } = {}) {
  const normalized = String(value || '').trim();
  if (normalized.length < min || normalized.length > max) {
    throw new ApiError(400, 'INVALID_INPUT', `${name} muss zwischen ${min} und ${max} Zeichen lang sein.`);
  }
  return normalized;
}

function scopes(value) {
  const normalized = [...new Set(Array.isArray(value) ? value : [])];
  if (!normalized.length || normalized.some((scope) => !VALID_SCOPES.has(scope))) {
    throw new ApiError(400, 'INVALID_SCOPES', 'Wähle mindestens einen gültigen API-Bereich.');
  }
  return normalized;
}

function commandName(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,32}$/.test(normalized)) {
    throw new ApiError(400, 'INVALID_COMMAND', 'Command-Namen dürfen nur a-z, 0-9, _ und - enthalten.');
  }
  return normalized;
}

async function ownedApp(appId, ownerId) {
  const app = await db.get('SELECT * FROM bot_applications WHERE id = ? AND owner_id = ?', [appId, ownerId]);
  if (!app) throw new ApiError(404, 'BOT_APP_NOT_FOUND', 'Diese Bot-Anwendung wurde nicht gefunden.');
  return app;
}

async function appResponse(app) {
  const [guilds, commands] = await Promise.all([
    db.all(
      `SELECT bg.guild_id, g.name, bg.scopes, bg.installed_at
       FROM bot_guilds bg JOIN guilds g ON g.id = bg.guild_id
       WHERE bg.app_id = ? ORDER BY g.name`, [app.id]
    ),
    db.all(
      `SELECT id, name, description, response_template, enabled, created_at
       FROM bot_commands WHERE app_id = ? ORDER BY name`, [app.id]
    )
  ]);
  return {
    id: app.id,
    name: app.name,
    description: app.description || '',
    bot_user_id: app.bot_user_id,
    enabled: Boolean(app.enabled),
    created_at: app.created_at,
    guilds: guilds.map((guild) => ({ ...guild, scopes: parseJson(guild.scopes, []) })),
    commands: commands.map((command) => ({ ...command, enabled: Boolean(command.enabled) }))
  };
}

export async function listApps(req, res) {
  const apps = await db.all('SELECT * FROM bot_applications WHERE owner_id = ? ORDER BY created_at DESC', [req.userId]);
  return res.json({ apps: await Promise.all(apps.map(appResponse)) });
}

export async function createApp(req, res) {
  const name = text(req.body.name, 'Der Name', { min: 2, max: 48 });
  const description = text(req.body.description, 'Die Beschreibung', { max: 300 });
  const appId = crypto.randomUUID();
  const botUserId = crypto.randomUUID();
  const token = issueBotToken(appId);
  const usernameBase = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'guildorabot';
  const username = `${usernameBase}_${appId.slice(0, 6)}`;
  const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 12);
  await db.run(
      `INSERT INTO users (id, email, username, display_name, password_hash, birthdate, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [botUserId, `bot-${appId}@guildora.local`, username, name, passwordHash, '2000-01-01', true]
  );
  try {
    await db.run(
      `INSERT INTO bot_applications (id, owner_id, bot_user_id, name, description, token_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [appId, req.userId, botUserId, name, description || null, hashBotToken(token)]
    );
  } catch (error) {
    await db.run('DELETE FROM users WHERE id = ?', [botUserId]);
    throw error;
  }
  const app = await ownedApp(appId, req.userId);
  return res.status(201).json({ app: await appResponse(app), token });
}

export async function updateApp(req, res) {
  const app = await ownedApp(req.params.appId, req.userId);
  const name = req.body.name === undefined ? app.name : text(req.body.name, 'Der Name', { min: 2, max: 48 });
  const description = req.body.description === undefined ? app.description : text(req.body.description, 'Die Beschreibung', { max: 300 });
  const enabled = req.body.enabled === undefined ? Boolean(app.enabled) : Boolean(req.body.enabled);
  await db.run(
    `UPDATE bot_applications SET name = ?, description = ?, enabled = ?, updated_at = ? WHERE id = ?`,
    [name, description || null, enabled, new Date().toISOString(), app.id]
  );
  await db.run('UPDATE users SET display_name = ? WHERE id = ?', [name, app.bot_user_id]);
  return res.json({ app: await appResponse(await ownedApp(app.id, req.userId)) });
}

export async function rotateToken(req, res) {
  const app = await ownedApp(req.params.appId, req.userId);
  const token = issueBotToken(app.id);
  await db.run('UPDATE bot_applications SET token_hash = ?, updated_at = ? WHERE id = ?', [hashBotToken(token), new Date().toISOString(), app.id]);
  return res.json({ token });
}

export async function deleteApp(req, res) {
  const app = await ownedApp(req.params.appId, req.userId);
  await db.run('DELETE FROM users WHERE id = ?', [app.bot_user_id]);
  return res.status(204).end();
}

export async function installApp(req, res) {
  const app = await ownedApp(req.params.appId, req.userId);
  const guildId = text(req.body.guildId, 'Die Server-ID', { min: 1, max: 100 });
  const selectedScopes = scopes(req.body.scopes);
  await requirePermission(guildId, req.userId, 'manageServer');
  await db.run(
      `INSERT INTO bot_guilds (app_id, guild_id, added_by, scopes) VALUES (?, ?, ?, ?)
       ON CONFLICT(app_id, guild_id) DO UPDATE SET scopes = excluded.scopes, added_by = excluded.added_by`,
      [app.id, guildId, req.userId, JSON.stringify(selectedScopes)]
  );
  await db.run(
      `INSERT INTO guild_members (id, guild_id, user_id) VALUES (?, ?, ?)
       ON CONFLICT(guild_id, user_id) DO NOTHING`,
      [crypto.randomUUID(), guildId, app.bot_user_id]
  );
  return res.json({ app: await appResponse(app) });
}

export async function uninstallApp(req, res) {
  const app = await ownedApp(req.params.appId, req.userId);
  await db.run('DELETE FROM bot_guilds WHERE app_id = ? AND guild_id = ?', [app.id, req.params.guildId]);
  await db.run('DELETE FROM guild_members WHERE guild_id = ? AND user_id = ?', [req.params.guildId, app.bot_user_id]);
  return res.json({ app: await appResponse(app) });
}

export async function createCommand(req, res) {
  const app = await ownedApp(req.params.appId, req.userId);
  const name = commandName(req.body.name);
  const description = text(req.body.description, 'Die Beschreibung', { min: 2, max: 100 });
  const responseTemplate = text(req.body.responseTemplate, 'Die Antwort', { max: 2000 });
  await db.run(
    `INSERT INTO bot_commands (id, app_id, name, description, response_template) VALUES (?, ?, ?, ?, ?)`,
    [crypto.randomUUID(), app.id, name, description, responseTemplate || null]
  );
  return res.status(201).json({ app: await appResponse(app) });
}

export async function deleteCommand(req, res) {
  const app = await ownedApp(req.params.appId, req.userId);
  await db.run('DELETE FROM bot_commands WHERE id = ? AND app_id = ?', [req.params.commandId, app.id]);
  return res.json({ app: await appResponse(app) });
}

async function installedBot(appId, guildId, requiredScope) {
  const row = await db.get(
    `SELECT ba.*, bg.scopes FROM bot_applications ba
     JOIN bot_guilds bg ON bg.app_id = ba.id WHERE ba.id = ? AND bg.guild_id = ? AND ba.enabled = ?`,
    [appId, guildId, true]
  );
  if (!row || !parseJson(row.scopes, []).includes(requiredScope)) {
    throw new ApiError(403, 'BOT_SCOPE_MISSING', 'Der Bot ist nicht installiert oder der benötigte API-Bereich fehlt.');
  }
  return row;
}

export async function guildCommands(req, res) {
  await requirePermission(req.params.guildId, req.userId, 'manageServer').catch(async (error) => {
    const member = await db.get('SELECT 1 AS ok FROM guild_members WHERE guild_id = ? AND user_id = ?', [req.params.guildId, req.userId]);
    if (!member) throw error;
  });
  const commands = await db.all(
    `SELECT bc.name, bc.description, ba.name AS bot_name
     FROM bot_commands bc
     JOIN bot_applications ba ON ba.id = bc.app_id
     JOIN bot_guilds bg ON bg.app_id = ba.id
     WHERE bg.guild_id = ? AND bc.enabled = ? AND ba.enabled = ?
     ORDER BY bc.name`, [req.params.guildId, true, true]
  );
  return res.json({ commands });
}

export async function invokeCommand(req, res) {
  const name = commandName(req.params.name);
  const channel = await db.get('SELECT id, guild_id, type FROM channels WHERE id = ? AND guild_id = ?', [req.body.channelId, req.params.guildId]);
  if (!channel || channel.type !== 'text') throw new ApiError(404, 'CHANNEL_NOT_FOUND', 'Der Text-Channel wurde nicht gefunden.');
  const membership = await db.get('SELECT 1 AS ok FROM guild_members WHERE guild_id = ? AND user_id = ?', [channel.guild_id, req.userId]);
  if (!membership) throw new ApiError(403, 'FORBIDDEN', 'Du bist kein Mitglied dieses Servers.');
  const command = await db.get(
    `SELECT bc.*, ba.bot_user_id, ba.name AS bot_name
     FROM bot_commands bc JOIN bot_applications ba ON ba.id = bc.app_id
     JOIN bot_guilds bg ON bg.app_id = ba.id
     WHERE bg.guild_id = ? AND bc.name = ? AND bc.enabled = ? AND ba.enabled = ?`,
    [channel.guild_id, name, true, true]
  );
  if (!command) throw new ApiError(404, 'COMMAND_NOT_FOUND', 'Dieser Slash-Command ist nicht verfügbar.');
  await installedBot(command.app_id, channel.guild_id, 'commands');
  const args = text(req.body.arguments, 'Die Argumente', { max: 1000 });
  const eventId = crypto.randomUUID();
  await db.run(
    `INSERT INTO bot_events (id, app_id, type, guild_id, channel_id, actor_id, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [eventId, command.app_id, 'command.invoked', channel.guild_id, channel.id, req.userId, JSON.stringify({ command: name, arguments: args })]
  );
  if (command.response_template) {
    const actor = await db.get('SELECT display_name, username FROM users WHERE id = ?', [req.userId]);
    const content = command.response_template
      .replaceAll('{user}', actor.display_name || actor.username)
      .replaceAll('{args}', args);
    const message = await createBotMessage({ channelId: channel.id, authorId: command.bot_user_id, content });
    await db.run('UPDATE bot_events SET consumed_at = ? WHERE id = ?', [new Date().toISOString(), eventId]);
    return res.status(201).json({ status: 'completed', event_id: eventId, message });
  }
  return res.status(202).json({ status: 'pending', event_id: eventId });
}

export async function botIdentity(req, res) {
  return res.json({ bot: { id: req.bot.id, name: req.bot.name, description: req.bot.description, user_id: req.bot.bot_user_id } });
}

export async function botGuilds(req, res) {
  const guilds = await db.all(
    `SELECT g.id, g.name, bg.scopes FROM bot_guilds bg JOIN guilds g ON g.id = bg.guild_id
     WHERE bg.app_id = ? ORDER BY g.name`, [req.bot.id]
  );
  return res.json({ guilds: guilds.map((guild) => ({ ...guild, scopes: parseJson(guild.scopes, []) })) });
}

export async function botChannels(req, res) {
  await installedBot(req.bot.id, req.params.guildId, 'messages.write');
  const channels = await db.all('SELECT id, name, type FROM channels WHERE guild_id = ? ORDER BY position, name', [req.params.guildId]);
  return res.json({ channels });
}

export async function botSendMessage(req, res) {
  const channel = await db.get('SELECT id, guild_id, type FROM channels WHERE id = ?', [req.params.channelId]);
  if (!channel || channel.type !== 'text') throw new ApiError(404, 'CHANNEL_NOT_FOUND', 'Der Text-Channel wurde nicht gefunden.');
  await installedBot(req.bot.id, channel.guild_id, 'messages.write');
  const message = await createBotMessage({ channelId: channel.id, authorId: req.bot.bot_user_id, content: req.body.content });
  return res.status(201).json({ message });
}

export async function botEvents(req, res) {
  const installations = await db.all('SELECT guild_id, scopes FROM bot_guilds WHERE app_id = ?', [req.bot.id]);
  if (!installations.some((row) => parseJson(row.scopes, []).includes('events.read'))) {
    throw new ApiError(403, 'BOT_SCOPE_MISSING', 'Der Bereich events.read fehlt.');
  }
  const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
  const rows = await db.all(
    `SELECT id, type, guild_id, channel_id, actor_id, payload, created_at, consumed_at
     FROM bot_events WHERE app_id = ? ORDER BY created_at ASC LIMIT ?`, [req.bot.id, limit]
  );
  return res.json({ events: rows.map((row) => ({ ...row, payload: parseJson(row.payload, {}) })) });
}

export async function botInteractionCallback(req, res) {
  const event = await db.get('SELECT * FROM bot_events WHERE id = ? AND app_id = ?', [req.params.eventId, req.bot.id]);
  if (!event) throw new ApiError(404, 'EVENT_NOT_FOUND', 'Dieses Event wurde nicht gefunden.');
  if (event.consumed_at) throw new ApiError(409, 'EVENT_CONSUMED', 'Dieses Event wurde bereits beantwortet.');
  const message = await createBotMessage({ channelId: event.channel_id, authorId: req.bot.bot_user_id, content: req.body.content });
  await db.run('UPDATE bot_events SET consumed_at = ? WHERE id = ?', [new Date().toISOString(), event.id]);
  return res.status(201).json({ message });
}
