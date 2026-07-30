import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { requirePermission } from './guildAdminController.js';
import { createInviteSchema, inviteCodeSchema } from '../validation/inviteSchemas.js';
import { emitGuildRefresh } from '../realtime.js';
import { requireNotBanned } from '../utils/moderation.js';

function timestamp(value) {
  return value instanceof Date ? value.toISOString() : value;
}

function inviteState(invite) {
  const expiresAt = timestamp(invite.expires_at);
  const expired = Boolean(expiresAt && new Date(expiresAt).getTime() <= Date.now());
  const exhausted = invite.max_uses !== null && Number(invite.uses) >= Number(invite.max_uses);
  return {
    expires_at: expiresAt,
    max_uses: invite.max_uses === null ? null : Number(invite.max_uses),
    uses: Number(invite.uses || 0),
    is_expired: expired,
    is_exhausted: exhausted,
    is_active: !expired && !exhausted
  };
}

function inviteResponse(invite) {
  return {
    id: invite.id,
    code: invite.code,
    guild_id: invite.guild_id,
    creator: invite.creator_username ? {
      username: invite.creator_username,
      display_name: invite.creator_display_name
    } : null,
    created_at: timestamp(invite.created_at),
    ...inviteState(invite)
  };
}

async function inviteWithDetails(code) {
  return db.get(
    `SELECT i.*, g.name AS guild_name, g.description AS guild_description,
            g.icon_url AS guild_icon_url, u.username AS creator_username,
            u.display_name AS creator_display_name,
            (SELECT COUNT(*) FROM guild_members gm WHERE gm.guild_id = g.id) AS member_count
     FROM guild_invites i
     JOIN guilds g ON g.id = i.guild_id
     JOIN users u ON u.id = i.creator_id
     WHERE i.code = ?`,
    [code]
  );
}

async function firstTextChannel(guildId) {
  return db.get(
    `SELECT id, name FROM channels
     WHERE guild_id = ? AND type = 'text'
     ORDER BY position ASC, created_at ASC LIMIT 1`,
    [guildId]
  );
}

async function uniqueCode() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = crypto.randomBytes(9).toString('base64url');
    if (!(await db.get('SELECT id FROM guild_invites WHERE code = ?', [code]))) return code;
  }
  throw new ApiError(503, 'INVITE_CODE_UNAVAILABLE', 'Es konnte gerade kein Einladungscode erstellt werden.');
}

export async function listGuildInvites(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageServer');
  const invites = await db.all(
    `SELECT i.*, u.username AS creator_username, u.display_name AS creator_display_name
     FROM guild_invites i
     JOIN users u ON u.id = i.creator_id
     WHERE i.guild_id = ?
     ORDER BY i.created_at DESC`,
    [req.params.id]
  );
  return res.json({ invites: invites.map(inviteResponse) });
}

export async function createGuildInvite(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageServer');
  const data = createInviteSchema.parse(req.body);
  const id = crypto.randomUUID();
  const code = await uniqueCode();
  const expiresAt = data.expiresIn === null
    ? null
    : new Date(Date.now() + data.expiresIn * 1000).toISOString();

  await db.run(
    `INSERT INTO guild_invites
     (id, guild_id, creator_id, code, expires_at, max_uses)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, req.params.id, req.userId, code, expiresAt, data.maxUses]
  );
  const invite = await db.get(
    `SELECT i.*, u.username AS creator_username, u.display_name AS creator_display_name
     FROM guild_invites i
     JOIN users u ON u.id = i.creator_id
     WHERE i.id = ?`,
    [id]
  );
  return res.status(201).json({ invite: inviteResponse(invite) });
}

export async function deleteGuildInvite(req, res) {
  await requirePermission(req.params.id, req.userId, 'manageServer');
  const invite = await db.get(
    'SELECT id FROM guild_invites WHERE id = ? AND guild_id = ?',
    [req.params.inviteId, req.params.id]
  );
  if (!invite) throw new ApiError(404, 'INVITE_NOT_FOUND', 'Diese Einladung wurde nicht gefunden.');
  await db.run('DELETE FROM guild_invites WHERE id = ?', [invite.id]);
  return res.status(204).end();
}

export async function getInvitePreview(req, res) {
  const code = inviteCodeSchema.parse(req.params.code);
  const invite = await inviteWithDetails(code);
  if (!invite) throw new ApiError(404, 'INVITE_NOT_FOUND', 'Diese Einladung ist ungültig oder wurde gelöscht.');
  const state = inviteState(invite);
  return res.json({
    invite: {
      code: invite.code,
      guild: {
        id: invite.guild_id,
        name: invite.guild_name,
        description: invite.guild_description,
        icon_url: invite.guild_icon_url,
        member_count: Number(invite.member_count || 0)
      },
      ...state
    }
  });
}

export async function joinWithInvite(req, res) {
  const code = inviteCodeSchema.parse(req.params.code);
  const invite = await inviteWithDetails(code);
  if (!invite) throw new ApiError(404, 'INVITE_NOT_FOUND', 'Diese Einladung ist ungültig oder wurde gelöscht.');
  await requireNotBanned(invite.guild_id, req.userId);

  const currentMembership = await db.get(
    'SELECT id FROM guild_members WHERE guild_id = ? AND user_id = ?',
    [invite.guild_id, req.userId]
  );
  if (currentMembership) {
    return res.json({
      guild: { id: invite.guild_id, name: invite.guild_name },
      channel: await firstTextChannel(invite.guild_id),
      already_member: true
    });
  }

  const now = new Date().toISOString();
  const updated = await db.run(
    `UPDATE guild_invites
     SET uses = uses + 1
     WHERE id = ?
       AND (expires_at IS NULL OR expires_at > ?)
       AND (max_uses IS NULL OR uses < max_uses)`,
    [invite.id, now]
  );
  if (Number(updated.changes || 0) !== 1) {
    const state = inviteState(await inviteWithDetails(code));
    const message = state.is_expired
      ? 'Diese Einladung ist abgelaufen.'
      : 'Diese Einladung hat ihr Nutzungslimit erreicht.';
    throw new ApiError(410, state.is_expired ? 'INVITE_EXPIRED' : 'INVITE_EXHAUSTED', message);
  }

  try {
    await db.run(
      'INSERT INTO guild_members (id, guild_id, user_id) VALUES (?, ?, ?)',
      [crypto.randomUUID(), invite.guild_id, req.userId]
    );
  } catch (error) {
    await db.run('UPDATE guild_invites SET uses = CASE WHEN uses > 0 THEN uses - 1 ELSE 0 END WHERE id = ?', [invite.id]);
    throw error;
  }

  await emitGuildRefresh(invite.guild_id, ['members', 'list'], [req.userId]);
  return res.status(201).json({
    guild: { id: invite.guild_id, name: invite.guild_name },
    channel: await firstTextChannel(invite.guild_id),
    already_member: false
  });
}
