import { Router } from 'express';
import { listTokens, createToken, revokeToken, deleteToken } from '../controllers/token.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticate);
// Viewers cannot manage tokens
router.use(requireRole(Role.ADMIN, Role.DEVELOPER));
router.use((req, res, next) => {
  if (req.authMethod === 'api_token') {
    res.status(403).json({
      success: false,
      error: { message: 'API token management requires an interactive user session.', code: 'FORBIDDEN' },
    });
    return;
  }
  next();
});

router.get('/', listTokens);
router.post('/', createToken);
router.put('/:tokenId/revoke', revokeToken);
router.delete('/:tokenId', deleteToken);

export default router;
