import { Router } from 'express';
import { redeemDownloadTicket } from '../controllers/public.controller';

const router = Router();

// Short-lived, single-use tickets only. No JWT or API token is accepted in the URL.
router.get('/:ticket', redeemDownloadTicket);

export default router;
