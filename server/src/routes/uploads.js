import { Router } from 'express';
import { attachmentUpload, createUploads, getUpload } from '../controllers/uploadController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = Router();
router.use(requireAuth);
router.post('/', attachmentUpload.array('files', 5), asyncHandler(createUploads));
router.get('/:id', asyncHandler(getUpload));

export default router;
