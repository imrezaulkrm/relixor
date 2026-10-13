import { Router } from 'express';
import {
  uploadRelease,
  listReleases,
  getReleaseById,
  downloadRelease,
  deleteRelease,
} from '../controllers/release.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/rbac';
import { uploadApk } from '../middleware/upload';
import { Role, TokenPermission } from '@prisma/client';

const router = Router({ mergeParams: true });

// All release endpoints require authentication (JWT or API Token or query token for download)
router.use(authenticate);

router.get('/', requirePermission(TokenPermission.READ), listReleases);
router.get('/:releaseId', requirePermission(TokenPermission.READ), getReleaseById);
router.get('/:releaseId/download', requirePermission(TokenPermission.READ), downloadRelease);

router.post(
  '/',
  requireRole(Role.ADMIN, Role.DEVELOPER),
  requirePermission(TokenPermission.WRITE),
  uploadApk.single('file'),
  uploadRelease
);

router.delete(
  '/:releaseId',
  requireRole(Role.ADMIN, Role.DEVELOPER),
  requirePermission(TokenPermission.ADMIN),
  deleteRelease
);

export default router;
