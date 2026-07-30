import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';

const PERMISSION_KEYS = {
  viewChannel: 'view_channel',
  readHistory: 'read_history',
  sendMessages: 'send_messages',
  attachFiles: 'attach_files',
  manageMessages: 'manage_messages'
};

function resolvePermission(rows, column, fallback) {
  const defaultRole = rows.find((row) => Boolean(row.is_default));
  let resolved = fallback;
  const defaultValue = Number(defaultRole?.[column] || 0);
  if (defaultValue === 1) resolved = true;
  if (defaultValue === -1) resolved = false;

  const assigned = rows.filter((row) => !Boolean(row.is_default));
  if (assigned.some((row) => Number(row[column]) === 1)) return true;
  if (assigned.some((row) => Number(row[column]) === -1)) return false;
  return resolved;
}

export async function getChannelPermissions(channelId, userId) {
  const access = await db.get(
    `SELECT c.id AS channel_id, c.guild_id, c.type AS channel_type, g.owner_id, gm.id AS member_id
     FROM channels c
     JOIN guilds g ON g.id = c.guild_id
     LEFT JOIN guild_members gm ON gm.guild_id = c.guild_id AND gm.user_id = ?
     WHERE c.id = ?`,
    [userId, channelId]
  );
  if (!access) throw new ApiError(404, 'CHANNEL_NOT_FOUND', 'Dieser Channel wurde nicht gefunden.');
  if (!access.member_id) throw new ApiError(403, 'NOT_MEMBER', 'Du bist kein Mitglied dieses Servers.');

  const rows = await db.all(
    `SELECT r.id AS role_id, r.is_default,
            rp.manage_server, rp.manage_messages AS global_manage_messages,
            crp.view_channel, crp.read_history, crp.send_messages,
            crp.attach_files, crp.manage_messages
     FROM roles r
     LEFT JOIN member_roles mr ON mr.role_id = r.id AND mr.member_id = ?
     LEFT JOIN role_permissions rp ON rp.role_id = r.id
     LEFT JOIN channel_role_permissions crp ON crp.channel_id = ? AND crp.role_id = r.id
     WHERE r.guild_id = ? AND (r.is_default = ? OR mr.member_id IS NOT NULL)`,
    [access.member_id, channelId, access.guild_id, true]
  );

  const bypass = access.owner_id === userId || rows.some((row) => Boolean(row.manage_server));
  if (bypass) {
    return {
      guildId: access.guild_id,
      channelType: access.channel_type,
      bypass: true,
      viewChannel: true,
      readHistory: true,
      sendMessages: true,
      attachFiles: true,
      manageMessages: true
    };
  }

  return {
    guildId: access.guild_id,
    channelType: access.channel_type,
    bypass: false,
    viewChannel: resolvePermission(rows, PERMISSION_KEYS.viewChannel, true),
    readHistory: resolvePermission(rows, PERMISSION_KEYS.readHistory, true),
    sendMessages: resolvePermission(rows, PERMISSION_KEYS.sendMessages, true),
    attachFiles: resolvePermission(rows, PERMISSION_KEYS.attachFiles, false),
    manageMessages: resolvePermission(
      rows,
      PERMISSION_KEYS.manageMessages,
      rows.some((row) => Boolean(row.global_manage_messages))
    )
  };
}

export async function requireChannelPermission(channelId, userId, permission) {
  const permissions = await getChannelPermissions(channelId, userId);
  if (!permissions[permission]) {
    const messages = {
      viewChannel: 'Du darfst diesen Channel nicht sehen.',
      readHistory: 'Du darfst den Nachrichtenverlauf dieses Channels nicht lesen.',
      sendMessages: 'Du darfst in diesem Channel keine Nachrichten senden.',
      attachFiles: 'Du darfst in diesem Channel keine Dateien hochladen.',
      manageMessages: 'Du darfst Nachrichten in diesem Channel nicht moderieren.'
    };
    throw new ApiError(403, 'CHANNEL_PERMISSION_DENIED', messages[permission] || 'Diese Aktion ist in diesem Channel nicht erlaubt.');
  }
  return permissions;
}
