import { Router } from 'express';
import { listUsers, createUser, updateUser, deleteUser } from '../controllers/user.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/rbac';
import { Role } from '@prisma/client';

const router = Router();

router.use(authenticate);
router.use(requireRole(Role.ADMIN));
router.use((req, res, next) => {
  if (req.authMethod === 'api_token') {
    res.status(403).json({
      success: false,
      error: { message: 'User management requires an interactive administrator session.', code: 'FORBIDDEN' },
    });
    return;
  }
  next();
});

router.get('/', listUsers);
router.post('/', createUser);
router.put('/:userId', updateUser);
router.delete('/:userId', deleteUser);

export default router;
