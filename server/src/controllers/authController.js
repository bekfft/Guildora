import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { loginSchema, registerSchema } from '../validation/authSchemas.js';
import { ApiError } from '../middleware/errorHandler.js';
import {
  clearAuthCookies,
  consumeRefreshToken,
  revokeRefreshToken,
  setAuthCookies
} from '../utils/tokens.js';
import { decryptSecret, verifyTotp } from '../utils/totp.js';

const PUBLIC_USER_FIELDS = `u.id, u.email, u.username, u.display_name, u.avatar_url, u.created_at,
  p.banner_url, COALESCE(p.bio, '') AS bio, COALESCE(p.custom_status, '') AS custom_status`;

function findPublicUserById(userId) {
  return db.get(
    `SELECT ${PUBLIC_USER_FIELDS}
     FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
     WHERE u.id = ?`,
    [userId]
  );
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    banner_url: user.banner_url,
    bio: user.bio,
    custom_status: user.custom_status,
    created_at: user.created_at
  };
}

function hasMinimumAge(birthdate, minimumAge = 13) {
  const [year, month, day] = birthdate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getTime() > Date.now()
  ) return false;

  const today = new Date();
  let age = today.getUTCFullYear() - year;
  const birthdayPassed =
    today.getUTCMonth() + 1 > month ||
    (today.getUTCMonth() + 1 === month && today.getUTCDate() >= day);
  if (!birthdayPassed) age -= 1;
  return age >= minimumAge;
}

function duplicateError(error) {
  const message = `${error?.message || ''} ${error?.detail || ''}`.toLowerCase();
  if (
    error?.code === '23505' ||
    error?.code?.startsWith('SQLITE_CONSTRAINT') ||
    (error?.code === 'ERR_SQLITE_ERROR' && error?.errcode === 2067)
  ) {
    if (message.includes('email')) return new ApiError(409, 'EMAIL_TAKEN', 'Diese E-Mail ist schon registriert.', 'email');
    if (message.includes('username')) return new ApiError(409, 'USERNAME_TAKEN', 'Dieser Benutzername ist bereits vergeben.', 'username');
  }
  return null;
}

export async function register(req, res) {
  const data = registerSchema.parse(req.body);
  if (!hasMinimumAge(data.birthdate)) {
    throw new ApiError(400, 'TOO_YOUNG', 'Du musst mindestens 13 Jahre alt sein.', 'birthdate');
  }

  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(data.password, 12);
  try {
    await db.run(
      `INSERT INTO users
        (id, email, username, display_name, password_hash, birthdate, avatar_url, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, data.email, data.username, data.username, passwordHash, data.birthdate, null, false]
    );
  } catch (error) {
    throw duplicateError(error) || error;
  }

  console.info(`[E-Mail-Stub] Verifizierungslink für Nutzer ${id} würde jetzt versendet.`);
  const user = await findPublicUserById(id);
  await setAuthCookies(res, id);
  return res.status(201).json({ user: publicUser(user) });
}

export async function login(req, res) {
  const data = loginSchema.parse(req.body);
  const identifier = data.identifier.toLowerCase();
  const user = await db.get('SELECT * FROM users WHERE email = ? OR username = ?', [identifier, identifier]);

  if (!user || !(await bcrypt.compare(data.password, user.password_hash))) {
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'E-Mail, Benutzername oder Passwort ist falsch.');
  }

  const security = await db.get('SELECT * FROM user_security WHERE user_id = ?', [user.id]);
  if (security?.deactivated_at) {
    throw new ApiError(403, 'ACCOUNT_DEACTIVATED', 'Dieser Account ist deaktiviert.');
  }
  if (security?.two_factor_enabled) {
    if (!data.totpCode) {
      throw new ApiError(401, 'TWO_FACTOR_REQUIRED', 'Gib den sechsstelligen Code deiner Authenticator-App ein.', 'totpCode');
    }
    if (!verifyTotp(decryptSecret(security.totp_secret_encrypted), data.totpCode)) {
      throw new ApiError(401, 'TWO_FACTOR_INVALID', 'Der Authenticator-Code ist ungültig.', 'totpCode');
    }
  }

  await setAuthCookies(res, user.id);
  return res.json({ user: publicUser(await findPublicUserById(user.id)) });
}

export async function logout(req, res) {
  await revokeRefreshToken(req.cookies.refresh_token);
  clearAuthCookies(res);
  return res.status(204).end();
}

export async function refresh(req, res) {
  const userId = await consumeRefreshToken(req.cookies.refresh_token);
  if (!userId) {
    clearAuthCookies(res);
    throw new ApiError(401, 'UNAUTHORIZED', 'Deine Sitzung ist abgelaufen.');
  }

  const user = await findPublicUserById(userId);
  if (!user) {
    clearAuthCookies(res);
    throw new ApiError(401, 'UNAUTHORIZED', 'Deine Sitzung ist ungültig.');
  }

  await setAuthCookies(res, userId);
  return res.json({ user: publicUser(user) });
}

export async function me(req, res) {
  const user = await findPublicUserById(req.userId);
  if (!user) throw new ApiError(401, 'UNAUTHORIZED', 'Dein Account wurde nicht gefunden.');
  return res.json({ user: publicUser(user) });
}

export async function verifyEmailStub(req, res) {
  console.info(`[E-Mail-Stub] Verifizierung für Nutzer ${req.userId} wurde angefordert.`);
  return res.status(202).json({ message: 'E-Mail-Verifizierung ist für eine spätere Phase vorbereitet.' });
}
