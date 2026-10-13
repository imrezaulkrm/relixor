import { Router } from 'express';
import { listAuditLogs } from '../controllers/audit.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticate);
router.use(requireRole(Role.ADMIN, Role.DEVELOPER));

router.get('/', listAuditLogs);

export default router;
