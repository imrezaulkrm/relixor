import { Router } from 'express';
import {
  listProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  listProjectApps,
  createProjectApp,
} from '../controllers/project.controller';
import {
  listProjectMembers,
  assignProjectMember,
  updateProjectMemberRole,
  removeProjectMember,
} from '../controllers/membership.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/rbac';
import { requireProjectAccess, requireInteractiveSession } from '../middleware/resourceRbac';
import { Role, TokenPermission } from '@prisma/client';

const router = Router();

router.use(authenticate);

// Projects CRUD
router.get('/', requirePermission(TokenPermission.READ), listProjects);
router.post('/', requireRole(Role.ADMIN), createProject);

router.get('/:projectId', requirePermission(TokenPermission.READ), requireProjectAccess('VIEWER'), getProjectById);
router.put('/:projectId', requireRole(Role.ADMIN), updateProject);
router.delete('/:projectId', requireRole(Role.ADMIN), deleteProject);

// Apps under a Project
router.get(
  '/:projectId/apps',
  requirePermission(TokenPermission.READ),
  requireProjectAccess('VIEWER'),
  listProjectApps
);
router.post(
  '/:projectId/apps',
  requireRole(Role.ADMIN, Role.DEVELOPER),
  requirePermission(TokenPermission.WRITE),
  requireProjectAccess('DEVELOPER'),
  createProjectApp
);

// Project Membership Management (ADMIN only, interactive session only)
router.get('/:projectId/members', requireRole(Role.ADMIN), requireInteractiveSession, listProjectMembers);
router.post('/:projectId/members', requireRole(Role.ADMIN), requireInteractiveSession, assignProjectMember);
router.put('/:projectId/members/:userId', requireRole(Role.ADMIN), requireInteractiveSession, updateProjectMemberRole);
router.delete('/:projectId/members/:userId', requireRole(Role.ADMIN), requireInteractiveSession, removeProjectMember);

export default router;
