import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../services/prisma';
import { recordAuditLog } from '../services/auditService';
import { revokeAllSessions } from '../services/sessionService';

const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  password: z.string().min(8),
  role: z.nativeEnum(Role).default(Role.DEVELOPER),
});

const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.nativeEnum(Role).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

export async function listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || req.user.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Admin role required to manage users.', code: 'FORBIDDEN' },
      });
      return;
    }

    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            releases: true,
            tokens: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: users,
    });
  } catch (err) {
    next(err);
  }
}

export async function createUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || req.user.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Admin role required to manage users.', code: 'FORBIDDEN' },
      });
      return;
    }

    const data = createUserSchema.parse(req.body);
    const email = data.email.toLowerCase().trim();

    const existing = await prisma.user.findUnique({
      where: { email },
    });

    if (existing) {
      res.status(409).json({
        success: false,
        error: { message: `User with email '${email}' already exists.`, code: 'USER_EXISTS' },
      });
      return;
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        name: data.name.trim(),
        passwordHash,
        role: data.role,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    await recordAuditLog({
      action: 'USER_CREATE',
      entityType: 'USER',
      entityId: user.id,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { email: user.email, role: user.role, name: user.name },
    });

    res.status(201).json({
      success: true,
      data: user,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || req.user.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Admin role required to manage users.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { userId } = req.params;
    const data = updateUserSchema.parse(req.body);

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      res.status(404).json({
        success: false,
        error: { message: 'User not found', code: 'USER_NOT_FOUND' },
      });
      return;
    }

    // Prevent users from modifying their own role or active status
    if (req.user?.id === userId) {
      if (data.role !== undefined && data.role !== targetUser.role) {
        res.status(400).json({
          success: false,
          error: { message: 'You cannot change your own role.', code: 'CANNOT_MODIFY_OWN_ROLE' },
        });
        return;
      }
      if (data.isActive !== undefined && data.isActive !== targetUser.isActive) {
        res.status(400).json({
          success: false,
          error: { message: 'You cannot deactivate your own account.', code: 'CANNOT_DEACTIVATE_SELF' },
        });
        return;
      }
    }

    // Prevent deactivating or demoting the last active ADMIN
    if (
      (data.isActive === false || (data.role && data.role !== Role.ADMIN)) &&
      targetUser.role === Role.ADMIN
    ) {
      const activeAdminCount = await prisma.user.count({
        where: { role: Role.ADMIN, isActive: true },
      });
      if (activeAdminCount <= 1) {
        res.status(400).json({
          success: false,
          error: { message: 'Cannot deactivate or demote the last active Administrator.', code: 'LAST_ADMIN' },
        });
        return;
      }
    }

    const updatePayload: Record<string, unknown> = {};
    if (data.name) updatePayload.name = data.name.trim();
    if (data.role) updatePayload.role = data.role;
    if (data.isActive !== undefined) updatePayload.isActive = data.isActive;
    let revokeUserSessions = false;
    if (data.password) {
      updatePayload.passwordHash = await bcrypt.hash(data.password, 10);
      updatePayload.tokenVersion = { increment: 1 };
      revokeUserSessions = true;
    }
    if (data.isActive === false) {
      updatePayload.tokenVersion = { increment: 1 };
      revokeUserSessions = true;
    }
    if (data.role && data.role !== targetUser.role) {
      updatePayload.tokenVersion = { increment: 1 };
      revokeUserSessions = true;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updatePayload,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (revokeUserSessions) {
      await revokeAllSessions(userId);
    }

    await recordAuditLog({
      action: 'USER_UPDATE',
      entityType: 'USER',
      entityId: updated.id,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { ...data, password: data.password ? '[REDACTED]' : undefined },
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user || req.user.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Admin role required to manage users.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { userId } = req.params;

    if (req.user?.id === userId) {
      res.status(400).json({
        success: false,
        error: { message: 'You cannot delete your own account.', code: 'CANNOT_DELETE_SELF' },
      });
      return;
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      res.status(404).json({
        success: false,
        error: { message: 'User not found', code: 'USER_NOT_FOUND' },
      });
      return;
    }

    await prisma.user.delete({
      where: { id: userId },
    });

    await recordAuditLog({
      action: 'USER_DELETE',
      entityType: 'USER',
      entityId: userId,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { email: targetUser.email, name: targetUser.name },
    });

    res.json({
      success: true,
      message: `User '${targetUser.email}' has been deleted.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function listUserSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true } });
    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found', code: 'USER_NOT_FOUND' } });
      return;
    }

    const sessions = await prisma.userSession.findMany({
      where: { userId: req.params.userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    res.json({
      success: true,
      data: sessions.map((session) => ({
        id: session.id,
        createdAt: session.createdAt,
        lastSeenAt: session.lastSeenAt,
        expiresAt: session.expiresAt,
        revokedAt: session.revokedAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        active: session.revokedAt === null && session.expiresAt.getTime() > Date.now(),
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function revokeUserSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true, email: true } });
    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found', code: 'USER_NOT_FOUND' } });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { tokenVersion: { increment: 1 } },
    });
    const count = await revokeAllSessions(user.id);

    await recordAuditLog({
      action: 'SESSION_REVOKED',
      entityType: 'USER',
      entityId: user.id,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { revokedSessions: count, byAdmin: true },
    });

    res.json({ success: true, message: `Revoked ${count} active session(s).`, data: { revoked: count } });
  } catch (err) {
    next(err);
  }
}

export async function listUserActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.params.userId }, select: { id: true } });
    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found', code: 'USER_NOT_FOUND' } });
      return;
    }

    const [loginEvents, auditLogs] = await Promise.all([
      prisma.loginEvent.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
      }),
      prisma.auditLog.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          appId: true,
          ipAddress: true,
          createdAt: true,
        },
      }),
    ]);

    res.json({ success: true, data: { loginEvents, auditLogs } });
  } catch (err) {
    next(err);
  }
}

export async function issuePasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      select: { id: true, email: true, isActive: true },
    });
    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found', code: 'USER_NOT_FOUND' } });
      return;
    }

    const plaintext = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(plaintext).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        createdById: req.user?.id,
      },
    });

    await recordAuditLog({
      action: 'USER_PASSWORD_RESET_ISSUED',
      entityType: 'USER',
      entityId: user.id,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { targetEmail: user.email, expiresAt: expiresAt.toISOString() },
    });

    // The plaintext token is returned once and is never logged or persisted.
    res.status(201).json({
      success: true,
      data: { resetToken: plaintext, expiresAt: expiresAt.toISOString() },
      message: 'Share this single-use reset token securely. It expires in 60 minutes.',
    });
  } catch (err) {
    next(err);
  }
}
