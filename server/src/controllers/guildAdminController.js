import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
  categorySchema,
  channelSchema,
  guildProfileSchema,
  memberNicknameSchema,
  memberRolesSchema,
  roleSchema
} from '../validation/guildAdminSchemas.js';
import { channelRolePermissionSchema } from '../validation/channelPermissionSchemas.js';
import { emitGuildRefresh, emitGuildRemoved } from '../realtime.js';

async function guildOrThrow(guildId) {
  const guild = await db.get('SELECT * FROM guilds WHERE id = ?', [guildId]);
  if (!guild) throw new ApiError(404, 'GUILD_NOT_FOUND', 'Dieser Server wurde nicht gefunden.');
  return guild;
}

const PERMISSION_COLUMNS = {
  manageServer: 'manage_server',
  manageChannels: 'manage_channels',
  manageRoles: 'manage_roles',
  kickMembers: 'kick_members',
  manageMessages: 'manage_messages'
};

export async function requirePermission(guildId, userId, permission) {
  const guild = await guildOrThrow(guildId);
  if (guild.owner_id === userId) return guild;
  const column = PERMISSION_COLUMNS[permission];
  const granted = await db.get(
    `SELECT 1 AS granted
     FROM guild_members gm
     JOIN roles r ON r.guild_id = gm.guild_id
     LEFT JOIN member_roles mr ON mr.member_id = gm.id AND mr.role_id = r.id
     JOIN role_permissions rp ON rp.role_id = r.id
     WHERE gm.guild_id = ? AND gm.user_id = ? AND rp.${column} = ?
       AND (r.is_default = ? OR mr.member_id IS NOT NULL)
     LIMIT 1`,
    [guildId, userId, true, true]
  );
  if (!granted) {
    throw new ApiError(403, 'MISSING_PERMISSION', 'Dir fehlt die erforderliche Serverberechtigung.');
  }
  return guild;
}

async function categoryInGuild(categoryId, guildId) {
  if (!categoryId) return null;
  const category = await db.get('SELECT * FROM channel_categories WHERE id = ? AND guild_id = ?', [categoryId, guildId]);
  if (!category) throw new ApiError(400, 'INVALID_CATEGORY', 'Diese Kategorie gehört nicht zum Server.');
  return category;
}

async function channelInGuild(channelId, guildId) {
  const channel = await db.get('SELECT * FROM channels WHERE id = ? AND guild_id = ?', [channelId, guildId]);
  if (!channel) throw new ApiError(404, 'CHANNEL_NOT_FOUND', 'Dieser Channel wurde nicht gefunden.');
  return channel;
}

async function roleInGuild(roleId, guildId) {
  const role = await db.get('SELECT * FROM roles WHERE id = ? AND guild_id = ?', [roleId, guildId]);
  if (!role) throw new ApiError(404, 'ROLE_NOT_FOUND', 'Diese Rolle wurde nicht gefunden.');
  return role;
}

async function memberInGuild(memberId, guildId) {
  const member = await db.get('SELECT * FROM guild_members WHERE id = ? AND guild_id = ?', [memberId, guildId]);
  if (!member) throw new ApiError(404, 'MEMBER_NOT_FOUND', 'Dieses Mitglied wurde nicht gefunden.');
  return member;
}

function normalizeChannelName(value) {
  return value.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9äöüß_-]/g, '').replace(/-+/g, '-');
}

function roleResponse(role, permissions) {
  return { ...role, is_default: Boolean(role.is_default), permissions };
}

async function saveRolePermissions(roleId, permissions) {
  await db.run(
    `INSERT INTO role_permissions
     (role_id, manage_server, manage_channels, manage_roles, kick_members, manage_messages)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(role_id) DO UPDATE SET
       manage_server = excluded.manage_server,
       manage_channels = excluded.manage_channels,
       manage_roles = excluded.manage_roles,
       kick_members = excluded.kick_members,
       manage_messages = excluded.manage_messages`,
    [
      roleId,
      permissions.manageServer,
      permissions.manageChannels,
      permissions.manageRoles,
      permissions.kickMembers,
      permissions.manageMessages
    ]
  );
}

async function refreshGuild(guildId, scopes = ['guild', 'members', 'list']) {
  await emitGuildRefresh(guildId, scopes);
}

export async function updateGuildProfile(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageServer');
  const data = guildProfileSchema.parse(req.body);
  await db.run(
    'UPDATE guilds SET name = ?, description = ?, category = ? WHERE id = ?',
    [data.name, data.description, data.category, req.params.id]
  );
  await refreshGuild(req.params.id, ['guild', 'list']);
  return res.json({ guild: await db.get('SELECT * FROM guilds WHERE id = ?', [req.params.id]) });
}

export async function createCategory(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageChannels');
  const data = categorySchema.parse(req.body);
  const id = crypto.randomUUID();
  const highest = await db.get('SELECT MAX(position) AS position FROM channel_categories WHERE guild_id = ?', [req.params.id]);
  const position = data.position ?? Number(highest?.position ?? -1) + 1;
  await db.run(
    'INSERT INTO channel_categories (id, guild_id, name, position) VALUES (?, ?, ?, ?)',
    [id, req.params.id, data.name.toUpperCase(), position]
  );
  await refreshGuild(req.params.id, ['guild']);
  return res.status(201).json({ category: await db.get('SELECT * FROM channel_categories WHERE id = ?', [id]) });
}

export async function updateCategory(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageChannels');
  const stored = await categoryInGuild(req.params.categoryId, req.params.id);
  const data = categorySchema.parse(req.body);
  await db.run(
    'UPDATE channel_categories SET name = ?, position = ? WHERE id = ?',
    [data.name.toUpperCase(), data.position ?? stored.position, stored.id]
  );
  await refreshGuild(req.params.id, ['guild']);
  return res.json({ category: await db.get('SELECT * FROM channel_categories WHERE id = ?', [stored.id]) });
}

export async function deleteCategory(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageChannels');
  const stored = await categoryInGuild(req.params.categoryId, req.params.id);
  await db.run('DELETE FROM channel_categories WHERE id = ?', [stored.id]);
  await refreshGuild(req.params.id, ['guild']);
  return res.status(204).end();
}

export async function createChannel(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageChannels');
  const data = channelSchema.parse(req.body);
  await categoryInGuild(data.categoryId, req.params.id);
  const normalizedName = normalizeChannelName(data.name);
  if (!normalizedName) throw new ApiError(400, 'INVALID_CHANNEL_NAME', 'Der Channelname enthält keine gültigen Zeichen.', 'name');
  const id = crypto.randomUUID();
  const highest = await db.get('SELECT MAX(position) AS position FROM channels WHERE guild_id = ?', [req.params.id]);
  const position = data.position ?? Number(highest?.position ?? -1) + 1;
  await db.run(
    `INSERT INTO channels (id, guild_id, category_id, name, type, topic, position)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, req.params.id, data.categoryId, normalizedName, data.type, data.topic || null, position]
  );
  await refreshGuild(req.params.id, ['guild']);
  return res.status(201).json({ channel: await db.get('SELECT * FROM channels WHERE id = ?', [id]) });
}

export async function updateChannel(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageChannels');
  const stored = await channelInGuild(req.params.channelId, req.params.id);
  const data = channelSchema.parse(req.body);
  await categoryInGuild(data.categoryId, req.params.id);
  const normalizedName = normalizeChannelName(data.name);
  if (!normalizedName) throw new ApiError(400, 'INVALID_CHANNEL_NAME', 'Der Channelname enthält keine gültigen Zeichen.', 'name');
  await db.run(
    `UPDATE channels
     SET name = ?, type = ?, category_id = ?, topic = ?, position = ?
     WHERE id = ?`,
    [normalizedName, data.type, data.categoryId, data.topic || null, data.position ?? stored.position, stored.id]
  );
  await refreshGuild(req.params.id, ['guild']);
  return res.json({ channel: await db.get('SELECT * FROM channels WHERE id = ?', [stored.id]) });
}

export async function deleteChannel(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageChannels');
  const stored = await channelInGuild(req.params.channelId, req.params.id);
  if (stored.type === 'text') {
    const count = await db.get("SELECT COUNT(*) AS count FROM channels WHERE guild_id = ? AND type = 'text'", [req.params.id]);
    if (Number(count.count) <= 1) {
      throw new ApiError(409, 'LAST_TEXT_CHANNEL', 'Der letzte Text-Channel kann nicht gelöscht werden.');
    }
  }
  await db.run('DELETE FROM channels WHERE id = ?', [stored.id]);
  await refreshGuild(req.params.id, ['guild']);
  return res.status(204).end();
}

function channelPermissionResponse(row) {
  return {
    roleId: row.role_id,
    viewChannel: Number(row.view_channel || 0),
    readHistory: Number(row.read_history || 0),
    sendMessages: Number(row.send_messages || 0),
    attachFiles: Number(row.attach_files || 0),
    manageMessages: Number(row.manage_messages || 0)
  };
}

export async function getChannelRolePermissions(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageChannels');
  await channelInGuild(req.params.channelId, req.params.id);
  const rows = await db.all(
    `SELECT * FROM channel_role_permissions
     WHERE channel_id = ?`,
    [req.params.channelId]
  );
  return res.json({ permissions: rows.map(channelPermissionResponse) });
}

export async function updateChannelRolePermissions(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageChannels');
  await channelInGuild(req.params.channelId, req.params.id);
  await roleInGuild(req.params.roleId, req.params.id);
  const data = channelRolePermissionSchema.parse(req.body);
  await db.run(
    `INSERT INTO channel_role_permissions
     (channel_id, role_id, view_channel, read_history, send_messages, attach_files, manage_messages)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(channel_id, role_id) DO UPDATE SET
       view_channel = excluded.view_channel,
       read_history = excluded.read_history,
       send_messages = excluded.send_messages,
       attach_files = excluded.attach_files,
       manage_messages = excluded.manage_messages`,
    [
      req.params.channelId,
      req.params.roleId,
      data.viewChannel,
      data.readHistory,
      data.sendMessages,
      data.attachFiles,
      data.manageMessages
    ]
  );
  await refreshGuild(req.params.id, ['guild']);
  return res.json({ permission: { roleId: req.params.roleId, ...data } });
}

export async function deleteChannelRolePermissions(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageChannels');
  await channelInGuild(req.params.channelId, req.params.id);
  await roleInGuild(req.params.roleId, req.params.id);
  await db.run(
    'DELETE FROM channel_role_permissions WHERE channel_id = ? AND role_id = ?',
    [req.params.channelId, req.params.roleId]
  );
  await refreshGuild(req.params.id, ['guild']);
  return res.status(204).end();
}

export async function createRole(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageRoles');
  const data = roleSchema.parse(req.body);
  const id = crypto.randomUUID();
  const highest = await db.get('SELECT MAX(position) AS position FROM roles WHERE guild_id = ?', [req.params.id]);
  const position = data.position ?? Number(highest?.position ?? 0) + 1;
  await db.run(
    `INSERT INTO roles (id, guild_id, name, color, position, is_default)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, req.params.id, data.name, data.color, position, false]
  );
  await saveRolePermissions(id, data.permissions);
  await refreshGuild(req.params.id, ['guild', 'members']);
  return res.status(201).json({ role: roleResponse(await db.get('SELECT * FROM roles WHERE id = ?', [id]), data.permissions) });
}

export async function updateRole(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageRoles');
  const stored = await roleInGuild(req.params.roleId, req.params.id);
  const data = roleSchema.parse(req.body);
  await db.run(
    'UPDATE roles SET name = ?, color = ?, position = ? WHERE id = ?',
    [
      Boolean(stored.is_default) ? stored.name : data.name,
      Boolean(stored.is_default) ? stored.color : data.color,
      Boolean(stored.is_default) ? stored.position : (data.position ?? stored.position),
      stored.id
    ]
  );
  await saveRolePermissions(stored.id, data.permissions);
  await refreshGuild(req.params.id, ['guild', 'members']);
  return res.json({ role: roleResponse(await db.get('SELECT * FROM roles WHERE id = ?', [stored.id]), data.permissions) });
}

export async function deleteRole(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageRoles');
  const stored = await roleInGuild(req.params.roleId, req.params.id);
  if (Boolean(stored.is_default)) {
    throw new ApiError(409, 'DEFAULT_ROLE', 'Die Standardrolle kann nicht gelöscht werden.');
  }
  await db.run('DELETE FROM roles WHERE id = ?', [stored.id]);
  await refreshGuild(req.params.id, ['guild', 'members']);
  return res.status(204).end();
}

export async function updateMemberRoles(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageRoles');
  const member = await memberInGuild(req.params.memberId, req.params.id);
  const data = memberRolesSchema.parse(req.body);
  if (data.roleIds.length) {
    const placeholders = data.roleIds.map(() => '?').join(', ');
    const roles = await db.all(
      `SELECT id, is_default FROM roles WHERE guild_id = ? AND id IN (${placeholders})`,
      [req.params.id, ...data.roleIds]
    );
    if (roles.length !== new Set(data.roleIds).size) {
      throw new ApiError(400, 'INVALID_ROLES', 'Mindestens eine Rolle gehört nicht zu diesem Server.');
    }
    if (roles.some((role) => Boolean(role.is_default))) {
      throw new ApiError(400, 'DEFAULT_ROLE_IMPLICIT', '@everyone gilt automatisch und kann nicht zugewiesen werden.');
    }
  }
  const roleIds = [...new Set(data.roleIds)];
  await db.run('DELETE FROM member_roles WHERE member_id = ?', [member.id]);
  for (const roleId of roleIds) {
    await db.run('INSERT INTO member_roles (member_id, role_id) VALUES (?, ?)', [member.id, roleId]);
  }
  await refreshGuild(req.params.id, ['guild', 'members']);
  return res.json({ role_ids: roleIds });
}

export async function updateMemberNickname(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageServer');
  const member = await memberInGuild(req.params.memberId, req.params.id);
  const data = memberNicknameSchema.parse(req.body);
  await db.run('UPDATE guild_members SET nickname = ? WHERE id = ?', [data.nickname || null, member.id]);
  await refreshGuild(req.params.id, ['members']);
  return res.json({ member: { ...member, nickname: data.nickname || null } });
}

export async function kickMember(req, res) {
  const guild = await requirePermission(req.params.id, req.userId, 'kickMembers');
  const member = await memberInGuild(req.params.memberId, req.params.id);
  if (member.user_id === guild.owner_id) {
    throw new ApiError(409, 'OWNER_CANNOT_BE_KICKED', 'Der Serverbesitzer kann nicht entfernt werden.');
  }
  await db.run('DELETE FROM guild_members WHERE id = ?', [member.id]);
  emitGuildRemoved(member.user_id, req.params.id, 'kicked');
  await refreshGuild(req.params.id, ['members', 'list']);
  return res.status(204).end();
}
