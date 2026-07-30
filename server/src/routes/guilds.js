import { Router } from 'express';
import {
  createGuild,
  discoverGuilds,
  getGuild,
  getGuildMembers,
  getMyGuilds,
  joinGuild,
  leaveGuild
} from '../controllers/guildController.js';
import {
  createCategory,
  createChannel,
  createRole,
  deleteCategory,
  deleteChannel,
  deleteChannelRolePermissions,
  deleteRole,
  kickMember,
  getChannelRolePermissions,
  updateCategory,
  updateChannel,
  updateChannelRolePermissions,
  updateGuildProfile,
  updateMemberNickname,
  updateMemberRoles,
  updateRole
} from '../controllers/guildAdminController.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  createGuildInvite,
  deleteGuildInvite,
  listGuildInvites
} from '../controllers/inviteController.js';
import {
  banMember,
  clearTimeout,
  createReport,
  listModeration,
  resolveReport,
  timeoutMember,
  unbanMember
} from '../controllers/moderationController.js';

const router = Router();
router.use(requireAuth);
router.get('/@me', asyncHandler(getMyGuilds));
router.get('/discovery', asyncHandler(discoverGuilds));
router.post('/', asyncHandler(createGuild));
router.get('/:id', asyncHandler(getGuild));
router.get('/:id/members', asyncHandler(getGuildMembers));
router.get('/:id/invites', asyncHandler(listGuildInvites));
router.post('/:id/invites', asyncHandler(createGuildInvite));
router.delete('/:id/invites/:inviteId', asyncHandler(deleteGuildInvite));
router.patch('/:id', asyncHandler(updateGuildProfile));
router.post('/:id/categories', asyncHandler(createCategory));
router.patch('/:id/categories/:categoryId', asyncHandler(updateCategory));
router.delete('/:id/categories/:categoryId', asyncHandler(deleteCategory));
router.post('/:id/channels', asyncHandler(createChannel));
router.patch('/:id/channels/:channelId', asyncHandler(updateChannel));
router.delete('/:id/channels/:channelId', asyncHandler(deleteChannel));
router.get('/:id/channels/:channelId/permissions', asyncHandler(getChannelRolePermissions));
router.put('/:id/channels/:channelId/permissions/:roleId', asyncHandler(updateChannelRolePermissions));
router.delete('/:id/channels/:channelId/permissions/:roleId', asyncHandler(deleteChannelRolePermissions));
router.post('/:id/roles', asyncHandler(createRole));
router.patch('/:id/roles/:roleId', asyncHandler(updateRole));
router.delete('/:id/roles/:roleId', asyncHandler(deleteRole));
router.put('/:id/members/:memberId/roles', asyncHandler(updateMemberRoles));
router.patch('/:id/members/:memberId', asyncHandler(updateMemberNickname));
router.delete('/:id/members/:memberId', asyncHandler(kickMember));
router.get('/:id/moderation', asyncHandler(listModeration));
router.post('/:id/moderation/bans', asyncHandler(banMember));
router.delete('/:id/moderation/bans/:userId', asyncHandler(unbanMember));
router.post('/:id/moderation/timeouts', asyncHandler(timeoutMember));
router.delete('/:id/moderation/timeouts/:userId', asyncHandler(clearTimeout));
router.post('/:id/reports', asyncHandler(createReport));
router.patch('/:id/reports/:reportId', asyncHandler(resolveReport));
router.post('/:id/join', asyncHandler(joinGuild));
router.delete('/:id/leave', asyncHandler(leaveGuild));

export default router;
