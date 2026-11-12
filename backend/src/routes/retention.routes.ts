import { Router } from 'express';
import {
  listRetentionPolicies,
  updateRetentionPolicy,
  previewCleanup,
  runCleanup,
  listCleanupHistory,
  getRetentionStorageStats,
} from '../controllers/retention.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { requireInteractiveSession } from '../middleware/resourceRbac';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticate);
router.use(requireRole(Role.ADMIN));
router.use(requireInteractiveSession);

router.get('/policies', listRetentionPolicies);
router.put('/policies/:channel', updateRetentionPolicy);
router.get('/storage', getRetentionStorageStats);
router.get('/candidates', previewCleanup);
router.post('/cleanup', runCleanup);
router.get('/history', listCleanupHistory);

export default router;
