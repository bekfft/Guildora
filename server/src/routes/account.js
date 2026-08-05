import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuth } from '../middleware/requireAuth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import {
  accountSafetyOverview,
  confirmTwoFactor,
  deactivateAccount,
  deleteAccount,
  deleteConnection,
  disableTwoFactor,
  getSettings,
  listConnections,
  listSessions,
  revokeOtherSessions,
  revokeSession,
  setupTwoFactor,
  twoFactorStatus,
  updateAccount,
  updatePassword,
  updateSettings
} from '../controllers/accountController.js';
import { addMyAppealMessage, createAppeal, myAppeal, myAppeals } from '../controllers/staffController.js';

const router = Router();
const securityLimiter = rateLimit({ windowMs: 10 * 60 * 1000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false });
router.use(requireAuth);
router.get('/settings', asyncHandler(getSettings));
router.patch('/settings', asyncHandler(updateSettings));
router.patch('/', securityLimiter, asyncHandler(updateAccount));
router.patch('/password', securityLimiter, asyncHandler(updatePassword));
router.get('/sessions', asyncHandler(listSessions));
router.delete('/sessions/others', asyncHandler(revokeOtherSessions));
router.delete('/sessions/:id', asyncHandler(revokeSession));
router.get('/2fa', asyncHandler(twoFactorStatus));
router.post('/2fa/setup', securityLimiter, asyncHandler(setupTwoFactor));
router.post('/2fa/confirm', securityLimiter, asyncHandler(confirmTwoFactor));
router.delete('/2fa', securityLimiter, asyncHandler(disableTwoFactor));
router.get('/connections', asyncHandler(listConnections));
router.delete('/connections/:id', asyncHandler(deleteConnection));
router.get('/safety', asyncHandler(accountSafetyOverview));
router.get('/appeals', asyncHandler(myAppeals));
router.post('/appeals', securityLimiter, asyncHandler(createAppeal));
router.get('/appeals/:id', asyncHandler(myAppeal));
router.post('/appeals/:id/messages', securityLimiter, asyncHandler(addMyAppealMessage));
router.post('/deactivate', securityLimiter, asyncHandler(deactivateAccount));
router.delete('/', securityLimiter, asyncHandler(deleteAccount));

export default router;
