import { Router } from 'express';
import {
  createVoiceToken,
  getGuildVoiceParticipants,
  getVoiceParticipants,
  getVoiceStatus
} from '../controllers/voiceController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);
router.get('/status', asyncHandler(getVoiceStatus));
router.get('/channels/:channelId/participants', asyncHandler(getVoiceParticipants));
router.get('/guilds/:guildId/participants', asyncHandler(getGuildVoiceParticipants));
router.post('/channels/:channelId/token', asyncHandler(createVoiceToken));

export default router;
