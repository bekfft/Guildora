import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireBotAuth } from '../middleware/requireBotAuth.js';
import {
  botChannels, botEvents, botGuilds, botIdentity, botInteractionCallback, botSendMessage
} from '../controllers/developerController.js';

const router = Router();
router.use(asyncHandler(requireBotAuth));
router.use(rateLimit({
  windowMs: 10_000,
  limit: 30,
  keyGenerator: (req) => req.bot?.id || req.ip,
  standardHeaders: 'draft-7',
  legacyHeaders: false
}));
router.get('/bot', asyncHandler(botIdentity));
router.get('/guilds', asyncHandler(botGuilds));
router.get('/guilds/:guildId/channels', asyncHandler(botChannels));
router.post('/channels/:channelId/messages', asyncHandler(botSendMessage));
router.get('/events', asyncHandler(botEvents));
router.post('/interactions/:eventId/callback', asyncHandler(botInteractionCallback));
export default router;
