import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { prisma } from '../services/prisma';
import { getStorageProvider } from '../storage';
import { getAccessibleAppIds, getAccessibleProjectIds } from '../services/rbacService';

export async function getDashboardStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
      });
      return;
    }

    // ADMIN retains global statistics. Everyone else is scoped to the apps they can read.
    // App-scoped API tokens are additionally constrained to their own app.
    let accessibleAppIds: string[] | 'ALL' = 'ALL';
    if (req.user.role !== Role.ADMIN) {
      accessibleAppIds = await getAccessibleAppIds(req.user.id, req.user.role, 'VIEWER');
    }

    if (req.authMethod === 'api_token' && req.apiToken?.appId) {
      if (accessibleAppIds === 'ALL') {
        accessibleAppIds = [req.apiToken.appId];
      } else {
        accessibleAppIds = accessibleAppIds.filter((id) => id === req.apiToken?.appId);
      }
    }

    if (accessibleAppIds !== 'ALL' && accessibleAppIds.length === 0) {
      res.json({
        success: true,
        data: {
          totalApps: 0,
          totalReleases: 0,
          totalDownloads: 0,
          storageBytes: 0,
          channelCounts: { DEV: 0, QA: 0, STAGING: 0, BETA: 0, PRODUCTION: 0 },
          recentReleases: [],
          recentActivity: [],
        },
      });
      return;
    }

    const appWhere = accessibleAppIds === 'ALL' ? {} : { id: { in: accessibleAppIds } };
    const releaseWhere = accessibleAppIds === 'ALL' ? {} : { appId: { in: accessibleAppIds } };

    const [totalApps, totalReleases, downloadsAggregate, releasesByChannel, recentReleases, recentActivity] =
      await Promise.all([
        prisma.app.count({ where: appWhere }),
        prisma.release.count({ where: releaseWhere }),
        prisma.release.aggregate({
          where: releaseWhere,
          _sum: {
            downloadCount: true,
            fileSize: true,
          },
        }),
        prisma.release.groupBy({
          by: ['channel'],
          where: releaseWhere,
          _count: {
            id: true,
          },
        }),
        prisma.release.findMany({
          where: releaseWhere,
          take: 5,
          orderBy: { createdAt: 'desc' },
          include: {
            app: {
              select: { id: true, name: true, packageName: true },
            },
            uploadedBy: {
              select: { id: true, name: true },
            },
          },
        }),
        prisma.auditLog.findMany({
          where: accessibleAppIds === 'ALL' ? {} : { appId: { in: accessibleAppIds } },
          take: 10,
          orderBy: { createdAt: 'desc' },
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
            app: {
              select: { id: true, name: true },
            },
          },
        }),
      ]);

    const storage = getStorageProvider();
    let actualStorageUsed = downloadsAggregate._sum.fileSize || 0;
    if (accessibleAppIds === 'ALL') {
      try {
        // Filesystem total is only meaningful for administrators; non-admin scopes use the
        // sum of their authorized release sizes instead.
        actualStorageUsed = await storage.getTotalStorageUsed();
      } catch {
        // Fallback to DB sum if filesystem scan fails
      }
    }

    const channelCounts: Record<string, number> = {
      DEV: 0,
      QA: 0,
      STAGING: 0,
      BETA: 0,
      PRODUCTION: 0,
    };
    for (const group of releasesByChannel) {
      channelCounts[group.channel] = group._count.id;
    }

    res.json({
      success: true,
      data: {
        totalApps,
        totalReleases,
        totalDownloads: downloadsAggregate._sum.downloadCount || 0,
        storageBytes: actualStorageUsed,
        channelCounts,
        recentReleases,
        recentActivity,
      },
    });
  } catch (err) {
    next(err);
  }
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/**
 * Role-specific dashboard aggregates. Every figure is derived from the caller's
 * accessible projects/apps; administrators alone receive global user and security data.
 */
export async function getRoleDashboard(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
      return;
    }

    const isAdmin = req.user.role === Role.ADMIN && req.authMethod !== 'api_token';
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);

    let accessibleAppIds: string[] | 'ALL' = 'ALL';
    let accessibleProjectIds: string[] | 'ALL' = 'ALL';
    if (req.user.role !== Role.ADMIN) {
      [accessibleAppIds, accessibleProjectIds] = await Promise.all([
        getAccessibleAppIds(req.user.id, req.user.role, 'VIEWER'),
        getAccessibleProjectIds(req.user.id, req.user.role),
      ]);
    }
    if (req.authMethod === 'api_token' && req.apiToken?.appId) {
      const scoped = req.apiToken.appId;
      accessibleAppIds =
        accessibleAppIds === 'ALL' ? [scoped] : accessibleAppIds.filter((id) => id === scoped);
      accessibleProjectIds = 'ALL';
    }

    const appIdsEmpty = accessibleAppIds !== 'ALL' && accessibleAppIds.length === 0;
    const appWhere = accessibleAppIds === 'ALL' ? {} : { id: { in: accessibleAppIds } };
    const releaseWhere = accessibleAppIds === 'ALL' ? {} : { appId: { in: accessibleAppIds } };
    const appScope = accessibleAppIds === 'ALL' ? {} : { in: accessibleAppIds };
    const dateFilter = from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {};

    const storage = getStorageProvider();

    const [
      totalProjects,
      totalApps,
      totalUsers,
      totalReleases,
      pendingApprovals,
      downloadAggregate,
      storageAggregate,
      releasesByChannel,
      releasesByStatus,
      recentUploads,
      recentPublications,
      recentActivity,
      securityEvents,
      assignedProjects,
      qaReleases,
      pendingQaVerifications,
    ] = await Promise.all([
      isAdmin
        ? prisma.project.count()
        : accessibleProjectIds === 'ALL'
          ? prisma.project.count()
          : accessibleProjectIds.length,
      prisma.app.count({ where: appWhere }),
      isAdmin ? prisma.user.count() : Promise.resolve(null as number | null),
      prisma.release.count({ where: releaseWhere }),
      prisma.release.count({ where: { ...releaseWhere, status: 'PENDING_APPROVAL' } }),
      prisma.release.aggregate({ where: releaseWhere, _sum: { downloadCount: true, fileSize: true } }),
      prisma.release.aggregate({ where: releaseWhere, _sum: { fileSize: true } }),
      prisma.release.groupBy({ by: ['channel'], where: releaseWhere, _count: { id: true } }),
      prisma.release.groupBy({ by: ['status'], where: releaseWhere, _count: { id: true } }),
      appIdsEmpty
        ? Promise.resolve([])
        : prisma.release.findMany({
            where: { ...releaseWhere, ...dateFilter },
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: {
              app: { select: { id: true, name: true, packageName: true } },
              uploadedBy: { select: { id: true, name: true } },
            },
          }),
      appIdsEmpty
        ? Promise.resolve([])
        : prisma.release.findMany({
            where: { ...releaseWhere, status: 'PUBLISHED', publishedAt: { not: null } },
            take: 5,
            orderBy: { publishedAt: 'desc' },
            include: { app: { select: { id: true, name: true } } },
          }),
      appIdsEmpty && !isAdmin
        ? Promise.resolve([])
        : prisma.auditLog.findMany({
            where: {
              ...(accessibleAppIds === 'ALL' ? {} : { appId: appScope }),
              ...dateFilter,
            },
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, name: true } }, app: { select: { id: true, name: true } } },
          }),
      isAdmin
        ? prisma.auditLog.findMany({
            where: {
              OR: [
                { action: { startsWith: 'AUTH_' } },
                { action: { startsWith: 'USER_' } },
                { action: { startsWith: 'SESSION_' } },
                { action: { startsWith: 'SECURITY_' } },
              ],
              ...dateFilter,
            },
            take: 10,
            orderBy: { createdAt: 'desc' },
            include: { user: { select: { id: true, name: true } } },
          })
        : Promise.resolve([]),
      accessibleProjectIds === 'ALL'
        ? prisma.project.findMany({
            take: 8,
            orderBy: { updatedAt: 'desc' },
            include: { _count: { select: { apps: true } } },
          })
        : accessibleProjectIds.length === 0
          ? Promise.resolve([])
          : prisma.project.findMany({
              where: { id: { in: accessibleProjectIds } },
              take: 8,
              orderBy: { updatedAt: 'desc' },
              include: { _count: { select: { apps: true } } },
            }),
      appIdsEmpty
        ? Promise.resolve([])
        : prisma.release.findMany({
            where: {
              ...releaseWhere,
              channel: 'QA',
              status: { in: ['APPROVED', 'PUBLISHED'] },
            },
            take: 5,
            orderBy: { createdAt: 'desc' },
            include: { app: { select: { id: true, name: true } } },
          }),
      appIdsEmpty
        ? Promise.resolve(0)
        : prisma.release.count({
            where: {
              ...releaseWhere,
              channel: 'QA',
              status: { in: ['UPLOADED', 'PENDING_APPROVAL'] },
            },
          }),
    ]);

    const channelCounts: Record<string, number> = { DEV: 0, QA: 0, STAGING: 0, BETA: 0, PRODUCTION: 0 };
    for (const group of releasesByChannel) channelCounts[group.channel] = group._count.id;

    const statusCounts: Record<string, number> = {
      DRAFT: 0,
      UPLOADED: 0,
      PENDING_APPROVAL: 0,
      APPROVED: 0,
      PUBLISHED: 0,
      REJECTED: 0,
      DEPRECATED: 0,
      ARCHIVED: 0,
    };
    for (const group of releasesByStatus) statusCounts[group.status] = group._count.id;

    let storageBytes = storageAggregate._sum.fileSize || 0;
    if (isAdmin) {
      try {
        storageBytes = await storage.getTotalStorageUsed();
      } catch {
        // Database aggregate remains the fallback when the filesystem scan fails.
      }
    }

    res.json({
      success: true,
      data: {
        role: req.user.role,
        scope: accessibleAppIds === 'ALL' ? 'GLOBAL' : 'RESTRICTED',
        range: { from: from ? from.toISOString() : null, to: to ? to.toISOString() : null },
        totals: {
          projects: totalProjects,
          apps: totalApps,
          users: totalUsers,
          releases: totalReleases,
          pendingApprovals,
          downloads: downloadAggregate._sum.downloadCount || 0,
          storageBytes,
        },
        channelCounts,
        statusCounts,
        recentUploads,
        recentPublications,
        recentActivity,
        securityEvents,
        assignedProjects,
        qaReleases,
        pendingQaVerifications,
      },
    });
  } catch (err) {
    next(err);
  }
}
