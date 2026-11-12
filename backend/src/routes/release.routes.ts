import { Router } from 'express';
import {
  uploadRelease,
  listReleases,
  getReleaseById,
  downloadRelease,
  deleteRelease,
  updateRelease,
  submitRelease,
  approveRelease,
  rejectRelease,
  publishRelease,
  deprecateRelease,
  promoteRelease,
  rollbackRelease,
  getCurrentProductionRelease,
  compareReleases,
  createReleaseDownloadTicket,
} from '../controllers/release.controller';
import { listQaVerifications, recordQaVerification, getQaReleaseSummary } from '../controllers/qa.controller';
import { authenticate } from '../middleware/auth';
import { requirePermission, requireRole } from '../middleware/rbac';
import { requireAppAccess } from '../middleware/resourceRbac';
import { uploadApk } from '../middleware/upload';
import { Role, TokenPermission } from '@prisma/client';

const router = Router({ mergeParams: true });

// All release endpoints require authentication (JWT or API Token or query token for download)
router.use(authenticate);

const read = [requirePermission(TokenPermission.READ), requireAppAccess('VIEWER')] as const;
const write = [requireRole(Role.ADMIN, Role.DEVELOPER), requirePermission(TokenPermission.WRITE), requireAppAccess('DEVELOPER')] as const;

router.get('/', ...read, listReleases);

// Static paths must be declared before the generic /:releaseId routes.
router.get('/current', ...read, getCurrentProductionRelease);
router.get('/compare', ...read, compareReleases);
router.post('/rollback', ...write, rollbackRelease);

router.get('/:releaseId', ...read, getReleaseById);
router.get('/:releaseId/download', ...read, downloadRelease);
router.get('/:releaseId/download-ticket', ...read, createReleaseDownloadTicket);
router.get('/:releaseId/qa-summary', ...read, getQaReleaseSummary);
router.get('/:releaseId/qa-verifications', ...read, listQaVerifications);
router.post('/:releaseId/qa-verifications', ...write, recordQaVerification);

router.post('/', ...write, uploadApk.single('file'), uploadRelease);

// Release lifecycle transitions
router.put('/:releaseId', ...write, updateRelease);
router.post('/:releaseId/submit', ...write, submitRelease);
router.post('/:releaseId/approve', ...write, approveRelease);
router.post('/:releaseId/reject', ...write, rejectRelease);
router.post('/:releaseId/publish', ...write, publishRelease);
router.post('/:releaseId/deprecate', ...write, deprecateRelease);
router.post('/:releaseId/promote', ...write, promoteRelease);

router.delete('/:releaseId', ...write, deleteRelease);

export default router;
