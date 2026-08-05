import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { ApiError } from './errorHandler.js';

export function hashBotToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function issueBotToken(appId) {
  return `gld_bot_${appId}.${crypto.randomBytes(32).toString('base64url')}`;
}

export async function requireBotAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token.startsWith('gld_bot_')) {
    return next(new ApiError(401, 'BOT_UNAUTHORIZED', 'Ein gültiger Bot-Token wird benötigt.'));
  }
  const app = await db.get(
    `SELECT id, owner_id, bot_user_id, name, description, enabled
     FROM bot_applications WHERE token_hash = ?`,
    [hashBotToken(token)]
  );
  if (!app || !app.enabled) {
    return next(new ApiError(401, 'BOT_UNAUTHORIZED', 'Dieser Bot-Token ist ungültig oder deaktiviert.'));
  }
  req.bot = app;
  req.userId = app.bot_user_id;
  return next();
}
