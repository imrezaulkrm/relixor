import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../services/prisma';
import { recordAuditLog } from '../services/auditService';
import { createSession, revokeAllSessions, revokeSession } from '../services/sessionService';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

const resetPasswordSchema = z.object({
  token: z.string().min(20),
  newPassword: z.string().min(8),
});

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const normalizedEmail = email.toLowerCase().trim();

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });

    if (!user || !user.isActive) {
      await recordAuditLog({
        action: 'AUTH_LOGIN_FAILED',
        entityType: 'USER',
        entityId: user?.id,
        userId: user?.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { email: normalizedEmail, reason: user ? 'inactive' : 'unknown_account' },
      });
      res.status(401).json({
        success: false,
        error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' },
      });
      return;
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      await Promise.all([
        recordAuditLog({
          action: 'AUTH_LOGIN_FAILED',
          entityType: 'USER',
          entityId: user.id,
          userId: user.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          details: { email: normalizedEmail, reason: 'invalid_password' },
        }),
        prisma.loginEvent.create({
          data: {
            userId: user.id,
            action: 'FAILED_LOGIN',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
          },
        }),
      ]);
      res.status(401).json({
        success: false,
        error: { message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' },
      });
      return;
    }

    const issued = await createSession(
      { id: user.id, email: user.email, name: user.name, role: user.role, tokenVersion: user.tokenVersion },
      req.ip,
      req.headers['user-agent']
    );

    await Promise.all([
      prisma.loginEvent.create({
        data: {
          userId: user.id,
          action: 'LOGIN',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      }),
      recordAuditLog({
        action: 'AUTH_LOGIN',
        entityType: 'USER',
        entityId: user.id,
        userId: user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { email: user.email, sessionId: issued.sessionId },
      }),
    ]);

    res.json({
      success: true,
      data: {
        token: issued.token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      return;
    }
    if (req.authMethod === 'api_token') {
      res.status(403).json({
        success: false,
        error: { message: 'API tokens are revoked from the token management screen.', code: 'FORBIDDEN' },
      });
      return;
    }

    if (req.sessionId) await revokeSession(req.sessionId, req.user.id);

    await Promise.all([
      prisma.loginEvent.create({
        data: {
          userId: req.user.id,
          action: 'LOGOUT',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
        },
      }),
      recordAuditLog({
        action: 'AUTH_LOGOUT',
        entityType: 'USER',
        entityId: req.user.id,
        userId: req.user.id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        details: { sessionId: req.sessionId || null },
      }),
    ]);

    res.json({ success: true, message: 'Signed out.' });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      return;
    }

    if (req.authMethod === 'api_token') {
      res.status(403).json({
        success: false,
        error: { message: 'Password changes require an interactive user session.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found', code: 'NOT_FOUND' } });
      return;
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      res.status(400).json({
        success: false,
        error: { message: 'Incorrect current password', code: 'INVALID_CURRENT_PASSWORD' },
      });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newHash, tokenVersion: { increment: 1 } },
    });

    // Invalidate every existing session, then keep the current device signed in.
    await revokeAllSessions(user.id);
    const issued = await createSession(
      {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        tokenVersion: updated.tokenVersion,
      },
      req.ip,
      req.headers['user-agent']
    );

    await recordAuditLog({
      action: 'USER_PASSWORD_CHANGE',
      entityType: 'USER',
      entityId: user.id,
      userId: user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.json({
      success: true,
      message: 'Password updated. Other sessions have been signed out.',
      data: { token: issued.token },
    });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, newPassword } = resetPasswordSchema.parse(req.body);
    const tokenHash = crypto.createHash('sha256').update(token.trim()).digest('hex');

    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!record || record.usedAt !== null || record.expiresAt.getTime() <= Date.now() || !record.user.isActive) {
      res.status(400).json({
        success: false,
        error: { message: 'Password reset token is invalid, expired or already used.', code: 'INVALID_RESET_TOKEN' },
      });
      return;
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    try {
      await prisma.$transaction(async (tx) => {
        // Atomic single-use consumption: concurrent requests cannot both succeed.
        const consumed = await tx.passwordResetToken.updateMany({
          where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
          data: { usedAt: new Date() },
        });
        if (consumed.count !== 1) {
          throw Object.assign(new Error('Reset token already consumed'), { code: 'INVALID_RESET_TOKEN' });
        }

        await tx.user.update({
          where: { id: record.userId },
          data: { passwordHash: newHash, tokenVersion: { increment: 1 } },
        });
        await tx.userSession.updateMany({
          where: { userId: record.userId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      });
    } catch (error) {
      if (error instanceof Error && (error as Error & { code?: string }).code === 'INVALID_RESET_TOKEN') {
        res.status(400).json({
          success: false,
          error: { message: 'Password reset token is invalid, expired or already used.', code: 'INVALID_RESET_TOKEN' },
        });
        return;
      }
      throw error;
    }

    await recordAuditLog({
      action: 'USER_PASSWORD_RESET',
      entityType: 'USER',
      entityId: record.userId,
      userId: record.createdById || record.userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { method: 'single_use_reset_token' },
    });

    res.json({ success: true, message: 'Password has been reset. Existing sessions were signed out.' });
  } catch (err) {
    next(err);
  }
}
