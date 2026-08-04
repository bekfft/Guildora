import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireStaff } from '../services/platformModeration.js';
import {
  addCaseNote, dashboard, decideApproval, getCase, getGuild, getUser, listAppeals, listApprovals, listAudit, listCases, listTeam,
  removePlatformMessage, removeTeamMember, reviewAppeal, revokeSanction, sanctionUser, searchGuilds, searchUsers, staffMe,
  restrictGuild, revokeGuildRestriction, updateCase, upsertTeamMember
} from '../controllers/staffController.js';

const router = Router();
router.use(requireAuth);
router.get('/me', requireStaff('staff.access'), asyncHandler(staffMe));
router.get('/dashboard', requireStaff('staff.access'), asyncHandler(dashboard));
router.get('/cases', requireStaff('cases.view'), asyncHandler(listCases));
router.get('/cases/:id', requireStaff('cases.view'), asyncHandler(getCase));
router.patch('/cases/:id', requireStaff('cases.manage'), asyncHandler(updateCase));
router.post('/cases/:id/notes', requireStaff('cases.note'), asyncHandler(addCaseNote));
router.get('/users', requireStaff('users.view'), asyncHandler(searchUsers));
router.get('/users/:id', requireStaff('users.view'), asyncHandler(getUser));
router.post('/users/:id/sanctions', requireStaff('users.warn'), asyncHandler(sanctionUser));
router.delete('/sanctions/:id', requireStaff('users.restrict'), asyncHandler(revokeSanction));
router.delete('/messages/:id', requireStaff('content.remove'), asyncHandler(removePlatformMessage));
router.get('/guilds', requireStaff('users.view'), asyncHandler(searchGuilds));
router.get('/guilds/:id', requireStaff('users.view'), asyncHandler(getGuild));
router.post('/guilds/:id/restrictions', requireStaff('guilds.manage'), asyncHandler(restrictGuild));
router.delete('/guild-restrictions/:id', requireStaff('guilds.manage'), asyncHandler(revokeGuildRestriction));
router.get('/appeals', requireStaff('appeals.view'), asyncHandler(listAppeals));
router.patch('/appeals/:id', requireStaff('appeals.manage'), asyncHandler(reviewAppeal));
router.get('/audit', requireStaff('audit.view'), asyncHandler(listAudit));
router.get('/approvals', requireStaff('staff.manage'), asyncHandler(listApprovals));
router.patch('/approvals/:id', requireStaff('staff.manage'), asyncHandler(decideApproval));
router.get('/team', requireStaff('staff.manage'), asyncHandler(listTeam));
router.put('/team/:userId', requireStaff('staff.manage'), asyncHandler(upsertTeamMember));
router.delete('/team/:userId', requireStaff('staff.manage'), asyncHandler(removeTeamMember));
export default router;
