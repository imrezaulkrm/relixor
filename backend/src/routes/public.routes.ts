import { Router } from 'express';
import {
  listPublicApps,
  getPublicApp,
  publicCheckForUpdate,
  publicLatestRelease,
  createPublicDownloadTicket,
} from '../controllers/public.controller';

const router = Router();

// Public endpoints expose only explicitly published PRODUCTION releases of public apps.
router.get('/apps', listPublicApps);
router.get('/apps/:appRef/updates/check', publicCheckForUpdate);
router.get('/apps/:appRef/updates/latest', publicLatestRelease);
router.post('/apps/:appRef/download-ticket', createPublicDownloadTicket);
router.get('/apps/:appRef', getPublicApp);

export default router;
