import crypto from 'node:crypto';
import { assertNotProtectedOwner, createPlatformCase } from '../services/platformModeration.js';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import { emitGuildRefresh, emitToUsers, isUserOnline } from '../realtime.js';
import {
  badgePreferencesSchema,
  profileReportSchema,
  profileUpdateSchema
} from '../validation/socialSchemas.js';

const PROFILE_USER_FIELDS = `u.id, u.username, u.display_name, u.avatar_url, u.created_at,
  p.banner_url, COALESCE(p.bio, '') AS bio, COALESCE(p.custom_status, '') AS custom_status`;
const DEFAULT_USER_AVATAR = '/icons/guildora-192.png';

function relationshipState(row, userId) {
  if (!row) return null;
  if (row.status === 'blocked') return row.requester_id === userId ? 'blocked' : 'blocked_by_other';
  if (row.status === 'accepted') return 'accepted';
  return row.requester_id === userId ? 'outgoing' : 'incoming';
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

async function badgesForUser(userId, includeHidden) {
  const rows = await db.all(
    `SELECT b.id, b.slug, b.name, b.description, b.icon, b.color_start, b.color_end,
            ub.awarded_at, ub.display_order,
            CASE WHEN hidden.badge_id IS NULL THEN 1 ELSE 0 END AS is_visible
     FROM user_badges ub
     JOIN profile_badges b ON b.id = ub.badge_id
     LEFT JOIN hidden_user_badges hidden
       ON hidden.user_id = ub.user_id AND hidden.badge_id = ub.badge_id
     WHERE ub.user_id = ? ${includeHidden ? '' : 'AND hidden.badge_id IS NULL'}
     ORDER BY ub.display_order ASC, b.sort_order ASC`,
    [userId]
  );
  return rows.map((badge) => ({ ...badge, is_visible: Boolean(badge.is_visible) }));
}

async function mutualGuilds(viewerId, targetId) {
  if (viewerId === targetId) return [];
  return db.all(
    `SELECT DISTINCT g.id, g.name, g.icon_url, g.is_official, g.is_verified
     FROM guild_members mine
     JOIN guild_members theirs ON theirs.guild_id = mine.guild_id
     JOIN guilds g ON g.id = mine.guild_id
     WHERE mine.user_id = ? AND theirs.user_id = ?
     ORDER BY g.is_official DESC, g.name ASC
     LIMIT 20`,
    [viewerId, targetId]
  );
}

async function mutualFriends(viewerId, targetId) {
  if (viewerId === targetId) return [];
  return db.all(
    `SELECT u.id, u.username, u.display_name, u.avatar_url
     FROM users u
     WHERE u.id IN (
       SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END
       FROM friendships
       WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)
     )
     AND u.id IN (
       SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END
       FROM friendships
       WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)
     )
     ORDER BY COALESCE(u.display_name, u.username) ASC
     LIMIT 20`,
    [viewerId, viewerId, viewerId, targetId, targetId, targetId]
  );
}

async function serverProfile(guildId, viewerId, targetId) {
  if (!guildId) return null;
  const viewer = await db.get(
    'SELECT id FROM guild_members WHERE guild_id = ? AND user_id = ?',
    [guildId, viewerId]
  );
  if (!viewer) return null;
  const member = await db.get(
    'SELECT id, nickname, joined_at FROM guild_members WHERE guild_id = ? AND user_id = ?',
    [guildId, targetId]
  );
  if (!member) return null;
  const roles = await db.all(
    `SELECT r.id, r.name, r.color, r.position, r.is_default
     FROM member_roles mr
     JOIN roles r ON r.id = mr.role_id
     WHERE mr.member_id = ?
     ORDER BY r.position DESC`,
    [member.id]
  );
  return { guild_id: guildId, ...member, roles };
}

async function profileAssetUrl(userId, attachmentId, fieldName) {
  if (attachmentId === undefined) return undefined;
  if (attachmentId === null) return DEFAULT_USER_AVATAR;
  const attachment = await db.get(
    `SELECT id, mime_type FROM attachments
     WHERE id = ? AND owner_id = ? AND message_id IS NULL AND dm_message_id IS NULL`,
    [attachmentId, userId]
  );
  if (!attachment || !attachment.mime_type.startsWith('image/')) {
    throw new ApiError(400, 'INVALID_PROFILE_IMAGE', `${fieldName} muss ein eigener Bild-Upload sein.`);
  }
  return `/api/uploads/${attachment.id}`;
}

async function refreshProfileEverywhere(userId) {
  const memberships = await db.all('SELECT guild_id FROM guild_members WHERE user_id = ?', [userId]);
  const friendships = await db.all(
    `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS user_id
     FROM friendships
     WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)`,
    [userId, userId, userId]
  );
  const dmContacts = await db.all(
    `SELECT DISTINCT other.user_id
     FROM dm_members mine
     JOIN dm_members other ON other.conversation_id = mine.conversation_id
     WHERE mine.user_id = ? AND other.user_id <> ?`,
    [userId, userId]
  );
  await Promise.all(memberships.map((membership) => emitGuildRefresh(membership.guild_id, ['members'])));
  emitToUsers(
    [userId, ...friendships.map((friend) => friend.user_id), ...dmContacts.map((contact) => contact.user_id)],
    'social:refresh',
    { profile: true, userId }
  );
}

export async function getUserProfile(req, res) {
  const user = await db.get(
    `SELECT ${PROFILE_USER_FIELDS}
     FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = ?`,
    [req.params.userId]
  );
  if (!user) throw new ApiError(404, 'USER_NOT_FOUND', 'Dieser Nutzer wurde nicht gefunden.');
  const isSelf = user.id === req.userId;
  const relationship = isSelf ? null : await relationshipBetween(req.userId, user.id);
  const guildId = typeof req.query.guildId === 'string' ? req.query.guildId : null;
  const [badges, sharedGuilds, sharedFriends, currentServer] = await Promise.all([
    badgesForUser(user.id, isSelf),
    mutualGuilds(req.userId, user.id),
    mutualFriends(req.userId, user.id),
    serverProfile(guildId, req.userId, user.id)
  ]);
  return res.json({
    profile: {
      ...user,
      status: isUserOnline(user.id) ? 'online' : 'offline',
      is_self: isSelf,
      relationship: relationship ? {
        id: relationship.id,
        state: relationshipState(relationship, req.userId)
      } : null,
      badges,
      mutual_guilds: sharedGuilds,
      mutual_friends: sharedFriends,
      server_profile: currentServer
    }
  });
}

export async function updateMyProfile(req, res) {
  const data = profileUpdateSchema.parse(req.body);
  const current = await db.get(
    `SELECT ${PROFILE_USER_FIELDS}
     FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = ?`,
    [req.userId]
  );
  if (!current) throw new ApiError(404, 'USER_NOT_FOUND', 'Dein Profil wurde nicht gefunden.');
  const [avatarUrl, bannerUrl] = await Promise.all([
    profileAssetUrl(req.userId, data.avatarAttachmentId, 'Der Avatar'),
    profileAssetUrl(req.userId, data.bannerAttachmentId, 'Das Banner')
  ]);
  const next = {
    displayName: data.displayName ?? current.display_name,
    bio: data.bio ?? current.bio,
    customStatus: data.customStatus ?? current.custom_status,
    avatarUrl: avatarUrl === undefined ? current.avatar_url : avatarUrl,
    bannerUrl: bannerUrl === undefined ? current.banner_url : bannerUrl
  };
  await db.run(
    'UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?',
    [next.displayName, next.avatarUrl, req.userId]
  );
  await db.run(
    `INSERT INTO user_profiles (user_id, banner_url, bio, custom_status, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       banner_url = excluded.banner_url,
       bio = excluded.bio,
       custom_status = excluded.custom_status,
       updated_at = excluded.updated_at`,
    [req.userId, next.bannerUrl, next.bio, next.customStatus, new Date().toISOString()]
  );
  await refreshProfileEverywhere(req.userId);
  req.params = { userId: req.userId };
  req.query = {};
  return getUserProfile(req, res);
}

export async function updateMyBadgePreferences(req, res) {
  const { badges } = badgePreferencesSchema.parse(req.body);
  const owned = await db.all('SELECT badge_id FROM user_badges WHERE user_id = ?', [req.userId]);
  const ownedIds = new Set(owned.map((badge) => badge.badge_id));
  const suppliedIds = new Set(badges.map((badge) => badge.id));
  if (
    suppliedIds.size !== badges.length
    || suppliedIds.size !== ownedIds.size
    || badges.some((badge) => !ownedIds.has(badge.id))
  ) {
    throw new ApiError(400, 'INVALID_BADGES', 'Mindestens ein Badge gehört nicht zu deinem Profil.');
  }
  await db.exec('BEGIN');
  try {
    await db.run('DELETE FROM hidden_user_badges WHERE user_id = ?', [req.userId]);
    for (const [index, badge] of badges.entries()) {
      await db.run(
        'UPDATE user_badges SET display_order = ? WHERE user_id = ? AND badge_id = ?',
        [(index + 1) * 10, req.userId, badge.id]
      );
      if (!badge.visible) {
        await db.run(
          'INSERT INTO hidden_user_badges (user_id, badge_id) VALUES (?, ?)',
          [req.userId, badge.id]
        );
      }
    }
    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }
  await refreshProfileEverywhere(req.userId);
  return res.json({ badges: await badgesForUser(req.userId, true) });
}

export async function reportUserProfile(req, res) {
  const { reason } = profileReportSchema.parse(req.body);
  const target = await db.get('SELECT id FROM users WHERE id = ?', [req.params.userId]);
  if (!target || target.id === req.userId) {
    throw new ApiError(404, 'USER_NOT_FOUND', 'Dieser Nutzer wurde nicht gefunden.');
  }
  const id = crypto.randomUUID();
  await assertNotProtectedOwner(target.id);
  await db.run(
    `INSERT INTO user_profile_reports (id, reporter_id, reported_user_id, reason)
     VALUES (?, ?, ?, ?)`,
    [id, req.userId, target.id, reason]
  );
  const profile = await db.get('SELECT display_name, avatar_url FROM users WHERE id = ?', [target.id]);
  await createPlatformCase({ sourceType: 'profile_report', sourceId: id, reporterId: req.userId, targetUserId: target.id, category: 'profile_report', reason, evidence: profile });
  return res.status(201).json({ report: { id, status: 'open' } });
}
