import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../services/prisma';
import { recordAuditLog } from '../services/auditService';
import { revokeSession } from '../services/sessionService';

const updateProfileSchema = z.object({
  name: z.string().min(2).max(100),
});

export async function getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: { id: true, email: true, name: true, role: true, isActive: true, createdAt: true, updatedAt: true },
    });
    if (!user) {
      res.status(404).json({ success: false, error: { message: 'User not found', code: 'NOT_FOUND' } });
      return;
    }

    const [projectMemberships, appMemberships] = await Promise.all([
      prisma.projectMembership.findMany({
        where: { userId: user.id },
        include: { project: { select: { id: true, name: true, slug: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.appMembership.findMany({
        where: { userId: user.id },
        include: { app: { select: { id: true, name: true, packageName: true, projectId: true } } },
        orderBy: { createdAt: 'asc' },
      }),
    ]);

    res.json({
      success: true,
      data: {
        user,
        projects: projectMemberships.map((membership) => ({
          projectId: membership.projectId,
          project: membership.project,
          role: membership.role,
          assignedAt: membership.createdAt,
        })),
        apps: appMemberships.map((membership) => ({
          appId: membership.appId,
          app: membership.app,
          role: membership.role,
          assignedAt: membership.createdAt,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      return;
    }
    if (req.authMethod === 'api_token') {
      res.status(403).json({
        success: false,
        error: { message: 'Profile changes require an interactive user session.', code: 'FORBIDDEN' },
      });
      return;
    }

    const data = updateProfileSchema.parse(req.body);
    // Role, email, isActive and passwordHash are intentionally not editable here.
    const updated = await prisma.user.update({
      where: { id: req.user.id },
      data: { name: data.name.trim() },
      select: { id: true, email: true, name: true, role: true, isActive: true, updatedAt: true },
    });

    await recordAuditLog({
      action: 'USER_PROFILE_UPDATE',
      entityType: 'USER',
      entityId: updated.id,
      userId: updated.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { name: updated.name },
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function listOwnSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      return;
    }

    const sessions = await prisma.userSession.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
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
        current: session.id === req.sessionId,
        active: session.revokedAt === null && session.expiresAt.getTime() > Date.now(),
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function revokeOwnSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      return;
    }

    const revoked = await revokeSession(req.params.sessionId, req.user.id);
    if (!revoked) {
      res.status(404).json({ success: false, error: { message: 'Active session not found.', code: 'SESSION_NOT_FOUND' } });
      return;
    }

    await recordAuditLog({
      action: 'SESSION_REVOKED',
      entityType: 'USER',
      entityId: req.user.id,
      userId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { sessionId: req.params.sessionId, self: true },
    });

    res.json({ success: true, message: 'Session revoked.' });
  } catch (err) {
    next(err);
  }
}

export async function listOwnActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Unauthorized', code: 'UNAUTHORIZED' } });
      return;
    }

    const [loginEvents, auditLogs] = await Promise.all([
      prisma.loginEvent.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.auditLog.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
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
