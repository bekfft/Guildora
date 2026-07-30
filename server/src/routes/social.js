import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth } from '../middleware/requireAuth.js';
import {
  blockUser,
  createConversation,
  createDmMessage,
  createFriendRequest,
  getDmMessages,
  listConversations,
  listFriends,
  markDmRead,
  removeFriend,
  respondFriendRequest,
  searchUsers,
  unblockUser
} from '../controllers/socialController.js';
import {
  getUserProfile,
  reportUserProfile,
  updateMyBadgePreferences,
  updateMyProfile
} from '../controllers/profileController.js';

const router = Router();
router.use(requireAuth);
const writeLimiter = rateLimit({ windowMs: 10_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false });
router.get('/users/search', asyncHandler(searchUsers));
router.get('/users/:userId/profile', asyncHandler(getUserProfile));
router.patch('/profile', writeLimiter, asyncHandler(updateMyProfile));
router.put('/profile/badges', writeLimiter, asyncHandler(updateMyBadgePreferences));
router.post('/users/:userId/report', writeLimiter, asyncHandler(reportUserProfile));
router.get('/friends', asyncHandler(listFriends));
router.post('/friends', writeLimiter, asyncHandler(createFriendRequest));
router.patch('/friends/:id', asyncHandler(respondFriendRequest));
router.delete('/friends/:id', asyncHandler(removeFriend));
router.put('/users/:userId/block', asyncHandler(blockUser));
router.delete('/users/:userId/block', asyncHandler(unblockUser));
router.get('/dm/conversations', asyncHandler(listConversations));
router.post('/dm/users/:userId', asyncHandler(createConversation));
router.get('/dm/conversations/:id/messages', asyncHandler(getDmMessages));
router.post('/dm/conversations/:id/messages', writeLimiter, asyncHandler(createDmMessage));
router.post('/dm/conversations/:id/read', asyncHandler(markDmRead));

export default router;
