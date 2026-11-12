import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../services/prisma';
import { canAccessApp } from '../services/rbacService';

export async function listAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
      });
      return;
    }

    if (req.user.role === Role.VIEWER) {
      res.status(403).json({
        success: false,
        error: { message: 'Access denied. Viewers are not authorized to view audit logs.', code: 'FORBIDDEN' },
      });
      return;
    }

    const appId = typeof req.query.appId === 'string' ? req.query.appId.trim() : undefined;

    // Check API token access
    if (req.authMethod === 'api_token') {
      if (!appId) {
        res.status(403).json({
          success: false,
          error: { message: 'Access denied. API tokens cannot access system-wide audit logs.', code: 'FORBIDDEN' },
        });
        return;
      }
      if (req.apiToken?.appId && req.apiToken.appId !== appId) {
        res.status(403).json({
          success: false,
          error: { message: 'API token is not authorized for this application.', code: 'FORBIDDEN_APP_SCOPE' },
        });
        return;
      }
    }

    // Only administrators can access system-wide audit logs
    if (req.user.role === Role.DEVELOPER) {
      if (!appId) {
        res.status(403).json({
          success: false,
          error: { message: 'Access denied. Only administrators can view system-wide audit logs.', code: 'FORBIDDEN' },
        });
        return;
      }

      const app = await prisma.app.findUnique({ where: { id: appId } });
      if (!app) {
        res.status(404).json({
          success: false,
          error: { message: 'Application not found', code: 'APP_NOT_FOUND' },
        });
        return;
      }

      // A supplied appId is not sufficient on its own: developers must have resource access.
      const allowed = await canAccessApp(req.user.id, req.user.role, appId, 'VIEWER');
      if (!allowed) {
        res.status(403).json({
          success: false,
          error: {
            message: 'Access denied. You do not have permission to view audit logs for this application.',
            code: 'FORBIDDEN_RESOURCE_ACCESS',
          },
        });
        return;
      }
    }

    // Global API tokens are evaluated against their owner's resource access, and app-scoped
    // tokens are confined to their own app.
    if (req.authMethod === 'api_token' && req.user.role !== Role.ADMIN) {
      const allowed = await canAccessApp(req.user.id, req.user.role, appId as string, 'VIEWER');
      if (!allowed) {
        res.status(403).json({
          success: false,
          error: {
            message: 'Access denied. Token owner does not have permission for this application.',
            code: 'FORBIDDEN_RESOURCE_ACCESS',
          },
        });
        return;
      }
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 25));
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : undefined;
    const entityType = typeof req.query.entityType === 'string' ? req.query.entityType.trim() : undefined;
    const entityId = typeof req.query.entityId === 'string' ? req.query.entityId.trim() : undefined;

    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (appId) where.appId = appId;
    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;

    const [total, logs] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true, email: true },
          },
          app: {
            select: { id: true, name: true, packageName: true },
          },
        },
      }),
    ]);

    res.json({
      success: true,
      data: {
        logs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}
