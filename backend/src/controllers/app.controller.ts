import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../services/prisma';
import { getStorageProvider } from '../storage';
import { recordAuditLog } from '../services/auditService';
import { getAccessibleAppIds, canAccessProject, canAccessApp, getEffectiveAppRole } from '../services/rbacService';

const createAppSchema = z.object({
  name: z.string().min(2).max(100),
  packageName: z.string().min(3).max(150).regex(/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/, {
    message: 'Package name must be in reverse-domain format (e.g., com.example.app)',
  }),
  projectId: z.string().optional(),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().max(50000).optional(), // Can be data URI or image URL
  isPublic: z.boolean().optional(),
  publicSlug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Public slug must be lowercase letters, digits and hyphens.' })
    .optional()
    .nullable(),
});

const updateAppSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  projectId: z.string().optional(),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().max(50000).optional(),
  isPublic: z.boolean().optional(),
  publicSlug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'Public slug must be lowercase letters, digits and hyphens.' })
    .optional()
    .nullable(),
});

export async function listApps(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
    const projectIdQuery = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : undefined;
    const scopedAppId = req.apiToken?.appId;

    const where: Record<string, unknown> = {};

    if (scopedAppId) {
      where.id = scopedAppId;
    }

    if (req.user && req.user.role !== Role.ADMIN && req.authMethod !== 'api_token') {
      const accessibleAppIds = await getAccessibleAppIds(req.user.id, req.user.role, 'VIEWER');
      if (where.id) {
        if (!accessibleAppIds.includes(where.id as string)) {
          res.json({ success: true, data: [] });
          return;
        }
      } else {
        where.id = { in: accessibleAppIds };
      }
    }

    if (projectIdQuery) {
      const proj = await prisma.project.findFirst({
        where: { OR: [{ id: projectIdQuery }, { slug: projectIdQuery }] },
      });
      if (proj) {
        where.projectId = proj.id;
      } else {
        where.projectId = projectIdQuery;
      }
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
        project: {
          select: { id: true, name: true, slug: true },
        },
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
      projectId: app.projectId,
      project: app.project,
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

    if (req.user && req.user.role !== Role.ADMIN && req.authMethod !== 'api_token') {
      const isAllowed = await canAccessApp(req.user.id, req.user.role, appId, 'VIEWER');
      if (!isAllowed) {
        res.status(403).json({
          success: false,
          error: { message: 'Access denied. You do not have permission to view this application.', code: 'FORBIDDEN_RESOURCE_ACCESS' },
        });
        return;
      }
    }

    const app = await prisma.app.findUnique({
      where: { id: appId },
      include: {
        project: {
          select: { id: true, name: true, slug: true },
        },
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

    const effectiveRole = req.user
      ? await getEffectiveAppRole(req.user.id, req.user.role, app.id)
      : null;

    res.json({
      success: true,
      data: { ...app, effectiveRole },
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

    const requestedSlug =
      data.publicSlug ?? (data.isPublic ? data.packageName.replace(/\./g, '-').toLowerCase() : null);
    if (requestedSlug) {
      const slugTaken = await prisma.app.findUnique({ where: { publicSlug: requestedSlug } });
      if (slugTaken) {
        res.status(409).json({
          success: false,
          error: { message: `Public slug '${requestedSlug}' is already in use.`, code: 'PUBLIC_SLUG_TAKEN' },
        });
        return;
      }
    }

    // Resolve target project: if data.projectId is specified, verify it exists.
    // Otherwise fallback to system Default Project for backward compatibility.
    let targetProjectId = data.projectId;
    if (targetProjectId) {
      const proj = await prisma.project.findFirst({
        where: { OR: [{ id: targetProjectId }, { slug: targetProjectId }] },
      });
      if (!proj) {
        res.status(404).json({
          success: false,
          error: { message: `Target project '${targetProjectId}' not found.`, code: 'PROJECT_NOT_FOUND' },
        });
        return;
      }
      targetProjectId = proj.id;
    } else {
      let defaultProject = await prisma.project.findUnique({
        where: { slug: 'default-project' },
      });
      if (!defaultProject) {
        defaultProject = await prisma.project.create({
          data: {
            id: 'default-project-0000-0000-000000000000',
            name: 'Default Project',
            slug: 'default-project',
            description: 'System default project containing existing applications',
          },
        });
      }
      targetProjectId = defaultProject.id;
    }

    if (req.user && req.user.role !== Role.ADMIN) {
      const canDevelopInProject = await canAccessProject(req.user.id, req.user.role, targetProjectId, 'DEVELOPER');
      if (!canDevelopInProject) {
        res.status(403).json({
          success: false,
          error: {
            message: 'Access denied. You do not have DEVELOPER permission in the target project.',
            code: 'FORBIDDEN_RESOURCE_ACCESS',
          },
        });
        return;
      }
    }

    const app = await prisma.app.create({
      data: {
        projectId: targetProjectId,
        name: data.name,
        packageName: data.packageName,
        description: data.description,
        iconUrl: data.iconUrl,
        isPublic: data.isPublic ?? false,
        publicSlug: requestedSlug,
      },
      include: {
        project: {
          select: { id: true, name: true, slug: true },
        },
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
      details: { name: app.name, packageName: app.packageName, projectId: targetProjectId, isPublic: app.isPublic, publicSlug: app.publicSlug },
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

    // Public visibility is an administrative publication control.
    if ((data.isPublic !== undefined || data.publicSlug !== undefined) && req.user?.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: {
          message: 'Only administrators can change public portal visibility.',
          code: 'PUBLICATION_ADMIN_ONLY',
        },
      });
      return;
    }

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

    let nextProjectId = app.projectId;
    if (data.projectId && data.projectId !== app.projectId) {
      const proj = await prisma.project.findFirst({
        where: { OR: [{ id: data.projectId }, { slug: data.projectId }] },
      });
      if (!proj) {
        res.status(404).json({
          success: false,
          error: { message: `Target project '${data.projectId}' not found.`, code: 'PROJECT_NOT_FOUND' },
        });
        return;
      }
      nextProjectId = proj.id;
    }

    let nextSlug = data.publicSlug !== undefined ? data.publicSlug : app.publicSlug;
    const nextIsPublic = data.isPublic !== undefined ? data.isPublic : app.isPublic;
    if (nextIsPublic && !nextSlug) {
      nextSlug = app.packageName.replace(/\./g, '-').toLowerCase();
    }
    if (nextSlug && nextSlug !== app.publicSlug) {
      const slugTaken = await prisma.app.findFirst({
        where: { publicSlug: nextSlug, id: { not: app.id } },
        select: { id: true },
      });
      if (slugTaken) {
        res.status(409).json({
          success: false,
          error: { message: `Public slug '${nextSlug}' is already in use.`, code: 'PUBLIC_SLUG_TAKEN' },
        });
        return;
      }
    }

    const updated = await prisma.app.update({
      where: { id: appId },
      data: {
        name: data.name ?? app.name,
        projectId: nextProjectId,
        description: data.description ?? app.description,
        iconUrl: data.iconUrl !== undefined ? data.iconUrl : app.iconUrl,
        isPublic: nextIsPublic,
        publicSlug: nextSlug,
      },
      include: {
        project: {
          select: { id: true, name: true, slug: true },
        },
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
