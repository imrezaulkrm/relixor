import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../services/prisma';
import { recordAuditLog } from '../services/auditService';

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
    if (data.password) {
      updatePayload.passwordHash = await bcrypt.hash(data.password, 10);
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
