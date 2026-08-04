import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  login,
  logout,
  me,
  refresh,
  register,
  verifyEmailStub
} from '../controllers/authController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

function rateLimitHandler(req, res) {
  res.status(429).json({
    error: {
      code: 'RATE_LIMITED',
      message: 'Zu viele Versuche. Bitte warte einen Moment und versuche es erneut.'
    }
  });
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: process.env.NODE_ENV === 'test' ? 100 : 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: rateLimitHandler
});

router.post('/register', registerLimiter, asyncHandler(register));
router.post('/login', loginLimiter, asyncHandler(login));
router.post('/logout', asyncHandler(logout));
router.post('/refresh', asyncHandler(refresh));
router.get('/me', requireAuth, asyncHandler(me));
router.post('/verify-email', requireAuth, asyncHandler(verifyEmailStub));

export default router;
