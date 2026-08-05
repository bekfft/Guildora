import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  createApp, createCommand, deleteApp, deleteCommand, guildCommands, installApp,
  invokeCommand, listApps, rotateToken, uninstallApp, updateApp
} from '../controllers/developerController.js';

const router = Router();
router.use(requireAuth);
router.get('/apps', asyncHandler(listApps));
router.post('/apps', asyncHandler(createApp));
router.patch('/apps/:appId', asyncHandler(updateApp));
router.delete('/apps/:appId', asyncHandler(deleteApp));
router.post('/apps/:appId/token', asyncHandler(rotateToken));
router.post('/apps/:appId/guilds', asyncHandler(installApp));
router.delete('/apps/:appId/guilds/:guildId', asyncHandler(uninstallApp));
router.post('/apps/:appId/commands', asyncHandler(createCommand));
router.delete('/apps/:appId/commands/:commandId', asyncHandler(deleteCommand));
router.get('/guilds/:guildId/commands', asyncHandler(guildCommands));
router.post('/guilds/:guildId/commands/:name/invoke', asyncHandler(invokeCommand));
export default router;
