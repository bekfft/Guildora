import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  authorizeApp, createApp, createCommand, deleteApp, deleteCommand, guildBots, guildCommands, installApp,
  installInfo, invokeCommand, listApps, removeGuildBot, rotateToken, uninstallApp, updateApp
} from '../controllers/developerController.js';

const router = Router();
router.use(requireAuth);
router.get('/apps', asyncHandler(listApps));
router.post('/apps', asyncHandler(createApp));
router.patch('/apps/:appId', asyncHandler(updateApp));
router.delete('/apps/:appId', asyncHandler(deleteApp));
router.post('/apps/:appId/token', asyncHandler(rotateToken));
router.get('/apps/:appId/install', asyncHandler(installInfo));
router.post('/apps/:appId/authorize', asyncHandler(authorizeApp));
router.post('/apps/:appId/guilds', asyncHandler(installApp));
router.delete('/apps/:appId/guilds/:guildId', asyncHandler(uninstallApp));
router.post('/apps/:appId/commands', asyncHandler(createCommand));
router.delete('/apps/:appId/commands/:commandId', asyncHandler(deleteCommand));
router.get('/guilds/:guildId/commands', asyncHandler(guildCommands));
router.get('/guilds/:guildId/bots', asyncHandler(guildBots));
router.delete('/guilds/:guildId/bots/:appId', asyncHandler(removeGuildBot));
router.post('/guilds/:guildId/commands/:appId/:name/invoke', asyncHandler(invokeCommand));
router.post('/guilds/:guildId/commands/:name/invoke', asyncHandler(invokeCommand));
export default router;
