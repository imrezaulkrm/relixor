import { Router } from 'express';
import { listAllReleases } from '../controllers/release.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { TokenPermission } from '@prisma/client';

const router = Router();

router.use(authenticate);
router.get('/', requirePermission(TokenPermission.READ), listAllReleases);

export default router;
