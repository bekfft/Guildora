import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
  accountUpdateSchema,
  passwordConfirmationSchema,
  passwordUpdateSchema,
  settingsSchema,
  totpConfirmSchema,
  totpDisableSchema
} from '../validation/accountSchemas.js';
import { clearAuthCookies, setAuthCookies } from '../utils/tokens.js';
import { decryptSecret, encryptSecret, generateTotpSecret, verifyTotp } from '../utils/totp.js';

const BOOLEAN_FIELDS = new Set([
  'desktop_notifications', 'notification_sounds', 'notify_mentions',
  'notify_direct_messages', 'notify_friend_requests', 'reduce_motion',
  'high_contrast', 'screen_reader', 'captions', 'spellcheck',
  'voice_noise_suppression', 'voice_echo_cancellation', 'voice_auto_gain'
]);

async function ensureSettings(userId) {
  await db.run('INSERT INTO user_settings (user_id) VALUES (?) ON CONFLICT (user_id) DO NOTHING', [userId]);
  return db.get('SELECT * FROM user_settings WHERE user_id = ?', [userId]);
}

function publicSettings(row) {
  return Object.fromEntries(Object.entries(row)
    .filter(([key]) => key !== 'user_id' && key !== 'updated_at')
    .map(([key, value]) => [key, BOOLEAN_FIELDS.has(key) ? Boolean(value) : value]));
}

async function verifiedUser(userId, currentPassword) {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
  if (!user || !(await bcrypt.compare(currentPassword, user.password_hash))) {
    throw new ApiError(403, 'PASSWORD_INVALID', 'Dein aktuelles Passwort ist falsch.', 'currentPassword');
  }
  return user;
}

function duplicateError(error) {
  const message = `${error?.message || ''} ${error?.detail || ''}`.toLowerCase();
  if (!message.includes('unique')) return error;
  if (message.includes('email')) return new ApiError(409, 'EMAIL_TAKEN', 'Diese E-Mail-Adresse wird bereits verwendet.', 'email');
  return new ApiError(409, 'USERNAME_TAKEN', 'Dieser Benutzername ist bereits vergeben.', 'username');
}

export async function getSettings(req, res) {
  return res.json({ settings: publicSettings(await ensureSettings(req.userId)) });
}

export async function updateSettings(req, res) {
  const data = settingsSchema.parse(req.body);
  await ensureSettings(req.userId);
  const entries = Object.entries(data);
  if (entries.length) {
    await db.run(
      `UPDATE user_settings SET ${entries.map(([key]) => `${key} = ?`).join(', ')}, updated_at = ? WHERE user_id = ?`,
      [...entries.map(([, value]) => value), new Date().toISOString(), req.userId]
    );
  }
  return res.json({ settings: publicSettings(await ensureSettings(req.userId)) });
}

export async function updateAccount(req, res) {
  const data = accountUpdateSchema.parse(req.body);
  await verifiedUser(req.userId, data.currentPassword);
  const entries = Object.entries(data).filter(([key]) => key !== 'currentPassword');
  try {
    await db.run(
      `UPDATE users SET ${entries.map(([key]) => `${key} = ?`).join(', ')} WHERE id = ?`,
      [...entries.map(([, value]) => value), req.userId]
    );
  } catch (error) {
    throw duplicateError(error);
  }
  return res.json({ updated: true });
}

export async function updatePassword(req, res) {
  const data = passwordUpdateSchema.parse(req.body);
  await verifiedUser(req.userId, data.currentPassword);
  const passwordHash = await bcrypt.hash(data.newPassword, 12);
  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, req.userId]);
  await db.run('UPDATE refresh_tokens SET revoked = ? WHERE user_id = ?', [true, req.userId]);
  clearAuthCookies(res);
  await setAuthCookies(res, req.userId);
  return res.json({ updated: true });
}

export async function listSessions(req, res) {
  const currentId = req.cookies.refresh_token?.split('.')[0];
  const rows = await db.all(
    `SELECT id, created_at, expires_at FROM refresh_tokens
     WHERE user_id = ? AND revoked = ? AND expires_at > ?
     ORDER BY created_at DESC`,
    [req.userId, false, new Date().toISOString()]
  );
  return res.json({
    sessions: rows.map((row) => ({
      ...row,
      current: row.id === currentId,
      device: row.id === currentId ? 'Dieses Gerät' : 'Guildora-Sitzung'
    }))
  });
}

export async function revokeSession(req, res) {
  const currentId = req.cookies.refresh_token?.split('.')[0];
  const result = await db.run(
    'UPDATE refresh_tokens SET revoked = ? WHERE id = ? AND user_id = ?',
    [true, req.params.id, req.userId]
  );
  if (!result.changes) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Diese Sitzung wurde nicht gefunden.');
  if (req.params.id === currentId) clearAuthCookies(res);
  return res.status(204).end();
}

export async function revokeOtherSessions(req, res) {
  const currentId = req.cookies.refresh_token?.split('.')[0] || '';
  await db.run(
    'UPDATE refresh_tokens SET revoked = ? WHERE user_id = ? AND id <> ?',
    [true, req.userId, currentId]
  );
  return res.status(204).end();
}

export async function twoFactorStatus(req, res) {
  const security = await db.get('SELECT two_factor_enabled FROM user_security WHERE user_id = ?', [req.userId]);
  return res.json({ enabled: Boolean(security?.two_factor_enabled) });
}

export async function setupTwoFactor(req, res) {
  const { currentPassword } = passwordConfirmationSchema.parse(req.body);
  const user = await verifiedUser(req.userId, currentPassword);
  const secret = generateTotpSecret();
  const encrypted = encryptSecret(secret);
  const now = new Date().toISOString();
  await db.run(
    `INSERT INTO user_security (user_id, totp_pending_encrypted, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET totp_pending_encrypted = ?, updated_at = ?`,
    [req.userId, encrypted, now, encrypted, now]
  );
  const label = encodeURIComponent(`Guildora:${user.email}`);
  const issuer = encodeURIComponent('Guildora');
  return res.json({
    secret,
    otpauth_url: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&digits=6&period=30`
  });
}

export async function confirmTwoFactor(req, res) {
  const { code } = totpConfirmSchema.parse(req.body);
  const security = await db.get('SELECT totp_pending_encrypted FROM user_security WHERE user_id = ?', [req.userId]);
  if (!security?.totp_pending_encrypted) throw new ApiError(409, 'TWO_FACTOR_NOT_PENDING', 'Starte die Einrichtung zuerst.');
  const secret = decryptSecret(security.totp_pending_encrypted);
  if (!verifyTotp(secret, code)) throw new ApiError(400, 'TWO_FACTOR_CODE_INVALID', 'Der Bestätigungscode ist ungültig.');
  await db.run(
    `UPDATE user_security SET totp_secret_encrypted = ?, totp_pending_encrypted = NULL,
     two_factor_enabled = ?, updated_at = ? WHERE user_id = ?`,
    [encryptSecret(secret), true, new Date().toISOString(), req.userId]
  );
  return res.json({ enabled: true });
}

export async function disableTwoFactor(req, res) {
  const data = totpDisableSchema.parse(req.body);
  await verifiedUser(req.userId, data.currentPassword);
  const security = await db.get('SELECT * FROM user_security WHERE user_id = ?', [req.userId]);
  if (!security?.two_factor_enabled || !verifyTotp(decryptSecret(security.totp_secret_encrypted), data.code)) {
    throw new ApiError(400, 'TWO_FACTOR_CODE_INVALID', 'Der Bestätigungscode ist ungültig.');
  }
  await db.run(
    `UPDATE user_security SET totp_secret_encrypted = NULL, totp_pending_encrypted = NULL,
     two_factor_enabled = ?, updated_at = ? WHERE user_id = ?`,
    [false, new Date().toISOString(), req.userId]
  );
  return res.json({ enabled: false });
}

export async function listConnections(req, res) {
  const connections = await db.all(
    'SELECT id, provider, display_name, created_at FROM user_connections WHERE user_id = ? ORDER BY created_at DESC',
    [req.userId]
  );
  return res.json({ connections });
}

export async function deleteConnection(req, res) {
  const result = await db.run('DELETE FROM user_connections WHERE id = ? AND user_id = ?', [req.params.id, req.userId]);
  if (!result.changes) throw new ApiError(404, 'CONNECTION_NOT_FOUND', 'Diese Verbindung wurde nicht gefunden.');
  return res.status(204).end();
}

export async function accountSafetyOverview(req, res) {
  const [blocked, reports, sanctions, appeals] = await Promise.all([
    db.all(
      `SELECT u.id, u.username, u.display_name, u.avatar_url
       FROM friendships f JOIN users u ON u.id = f.addressee_id
       WHERE f.requester_id = ? AND f.status = 'blocked' ORDER BY f.updated_at DESC`,
      [req.userId]
    ),
    db.all(
      `SELECT id, reported_user_id, reason, status, created_at, 'profile' AS source
       FROM user_profile_reports WHERE reporter_id = ?
       UNION ALL
       SELECT id, reported_user_id, reason, status, created_at, 'server' AS source
       FROM guild_reports WHERE reporter_id = ?
       ORDER BY created_at DESC LIMIT 50`,
      [req.userId, req.userId]
    ),
    db.all(`SELECT id, type, reason, expires_at, revoked_at, created_at FROM global_sanctions
      WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [req.userId]),
    db.all(`SELECT id, sanction_id, message, status, response, created_at, updated_at FROM platform_appeals
      WHERE appellant_id = ? ORDER BY created_at DESC LIMIT 50`, [req.userId])
  ]);
  return res.json({ blocked, reports, sanctions, appeals });
}

export async function deactivateAccount(req, res) {
  const data = passwordConfirmationSchema.parse(req.body);
  await verifiedUser(req.userId, data.currentPassword);
  await db.run(
    `INSERT INTO user_security (user_id, deactivated_at, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET deactivated_at = ?, updated_at = ?`,
    [req.userId, new Date().toISOString(), new Date().toISOString(), new Date().toISOString(), new Date().toISOString()]
  );
  await db.run('UPDATE refresh_tokens SET revoked = ? WHERE user_id = ?', [true, req.userId]);
  clearAuthCookies(res);
  return res.status(204).end();
}

export async function deleteAccount(req, res) {
  const data = passwordConfirmationSchema.parse(req.body);
  await verifiedUser(req.userId, data.currentPassword);
  if (data.confirmation !== 'LÖSCHEN') {
    throw new ApiError(400, 'CONFIRMATION_REQUIRED', 'Gib LÖSCHEN zur Bestätigung ein.', 'confirmation');
  }
  await db.run('DELETE FROM users WHERE id = ?', [req.userId]);
  clearAuthCookies(res);
  return res.status(204).end();
}
