import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  listOwnSessions,
  revokeOwnSession,
  listOwnActivity,
} from '../controllers/profile.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/', getProfile);
router.put('/', updateProfile);
router.get('/sessions', listOwnSessions);
router.delete('/sessions/:sessionId', revokeOwnSession);
router.get('/activity', listOwnActivity);

export default router;
