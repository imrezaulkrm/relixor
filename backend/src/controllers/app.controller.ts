import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../services/prisma';
import { getStorageProvider } from '../storage';
import { recordAuditLog } from '../services/auditService';

const createAppSchema = z.object({
  name: z.string().min(2).max(100),
  packageName: z.string().min(3).max(150).regex(/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/, {
    message: 'Package name must be in reverse-domain format (e.g., com.example.app)',
  }),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().max(50000).optional(), // Can be data URI or image URL
});

const updateAppSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().max(50000).optional(),
});

export async function listApps(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    const scopedAppId = req.apiToken?.appId;

    const where: Record<string, unknown> = {};

    if (scopedAppId) {
      where.id = scopedAppId;
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { packageName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const apps = await prisma.app.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { releases: true },
        },
        releases: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            version: true,
            versionCode: true,
            channel: true,
            fileSize: true,
            createdAt: true,
          },
        },
      },
    });

    const formatted = apps.map((app) => ({
      id: app.id,
      name: app.name,
      packageName: app.packageName,
      description: app.description,
      iconUrl: app.iconUrl,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      releaseCount: app._count.releases,
      latestRelease: app.releases[0] || null,
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
}

export async function getAppById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId } = req.params;

    if (req.apiToken?.appId && req.apiToken.appId !== appId) {
      res.status(403).json({
        success: false,
        error: { message: 'Token is not authorized to access this app.', code: 'FORBIDDEN_SCOPE' },
      });
      return;
    }

    const app = await prisma.app.findUnique({
      where: { id: appId },
      include: {
        _count: {
          select: { releases: true },
        },
        releases: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
    });

    if (!app) {
      res.status(404).json({
        success: false,
        error: { message: 'Application not found', code: 'APP_NOT_FOUND' },
      });
      return;
    }

    res.json({
      success: true,
      data: app,
    });
  } catch (err) {
    next(err);
  }
}

export async function createApp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role === Role.VIEWER) {
      res.status(403).json({
        success: false,
        error: { message: 'Viewers have read-only access and cannot create applications.', code: 'FORBIDDEN' },
      });
      return;
    }

    if (req.apiToken?.appId) {
      res.status(403).json({
        success: false,
        error: { message: 'App-scoped API tokens cannot create new applications.', code: 'FORBIDDEN_APP_SCOPE' },
      });
      return;
    }

    const data = createAppSchema.parse(req.body);

    const existing = await prisma.app.findUnique({
      where: { packageName: data.packageName },
    });

    if (existing) {
      res.status(409).json({
        success: false,
        error: {
          message: `Application with package name '${data.packageName}' already exists.`,
          code: 'APP_EXISTS',
        },
      });
      return;
    }

    const app = await prisma.app.create({
      data: {
        name: data.name,
        packageName: data.packageName,
        description: data.description,
        iconUrl: data.iconUrl,
      },
    });

    await recordAuditLog({
      action: 'APP_CREATE',
      entityType: 'APP',
      entityId: app.id,
      userId: req.user?.id,
      appId: app.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { name: app.name, packageName: app.packageName },
    });

    res.status(201).json({
      success: true,
      data: app,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateApp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role === Role.VIEWER) {
      res.status(403).json({
        success: false,
        error: { message: 'Viewers have read-only access and cannot update applications.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { appId } = req.params;
    const data = updateAppSchema.parse(req.body);

    const app = await prisma.app.findUnique({
      where: { id: appId },
    });

    if (!app) {
      res.status(404).json({
        success: false,
        error: { message: 'Application not found', code: 'APP_NOT_FOUND' },
      });
      return;
    }

    const updated = await prisma.app.update({
      where: { id: appId },
      data: {
        name: data.name ?? app.name,
        description: data.description ?? app.description,
        iconUrl: data.iconUrl !== undefined ? data.iconUrl : app.iconUrl,
      },
    });

    await recordAuditLog({
      action: 'APP_UPDATE',
      entityType: 'APP',
      entityId: updated.id,
      userId: req.user?.id,
      appId: updated.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: data,
    });

    res.json({
      success: true,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteApp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Only administrators can delete applications.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { appId } = req.params;

    const app = await prisma.app.findUnique({
      where: { id: appId },
      include: { releases: true },
    });

    if (!app) {
      res.status(404).json({
        success: false,
        error: { message: 'Application not found', code: 'APP_NOT_FOUND' },
      });
      return;
    }

    // Delete stored APK files from storage
    const storage = getStorageProvider();
    for (const release of app.releases) {
      await storage.deleteFile(release.storageKey).catch(() => {});
    }

    await prisma.app.delete({
      where: { id: appId },
    });

    await recordAuditLog({
      action: 'APP_DELETE',
      entityType: 'APP',
      entityId: appId,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { name: app.name, packageName: app.packageName },
    });

    res.json({
      success: true,
      message: `Application '${app.name}' and all associated releases deleted successfully.`,
    });
  } catch (err) {
    next(err);
  }
}
