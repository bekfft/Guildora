import { Router } from 'express';
import { getChannel } from '../controllers/guildController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);
router.get('/:id', asyncHandler(getChannel));

export default router;
