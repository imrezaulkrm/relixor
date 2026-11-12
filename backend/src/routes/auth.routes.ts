import { Router } from 'express';
import { login, logout, getMe, changePassword, resetPassword } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/login', login);
router.post('/logout', authenticate, logout);
router.post('/password-reset', resetPassword);
router.get('/me', authenticate, getMe);
router.post('/change-password', authenticate, changePassword);

export default router;
