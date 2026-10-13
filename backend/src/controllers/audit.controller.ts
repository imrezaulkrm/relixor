import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/prisma';

export async function listAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 25));
    const action = typeof req.query.action === 'string' ? req.query.action.trim() : undefined;
    const appId = typeof req.query.appId === 'string' ? req.query.appId.trim() : undefined;

    const where: Record<string, unknown> = {};
    if (action) where.action = action;
    if (appId) where.appId = appId;

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
