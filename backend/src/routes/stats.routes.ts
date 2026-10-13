import { Router } from 'express';
import { getDashboardStats } from '../controllers/stats.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/dashboard', getDashboardStats);

export default router;
