import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';

export const STAFF_ROLES = ['support', 'moderation', 'administration', 'management'];
const permissions = {
  support: ['staff.access', 'cases.view', 'cases.note', 'users.view', 'appeals.view'],
  moderation: ['staff.access', 'cases.view', 'cases.note', 'cases.manage', 'users.view', 'users.warn', 'users.restrict', 'content.remove', 'appeals.view'],
  administration: ['staff.access', 'cases.view', 'cases.note', 'cases.manage', 'users.view', 'users.warn', 'users.restrict', 'users.suspend', 'guilds.manage', 'appeals.view', 'appeals.manage', 'audit.view'],
  management: ['*']
};

export async function ensurePlatformOwner() {
  const owner = await db.get(`SELECT u.id, ps.role, ps.is_owner FROM users u
    LEFT JOIN platform_staff ps ON ps.user_id = u.id WHERE LOWER(u.username) = ?`, ['bekfft']);
  if (!owner) return null;
  if (owner.role === 'management' && Boolean(owner.is_owner)) return owner.id;
  await db.run(
    `INSERT INTO platform_staff (user_id, role, is_owner) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET role = ?, is_owner = ?, updated_at = ?`,
    [owner.id, 'management', true, 'management', true, new Date().toISOString()]
  );
  return owner.id;
}

export async function getStaff(userId) {
  const identity = await db.get('SELECT username FROM users WHERE id = ?', [userId]);
  if (identity?.username?.toLowerCase() === 'bekfft') await ensurePlatformOwner();
  const row = await db.get(
    `SELECT ps.*, u.username, u.display_name, u.avatar_url,
       COALESCE(us.two_factor_enabled, 0) AS two_factor_enabled
     FROM platform_staff ps JOIN users u ON u.id = ps.user_id
     LEFT JOIN user_security us ON us.user_id = ps.user_id WHERE ps.user_id = ?`,
    [userId]
  );
  if (!row) return null;
  return { ...row, is_owner: Boolean(row.is_owner), two_factor_enabled: Boolean(row.two_factor_enabled), permissions: permissions[row.role] || [] };
}

export function hasStaffPermission(staff, permission) {
  return Boolean(staff && (staff.permissions.includes('*') || staff.permissions.includes(permission)));
}

export function requireStaff(permission, { allowWithout2fa = false } = {}) {
  return async (req, res, next) => {
    try {
      const staff = await getStaff(req.userId);
      if (!hasStaffPermission(staff, permission)) throw new ApiError(403, 'STAFF_FORBIDDEN', 'Du hast keinen Zugriff auf diesen Staff-Bereich.');
      if (!allowWithout2fa && !staff.two_factor_enabled) {
        throw new ApiError(403, 'STAFF_2FA_REQUIRED', 'Aktiviere zuerst die Zwei-Faktor-Authentifizierung für deinen Staff-Account.');
      }
      req.staff = staff;
      next();
    } catch (error) { next(error); }
  };
}

export async function isProtectedOwner(userId) {
  await ensurePlatformOwner();
  const row = await db.get('SELECT is_owner FROM platform_staff WHERE user_id = ?', [userId]);
  return Boolean(row?.is_owner);
}

export async function assertNotProtectedOwner(userId) {
  if (await isProtectedOwner(userId)) {
    throw new ApiError(403, 'OWNER_PROTECTED', 'Der Guildora-Inhaber bekfft ist systemweit geschützt und kann nicht moderiert oder verändert werden.');
  }
}

export async function auditStaff(actorId, action, targetType, targetId = null, details = null, caseId = null) {
  await db.run(
    'INSERT INTO staff_audit_logs (id, actor_id, action, target_type, target_id, case_id, details) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [crypto.randomUUID(), actorId, action, targetType, targetId, caseId, details ? JSON.stringify(details) : null]
  );
}

export async function createPlatformCase({ sourceType, sourceId, reporterId, targetUserId, guildId, category = 'other', reason, evidence = null }) {
  const id = crypto.randomUUID();
  await db.run(
    `INSERT INTO platform_cases (id, source_type, source_id, reporter_id, target_user_id, guild_id, category, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, sourceType, sourceId || null, reporterId || null, targetUserId || null, guildId || null, category, reason]
  );
  if (evidence) await db.run('INSERT INTO platform_case_evidence (id, case_id, type, snapshot) VALUES (?, ?, ?, ?)', [crypto.randomUUID(), id, sourceType, JSON.stringify(evidence)]);
  return id;
}

export async function activeSanctions(userId) {
  return db.all(
    `SELECT * FROM global_sanctions WHERE user_id = ? AND revoked_at IS NULL
     AND (expires_at IS NULL OR expires_at > ?) ORDER BY created_at DESC`,
    [userId, new Date().toISOString()]
  );
}

export async function assertAccountActive(userId) {
  const sanctions = await activeSanctions(userId);
  const blocked = sanctions.find((item) => item.type === 'ban' || item.type === 'suspension');
  if (blocked) throw new ApiError(403, blocked.type === 'ban' ? 'ACCOUNT_BANNED' : 'ACCOUNT_SUSPENDED', blocked.type === 'ban' ? 'Dieser Account wurde von Guildora gesperrt.' : 'Dieser Account ist vorübergehend suspendiert.');
}

export async function assertCapability(userId, capability) {
  const sanctions = await activeSanctions(userId);
  const blocks = {
    social: ['restrict_social'], dm: ['restrict_social', 'restrict_dms'],
    guild_create: ['restrict_guild_creation'], communicate: ['restrict_communication']
  };
  if (sanctions.some((item) => (blocks[capability] || []).includes(item.type))) {
    throw new ApiError(403, 'PLATFORM_RESTRICTED', 'Diese Funktion wurde für deinen Account vorübergehend eingeschränkt.');
  }
}

export async function activeGuildRestriction(guildId) {
  return db.get(
    `SELECT * FROM guild_platform_restrictions WHERE guild_id = ? AND revoked_at IS NULL
     AND (expires_at IS NULL OR expires_at > ?) ORDER BY CASE type WHEN 'suspended' THEN 3 WHEN 'restricted' THEN 2 ELSE 1 END DESC LIMIT 1`,
    [guildId, new Date().toISOString()]
  );
}
