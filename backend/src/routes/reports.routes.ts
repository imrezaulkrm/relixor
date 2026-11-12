import { Router } from 'express';
import { getQaReport, exportQaReport } from '../controllers/report.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);
router.get('/qa', getQaReport);
router.get('/qa/export', exportQaReport);

export default router;
