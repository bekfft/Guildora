import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createMessage,
  deleteMessage,
  getMessages,
  updateMessage
} from '../controllers/messageController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);

const sendLimiter = rateLimit({
  windowMs: 10 * 1000,
  limit: 12,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({
    error: { code: 'RATE_LIMITED', message: 'Du sendest zu schnell. Bitte warte einen Moment.' }
  })
});

router.get('/channels/:channelId/messages', asyncHandler(getMessages));
router.post('/channels/:channelId/messages', sendLimiter, asyncHandler(createMessage));
router.patch('/messages/:id', asyncHandler(updateMessage));
router.delete('/messages/:id', asyncHandler(deleteMessage));

export default router;
