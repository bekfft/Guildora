import { verifyAccessToken } from '../utils/tokens.js';
import { ApiError } from './errorHandler.js';

export function requireAuth(req, res, next) {
  const token = req.cookies.access_token;
  if (!token) return next(new ApiError(401, 'UNAUTHORIZED', 'Bitte melde dich an.'));

  try {
    const payload = verifyAccessToken(token);
    req.userId = payload.sub;
    return next();
  } catch {
    return next(new ApiError(401, 'UNAUTHORIZED', 'Deine Sitzung ist abgelaufen.'));
  }
}
