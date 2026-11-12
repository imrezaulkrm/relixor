import { Router } from 'express';
import { getDashboardStats, getRoleDashboard } from '../controllers/stats.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/dashboard', getDashboardStats);
router.get('/overview', getRoleDashboard);

export default router;
