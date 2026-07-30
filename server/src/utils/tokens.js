import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { db } from '../db/index.js';

const ACCESS_MAX_AGE = 15 * 60 * 1000;
const REFRESH_MAX_AGE = 30 * 24 * 60 * 60 * 1000;

function requiredSecret(name, developmentFallback) {
  const value = process.env[name];
  if (value) return value;
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`${name} muss in Produktion gesetzt sein.`);
  }
  return developmentFallback;
}

function cookieOptions(maxAge) {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge
  };
}

function refreshHash(secret) {
  return crypto
    .createHmac('sha256', requiredSecret('REFRESH_TOKEN_SECRET', 'guildora-dev-refresh-secret'))
    .update(secret)
    .digest('hex');
}

export function signAccessToken(userId) {
  return jwt.sign(
    { sub: userId, type: 'access' },
    requiredSecret('JWT_ACCESS_SECRET', 'guildora-dev-access-secret'),
    { expiresIn: '15m', issuer: 'guildora' }
  );
}

export function verifyAccessToken(token) {
  const payload = jwt.verify(token, requiredSecret('JWT_ACCESS_SECRET', 'guildora-dev-access-secret'), {
    issuer: 'guildora'
  });
  if (payload.type !== 'access') throw new Error('Ungültiger Token-Typ.');
  return payload;
}

export async function createRefreshToken(userId) {
  const id = crypto.randomUUID();
  const secret = crypto.randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_MAX_AGE).toISOString();
  await db.run(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, revoked) VALUES (?, ?, ?, ?, ?)',
    [id, userId, refreshHash(secret), expiresAt, false]
  );
  return { value: `${id}.${secret}`, expiresAt };
}

export async function consumeRefreshToken(value) {
  const separator = value?.indexOf('.');
  if (!value || separator < 1) return null;
  const id = value.slice(0, separator);
  const secret = value.slice(separator + 1);
  const token = await db.get('SELECT * FROM refresh_tokens WHERE id = ?', [id]);
  if (!token || Boolean(token.revoked) || new Date(token.expires_at).getTime() <= Date.now()) return null;

  const actual = Buffer.from(refreshHash(secret), 'hex');
  const expected = Buffer.from(token.token_hash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;

  await db.run('UPDATE refresh_tokens SET revoked = ? WHERE id = ?', [true, id]);
  return token.user_id;
}

export async function revokeRefreshToken(value) {
  const id = value?.split('.')[0];
  if (id) await db.run('UPDATE refresh_tokens SET revoked = ? WHERE id = ?', [true, id]);
}

export async function setAuthCookies(res, userId) {
  const accessToken = signAccessToken(userId);
  const refreshToken = await createRefreshToken(userId);
  res.cookie('access_token', accessToken, cookieOptions(ACCESS_MAX_AGE));
  res.cookie('refresh_token', refreshToken.value, cookieOptions(REFRESH_MAX_AGE));
}

export function clearAuthCookies(res) {
  const options = cookieOptions(0);
  delete options.maxAge;
  res.clearCookie('access_token', options);
  res.clearCookie('refresh_token', options);
}
