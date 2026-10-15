import { Request, Response, NextFunction } from 'express';
import { prisma } from '../services/prisma';
import { getStorageProvider } from '../storage';

export async function getDashboardStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [totalApps, totalReleases, downloadsAggregate, releasesByChannel, recentReleases, recentActivity] =
      await Promise.all([
        prisma.app.count(),
        prisma.release.count(),
        prisma.release.aggregate({
          _sum: {
            downloadCount: true,
            fileSize: true,
          },
        }),
        prisma.release.groupBy({
          by: ['channel'],
          _count: {
            id: true,
          },
        }),
        prisma.release.findMany({
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
        // Fetch activity logs based on user role authorization
        req.user?.role === 'ADMIN'
          ? prisma.auditLog.findMany({
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
            })
          : req.user?.role === 'DEVELOPER'
          ? prisma.auditLog.findMany({
              where: { appId: { not: null } },
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
            })
          : Promise.resolve([]),
      ]);

    const storage = getStorageProvider();
    let actualStorageUsed = downloadsAggregate._sum.fileSize || 0;
    try {
      actualStorageUsed = await storage.getTotalStorageUsed();
    } catch {
      // Fallback to DB sum if filesystem scan fails
    }

    const channelCounts: Record<string, number> = {
      DEV: 0,
      QA: 0,
      STAGING: 0,
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
