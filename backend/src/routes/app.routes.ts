import { Router } from 'express';
import { listApps, getAppById, createApp, updateApp, deleteApp } from '../controllers/app.controller';
import {
  listAppMembers,
  assignAppMember,
  updateAppMemberRole,
  removeAppMember,
} from '../controllers/membership.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/rbac';
import { requireAppAccess, requireInteractiveSession } from '../middleware/resourceRbac';
import { Role, TokenPermission } from '@prisma/client';

const router = Router();

router.use(authenticate);

// App CRUD
router.get('/', requirePermission(TokenPermission.READ), listApps);
router.get('/:appId', requirePermission(TokenPermission.READ), requireAppAccess('VIEWER'), getAppById);
router.post('/', requireRole(Role.ADMIN, Role.DEVELOPER), requirePermission(TokenPermission.WRITE), createApp);
router.put('/:appId', requireRole(Role.ADMIN, Role.DEVELOPER), requirePermission(TokenPermission.WRITE), requireAppAccess('DEVELOPER'), updateApp);
router.delete('/:appId', requireRole(Role.ADMIN), requirePermission(TokenPermission.ADMIN), deleteApp);

// App Membership Management (ADMIN only, interactive session only)
router.get('/:appId/members', requireRole(Role.ADMIN), requireInteractiveSession, listAppMembers);
router.post('/:appId/members', requireRole(Role.ADMIN), requireInteractiveSession, assignAppMember);
router.put('/:appId/members/:userId', requireRole(Role.ADMIN), requireInteractiveSession, updateAppMemberRole);
router.delete('/:appId/members/:userId', requireRole(Role.ADMIN), requireInteractiveSession, removeAppMember);

export default router;
