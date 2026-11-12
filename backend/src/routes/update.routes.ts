import { Router } from 'express';
import { checkForUpdate, getLatestUpdate } from '../controllers/update.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission } from '../middleware/rbac';
import { requireAppAccess } from '../middleware/resourceRbac';
import { TokenPermission } from '@prisma/client';

const router = Router({ mergeParams: true });

router.use(authenticate);
router.get('/check', requirePermission(TokenPermission.READ), requireAppAccess('VIEWER'), checkForUpdate);
router.get('/latest', requirePermission(TokenPermission.READ), requireAppAccess('VIEWER'), getLatestUpdate);

export default router;
