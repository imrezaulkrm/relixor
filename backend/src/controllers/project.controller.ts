import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { prisma } from '../services/prisma';
import { recordAuditLog } from '../services/auditService';
import { getAccessibleProjectIds, getAccessibleAppIds, getEffectiveProjectRole } from '../services/rbacService';

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const createProjectSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(2, 'Slug must be at least 2 characters')
    .max(100)
    .regex(SLUG_REGEX, 'Slug must contain only lowercase alphanumeric characters and single hyphens'),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().max(50000).optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  slug: z
    .string()
    .min(2)
    .max(100)
    .regex(SLUG_REGEX, 'Slug must contain only lowercase alphanumeric characters and single hyphens')
    .optional(),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().max(50000).optional(),
});

const createAppInProjectSchema = z.object({
  name: z.string().min(2).max(100),
  packageName: z.string().min(3).max(150).regex(/^[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+$/, {
    message: 'Package name must be in reverse-domain format (e.g., com.example.app)',
  }),
  description: z.string().max(1000).optional(),
  iconUrl: z.string().max(50000).optional(),
});

export async function listProjects(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;

    const where: Record<string, unknown> = {};
    let accessibleAppIds: string[] | 'ALL' = 'ALL';

    if (req.user && req.user.role !== Role.ADMIN) {
      const accessibleProjectIds = await getAccessibleProjectIds(req.user.id, req.user.role);
      accessibleAppIds = await getAccessibleAppIds(req.user.id, req.user.role, 'VIEWER');
      where.id = { in: accessibleProjectIds === 'ALL' ? [] : accessibleProjectIds };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { slug: { contains: search, mode: 'insensitive' } },
      ];
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        apps: {
          where: accessibleAppIds === 'ALL' ? undefined : { id: { in: accessibleAppIds } },
          select: {
            id: true,
            _count: {
              select: { releases: true },
            },
          },
        },
      },
    });

    const formatted = projects.map((p) => {
      const releaseCount = p.apps.reduce((sum, app) => sum + app._count.releases, 0);
      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        iconUrl: p.iconUrl,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
        appCount: p.apps.length,
        releaseCount,
      };
    });

    res.json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
}

export async function getProjectById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findFirst({
      where: {
        OR: [{ id: projectId }, { slug: projectId }],
      },
      include: {
        _count: {
          select: { apps: true },
        },
        apps: {
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
        },
      },
    });

    if (!project) {
      res.status(404).json({
        success: false,
        error: { message: 'Project not found', code: 'PROJECT_NOT_FOUND' },
      });
      return;
    }

    // Non-admins may only see apps they are authorized for. A user inherited into the
    // project through a direct app membership must not see unrelated sibling apps.
    let visibleApps = project.apps;
    if (req.user && req.user.role !== Role.ADMIN) {
      const accessibleAppIds = await getAccessibleAppIds(req.user.id, req.user.role, 'VIEWER');
      if (accessibleAppIds !== 'ALL') {
        const allowed = new Set(accessibleAppIds);
        visibleApps = project.apps.filter((app) => allowed.has(app.id));
      }
    }

    const releaseCount = visibleApps.reduce((sum, app) => sum + app._count.releases, 0);

    const formattedApps = visibleApps.map((app) => ({
      id: app.id,
      name: app.name,
      packageName: app.packageName,
      description: app.description,
      iconUrl: app.iconUrl,
      projectId: project.id,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      releaseCount: app._count.releases,
      latestRelease: app.releases[0] || null,
    }));

    const effectiveRole = req.user
      ? await getEffectiveProjectRole(req.user.id, req.user.role, project.id)
      : null;

    res.json({
      success: true,
      data: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        description: project.description,
        iconUrl: project.iconUrl,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        appCount: visibleApps.length,
        releaseCount,
        effectiveRole,
        apps: formattedApps,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Only administrators can create projects.', code: 'FORBIDDEN' },
      });
      return;
    }

    const data = createProjectSchema.parse(req.body);

    const existingSlug = await prisma.project.findUnique({
      where: { slug: data.slug.toLowerCase().trim() },
    });

    if (existingSlug) {
      res.status(409).json({
        success: false,
        error: {
          message: `Project with slug '${data.slug}' already exists.`,
          code: 'PROJECT_SLUG_EXISTS',
        },
      });
      return;
    }

    const project = await prisma.project.create({
      data: {
        name: data.name.trim(),
        slug: data.slug.toLowerCase().trim(),
        description: data.description?.trim(),
        iconUrl: data.iconUrl,
      },
    });

    await recordAuditLog({
      action: 'PROJECT_CREATE',
      entityType: 'PROJECT',
      entityId: project.id,
      userId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { name: project.name, slug: project.slug },
    });

    res.status(201).json({
      success: true,
      data: project,
      message: `Project '${project.name}' created successfully.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Only administrators can update projects.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { projectId } = req.params;
    const data = updateProjectSchema.parse(req.body);

    const targetProject = await prisma.project.findFirst({
      where: {
        OR: [{ id: projectId }, { slug: projectId }],
      },
    });

    if (!targetProject) {
      res.status(404).json({
        success: false,
        error: { message: 'Project not found', code: 'PROJECT_NOT_FOUND' },
      });
      return;
    }

    // Preserve default-project slug
    if (targetProject.slug === 'default-project' && data.slug && data.slug !== 'default-project') {
      res.status(400).json({
        success: false,
        error: { message: 'Cannot rename the slug of the system Default Project.', code: 'CANNOT_MODIFY_DEFAULT_PROJECT_SLUG' },
      });
      return;
    }

    if (data.slug && data.slug !== targetProject.slug) {
      const slugCollision = await prisma.project.findUnique({
        where: { slug: data.slug.toLowerCase().trim() },
      });
      if (slugCollision) {
        res.status(409).json({
          success: false,
          error: {
            message: `Project with slug '${data.slug}' already exists.`,
            code: 'PROJECT_SLUG_EXISTS',
          },
        });
        return;
      }
    }

    const updated = await prisma.project.update({
      where: { id: targetProject.id },
      data: {
        name: data.name?.trim(),
        slug: data.slug?.toLowerCase().trim(),
        description: data.description !== undefined ? data.description.trim() : undefined,
        iconUrl: data.iconUrl !== undefined ? data.iconUrl : undefined,
      },
    });

    await recordAuditLog({
      action: 'PROJECT_UPDATE',
      entityType: 'PROJECT',
      entityId: updated.id,
      userId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { ...data },
    });

    res.json({
      success: true,
      data: updated,
      message: `Project '${updated.name}' updated successfully.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteProject(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Only administrators can delete projects.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { projectId } = req.params;

    const targetProject = await prisma.project.findFirst({
      where: {
        OR: [{ id: projectId }, { slug: projectId }],
      },
      include: {
        _count: { select: { apps: true } },
      },
    });

    if (!targetProject) {
      res.status(404).json({
        success: false,
        error: { message: 'Project not found', code: 'PROJECT_NOT_FOUND' },
      });
      return;
    }

    if (targetProject.slug === 'default-project') {
      res.status(400).json({
        success: false,
        error: { message: 'The system Default Project cannot be deleted.', code: 'CANNOT_DELETE_DEFAULT_PROJECT' },
      });
      return;
    }

    if (targetProject._count.apps > 0) {
      res.status(400).json({
        success: false,
        error: {
          message: `Cannot delete project '${targetProject.name}' because it contains ${targetProject._count.apps} application(s). Reassign or delete the applications first.`,
          code: 'PROJECT_NOT_EMPTY',
        },
      });
      return;
    }

    await prisma.project.delete({
      where: { id: targetProject.id },
    });

    await recordAuditLog({
      action: 'PROJECT_DELETE',
      entityType: 'PROJECT',
      entityId: targetProject.id,
      userId: req.user.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { name: targetProject.name, slug: targetProject.slug },
    });

    res.json({
      success: true,
      message: `Project '${targetProject.name}' has been deleted.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function listProjectApps(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { projectId } = req.params;

    const project = await prisma.project.findFirst({
      where: {
        OR: [{ id: projectId }, { slug: projectId }],
      },
    });

    if (!project) {
      res.status(404).json({
        success: false,
        error: { message: 'Project not found', code: 'PROJECT_NOT_FOUND' },
      });
      return;
    }

    const apps = await prisma.app.findMany({
      where: { projectId: project.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: { select: { releases: true } },
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

    let visibleApps = apps;
    if (req.user && req.user.role !== Role.ADMIN) {
      const accessibleAppIds = await getAccessibleAppIds(req.user.id, req.user.role, 'VIEWER');
      if (accessibleAppIds !== 'ALL') {
        const allowed = new Set(accessibleAppIds);
        visibleApps = apps.filter((app) => allowed.has(app.id));
      }
    }

    const formatted = visibleApps.map((app) => ({
      id: app.id,
      name: app.name,
      packageName: app.packageName,
      description: app.description,
      iconUrl: app.iconUrl,
      projectId: project.id,
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

export async function createProjectApp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role === Role.VIEWER) {
      res.status(403).json({
        success: false,
        error: { message: 'Viewers have read-only access and cannot create applications.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { projectId } = req.params;

    const project = await prisma.project.findFirst({
      where: {
        OR: [{ id: projectId }, { slug: projectId }],
      },
    });

    if (!project) {
      res.status(404).json({
        success: false,
        error: { message: 'Project not found', code: 'PROJECT_NOT_FOUND' },
      });
      return;
    }

    const data = createAppInProjectSchema.parse(req.body);

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
        projectId: project.id,
        name: data.name,
        packageName: data.packageName,
        description: data.description,
        iconUrl: data.iconUrl,
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
      details: { name: app.name, packageName: app.packageName, projectId: project.id },
    });

    res.status(201).json({
      success: true,
      data: app,
    });
  } catch (err) {
    next(err);
  }
}
