import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  createMessage,
  deleteMessage,
  getMessages,
  toggleReaction,
  updateMessage
} from '../controllers/messageController.js';
import {
  listNotifications,
  markChannelRead,
  readAllNotifications,
  readNotification,
  searchMessages
} from '../controllers/engagementController.js';
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
router.post('/channels/:channelId/read', asyncHandler(markChannelRead));
router.get('/guilds/:guildId/messages/search', asyncHandler(searchMessages));
router.get('/notifications', asyncHandler(listNotifications));
router.patch('/notifications/:id/read', asyncHandler(readNotification));
router.post('/notifications/read-all', asyncHandler(readAllNotifications));
router.post('/channels/:channelId/messages', sendLimiter, asyncHandler(createMessage));
router.patch('/messages/:id', asyncHandler(updateMessage));
router.delete('/messages/:id', asyncHandler(deleteMessage));
router.put('/messages/:id/reactions', sendLimiter, asyncHandler(toggleReaction));

export default router;
