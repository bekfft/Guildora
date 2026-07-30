import { Router } from 'express';
import { getInvitePreview, joinWithInvite } from '../controllers/inviteController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();

router.get('/:code', asyncHandler(getInvitePreview));
router.post('/:code/join', requireAuth, asyncHandler(joinWithInvite));

export default router;
