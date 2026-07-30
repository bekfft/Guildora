import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { createGuildSchema, discoveryQuerySchema } from '../validation/guildSchemas.js';
import { getChannelPermissions, requireChannelPermission } from '../utils/channelPermissions.js';
import { emitGuildRefresh, emitGuildRemoved, isUserOnline } from '../realtime.js';
import {
  initializeGuildReadStates,
  unreadCountForGuild,
  unreadCountsForChannels
} from '../utils/unread.js';

function bool(value) {
  return Boolean(value);
}

function guildResponse(guild) {
  return {
    id: guild.id,
    name: guild.name,
    slug: guild.slug,
    description: guild.description,
    icon_url: guild.icon_url,
    banner_url: guild.banner_url,
    owner_id: guild.owner_id,
    is_public: bool(guild.is_public),
    is_official: bool(guild.is_official),
    is_verified: bool(guild.is_verified),
    category: guild.category,
    created_at: guild.created_at,
    member_count: Number(guild.member_count || 0),
    online_count: Number(guild.online_count || 0),
    unread_count: Number(guild.unread_count || 0),
    is_member: bool(guild.is_member)
  };
}

function roleResponse(role) {
  return {
    id: role.id,
    guild_id: role.guild_id,
    name: role.name,
    color: role.color,
    position: role.position,
    is_default: bool(role.is_default),
    permissions: {
      manageServer: bool(role.manage_server),
      manageChannels: bool(role.manage_channels),
      manageRoles: bool(role.manage_roles),
      kickMembers: bool(role.kick_members),
      manageMessages: bool(role.manage_messages)
    }
  };
}

async function membership(guildId, userId) {
  return db.get('SELECT * FROM guild_members WHERE guild_id = ? AND user_id = ?', [guildId, userId]);
}

async function guildOrThrow(id) {
  const guild = await db.get('SELECT * FROM guilds WHERE id = ?', [id]);
  if (!guild) throw new ApiError(404, 'GUILD_NOT_FOUND', 'Dieser Server wurde nicht gefunden.');
  return guild;
}

async function requireMembership(guildId, userId) {
  const member = await membership(guildId, userId);
  if (!member) throw new ApiError(403, 'NOT_MEMBER', 'Du bist kein Mitglied dieses Servers.');
  return member;
}

async function firstTextChannel(guildId) {
  return db.get(
    `SELECT id, name FROM channels
     WHERE guild_id = ? AND type = 'text'
     ORDER BY position ASC, created_at ASC LIMIT 1`,
    [guildId]
  );
}

export async function getMyGuilds(req, res) {
  const guilds = await db.all(
    `SELECT g.*,
      (SELECT COUNT(*) FROM guild_members gm2 WHERE gm2.guild_id = g.id) AS member_count,
      1 AS is_member
     FROM guilds g
     JOIN guild_members gm ON gm.guild_id = g.id
     WHERE gm.user_id = ?
     ORDER BY g.is_official DESC, gm.joined_at ASC`,
    [req.userId]
  );
  const hydratedGuilds = await Promise.all(guilds.map(async (guild) => ({
    ...guild,
    unread_count: await unreadCountForGuild(guild.id, req.userId)
  })));
  return res.json({ guilds: hydratedGuilds.map(guildResponse) });
}

export async function discoverGuilds(req, res) {
  const { q, category } = discoveryQuerySchema.parse(req.query);
  const params = [req.userId];
  const conditions = ['g.is_public = ?', 'g.is_verified = ?'];
  params.push(true);
  params.push(true);

  if (q) {
    conditions.push('(LOWER(g.name) LIKE ? OR LOWER(g.description) LIKE ? OR LOWER(g.slug) LIKE ?)');
    const term = `%${q.toLowerCase()}%`;
    params.push(term, term, term);
  }
  if (category && category.toLowerCase() !== 'alle') {
    conditions.push('LOWER(g.category) = ?');
    params.push(category.toLowerCase());
  }

  const guilds = await db.all(
    `SELECT g.*,
      (SELECT COUNT(*) FROM guild_members gm2 WHERE gm2.guild_id = g.id) AS member_count,
      (SELECT COUNT(*) FROM guild_members gm3 WHERE gm3.guild_id = g.id) AS online_count,
      CASE WHEN EXISTS (
        SELECT 1 FROM guild_members mine WHERE mine.guild_id = g.id AND mine.user_id = ?
      ) THEN 1 ELSE 0 END AS is_member
     FROM guilds g
     WHERE ${conditions.join(' AND ')}
     ORDER BY g.is_official DESC, member_count DESC, g.name ASC`,
    params
  );
  return res.json({ guilds: guilds.map(guildResponse) });
}

export async function getGuild(req, res) {
  const guild = await guildOrThrow(req.params.id);
  await requireMembership(guild.id, req.userId);
  const [categories, channels, roles] = await Promise.all([
    db.all('SELECT * FROM channel_categories WHERE guild_id = ? ORDER BY position ASC, name ASC', [guild.id]),
    db.all('SELECT * FROM channels WHERE guild_id = ? ORDER BY position ASC, created_at ASC', [guild.id]),
    db.all(
      `SELECT r.*, rp.manage_server, rp.manage_channels, rp.manage_roles,
              rp.kick_members, rp.manage_messages
       FROM roles r
       LEFT JOIN role_permissions rp ON rp.role_id = r.id
       WHERE r.guild_id = ?
       ORDER BY r.position DESC, r.name ASC`,
      [guild.id]
    )
  ]);
  const channelsWithPermissions = (await Promise.all(channels.map(async (channel) => {
    const permissions = await getChannelPermissions(channel.id, req.userId);
    return permissions.viewChannel ? { ...channel, permissions } : null;
  }))).filter(Boolean);
  const readableChannelIds = channelsWithPermissions
    .filter((channel) => channel.type === 'text' && channel.permissions.readHistory)
    .map((channel) => channel.id);
  const unreadCounts = await unreadCountsForChannels(readableChannelIds, req.userId);
  const channelsWithUnread = channelsWithPermissions.map((channel) => ({
    ...channel,
    unread_count: unreadCounts.get(channel.id) || 0
  }));
  const visibleCategoryIds = new Set(channelsWithUnread.map((channel) => channel.category_id).filter(Boolean));
  const visibleCategories = channelsWithPermissions.length === channels.length
    ? categories
    : categories.filter((category) => visibleCategoryIds.has(category.id));
  return res.json({
    guild: guildResponse({ ...guild, is_member: true }),
    categories: visibleCategories,
    channels: channelsWithUnread,
    roles: roles.map(roleResponse)
  });
}

export async function getGuildMembers(req, res) {
  const guild = await guildOrThrow(req.params.id);
  await requireMembership(guild.id, req.userId);
  const members = await db.all(
    `SELECT gm.id, gm.nickname, gm.joined_at,
      u.id AS user_id, u.username, u.display_name, u.avatar_url
     FROM guild_members gm
     JOIN users u ON u.id = gm.user_id
     WHERE gm.guild_id = ?
     ORDER BY COALESCE(gm.nickname, u.display_name, u.username) ASC`,
    [guild.id]
  );
  const roleRows = await db.all(
    `SELECT mr.member_id, r.id, r.guild_id, r.name, r.color, r.position, r.is_default,
            rp.manage_server, rp.manage_channels, rp.manage_roles,
            rp.kick_members, rp.manage_messages
     FROM member_roles mr
     JOIN roles r ON r.id = mr.role_id
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     WHERE r.guild_id = ?
     ORDER BY r.position DESC`,
    [guild.id]
  );
  const rolesByMember = new Map();
  for (const role of roleRows) {
    const list = rolesByMember.get(role.member_id) || [];
    list.push(roleResponse(role));
    rolesByMember.set(role.member_id, list);
  }
  return res.json({
    members: members.map((member) => ({
      ...member,
      is_owner: member.user_id === guild.owner_id,
      roles: rolesByMember.get(member.id) || [],
      status: isUserOnline(member.user_id) ? 'online' : 'offline'
    }))
  });
}

export async function joinGuild(req, res) {
  const guild = await guildOrThrow(req.params.id);
  if (!bool(guild.is_public)) throw new ApiError(403, 'GUILD_NOT_PUBLIC', 'Dieser Server ist nicht öffentlich.');
  if (await membership(guild.id, req.userId)) {
    throw new ApiError(409, 'ALREADY_MEMBER', 'Du bist diesem Server bereits beigetreten.');
  }
  const memberId = crypto.randomUUID();
  await db.run('INSERT INTO guild_members (id, guild_id, user_id) VALUES (?, ?, ?)', [memberId, guild.id, req.userId]);
  await initializeGuildReadStates(guild.id, req.userId);
  await emitGuildRefresh(guild.id, ['members', 'list'], [req.userId]);
  return res.status(201).json({ guild: guildResponse({ ...guild, is_member: true }), channel: await firstTextChannel(guild.id) });
}

export async function leaveGuild(req, res) {
  const guild = await guildOrThrow(req.params.id);
  if (guild.owner_id === req.userId) {
    throw new ApiError(403, 'OWNER_CANNOT_LEAVE', 'Als Eigentümer kannst du den Server nicht verlassen.');
  }
  const member = await requireMembership(guild.id, req.userId);
  await db.run('DELETE FROM guild_members WHERE id = ?', [member.id]);
  emitGuildRemoved(req.userId, guild.id, 'left');
  await emitGuildRefresh(guild.id, ['members', 'list']);
  return res.status(204).end();
}

function slugify(name) {
  return name.toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 45) || 'server';
}

export async function createGuild(req, res) {
  const data = createGuildSchema.parse(req.body);
  const guildId = crypto.randomUUID();
  const slug = `${slugify(data.name)}-${guildId.slice(0, 6)}`;
  await db.run(
    `INSERT INTO guilds
     (id, name, slug, description, icon_url, owner_id, is_public, category)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [guildId, data.name, slug, '', data.iconUrl || null, req.userId, false, 'Community']
  );

  const memberId = crypto.randomUUID();
  const defaultRoleId = crypto.randomUUID();
  await db.run('INSERT INTO guild_members (id, guild_id, user_id) VALUES (?, ?, ?)', [memberId, guildId, req.userId]);
  await db.run(
    'INSERT INTO roles (id, guild_id, name, color, position, is_default) VALUES (?, ?, ?, ?, ?, ?)',
    [defaultRoleId, guildId, '@everyone', null, 0, true]
  );

  const textCategory = crypto.randomUUID();
  const voiceCategory = crypto.randomUUID();
  const textChannel = crypto.randomUUID();
  await db.run('INSERT INTO channel_categories (id, guild_id, name, position) VALUES (?, ?, ?, ?)', [textCategory, guildId, 'TEXTKANÄLE', 0]);
  await db.run('INSERT INTO channel_categories (id, guild_id, name, position) VALUES (?, ?, ?, ?)', [voiceCategory, guildId, 'SPRACHKANÄLE', 10]);
  await db.run(
    'INSERT INTO channels (id, guild_id, category_id, name, type, topic, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [textChannel, guildId, textCategory, 'allgemein', 'text', null, 0]
  );
  await db.run(
    'INSERT INTO channels (id, guild_id, category_id, name, type, topic, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [crypto.randomUUID(), guildId, voiceCategory, 'Allgemein', 'voice', null, 0]
  );
  const guild = await db.get('SELECT * FROM guilds WHERE id = ?', [guildId]);
  await emitGuildRefresh(guildId, ['guild', 'members', 'list'], [req.userId]);
  return res.status(201).json({ guild: guildResponse({ ...guild, is_member: true }), channel: { id: textChannel, name: 'allgemein' } });
}

export async function getChannel(req, res) {
  const channel = await db.get('SELECT * FROM channels WHERE id = ?', [req.params.id]);
  if (!channel) throw new ApiError(404, 'CHANNEL_NOT_FOUND', 'Dieser Channel wurde nicht gefunden.');
  const permissions = await requireChannelPermission(channel.id, req.userId, 'viewChannel');
  return res.json({ channel: { ...channel, permissions } });
}
