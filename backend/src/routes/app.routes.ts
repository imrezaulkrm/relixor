import { Router } from 'express';
import { listApps, getAppById, createApp, updateApp, deleteApp } from '../controllers/app.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/rbac';
import { Role, TokenPermission } from '@prisma/client';

const router = Router();

router.use(authenticate);

router.get('/', requirePermission(TokenPermission.READ), listApps);
router.get('/:appId', requirePermission(TokenPermission.READ), getAppById);
router.post('/', requireRole(Role.ADMIN, Role.DEVELOPER), requirePermission(TokenPermission.WRITE), createApp);
router.put('/:appId', requireRole(Role.ADMIN, Role.DEVELOPER), requirePermission(TokenPermission.WRITE), updateApp);
router.delete('/:appId', requireRole(Role.ADMIN), requirePermission(TokenPermission.ADMIN), deleteApp);

export default router;
