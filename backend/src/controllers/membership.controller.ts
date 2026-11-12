import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Role, MembershipRole } from '@prisma/client';
import { prisma } from '../services/prisma';
import { recordAuditLog } from '../services/auditService';
import { getEffectiveAppRole } from '../services/rbacService';

const assignMemberSchema = z.object({
  userId: z.string().uuid('Invalid user ID format'),
  role: z.nativeEnum(MembershipRole).default(MembershipRole.DEVELOPER),
});

const updateMemberRoleSchema = z.object({
  role: z.nativeEnum(MembershipRole),
});

// ==========================================
// PROJECT MEMBERSHIP CONTROLLERS
// ==========================================

export async function listProjectMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
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

    const members = await prisma.projectMembership.findMany({
      where: { projectId: project.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, isActive: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const formatted = members.map((m) => ({
      id: m.id,
      projectId: m.projectId,
      userId: m.userId,
      user: m.user,
      role: m.role,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      createdBy: m.createdBy,
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
}

export async function assignProjectMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Only administrators can assign project memberships.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { projectId } = req.params;
    const { userId, role } = assignMemberSchema.parse(req.body);

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

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      res.status(404).json({
        success: false,
        error: { message: 'Target user not found', code: 'USER_NOT_FOUND' },
      });
      return;
    }

    const existingMembership = await prisma.projectMembership.findUnique({
      where: {
        project_user_unique: {
          projectId: project.id,
          userId,
        },
      },
    });

    if (existingMembership) {
      res.status(409).json({
        success: false,
        error: {
          message: `User '${targetUser.email}' is already a member of this project with role '${existingMembership.role}'.`,
          code: 'MEMBER_ALREADY_EXISTS',
        },
      });
      return;
    }

    const membership = await prisma.$transaction(async (tx) => {
      const created = await tx.projectMembership.create({
        data: {
          projectId: project.id,
          userId: targetUser.id,
          role,
          createdById: req.user!.id,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
          createdBy: {
            select: { id: true, name: true },
          },
        },
      });

      await recordAuditLog(
        {
          action: 'PROJECT_MEMBER_ASSIGNED',
          entityType: 'PROJECT_MEMBERSHIP',
          entityId: created.id,
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          details: {
            projectId: project.id,
            projectName: project.name,
            targetUserId: targetUser.id,
            targetUserEmail: targetUser.email,
            assignedRole: role,
          },
        },
        tx,
        true
      );

      return created;
    });

    res.status(201).json({
      success: true,
      data: membership,
      message: `User '${targetUser.email}' successfully assigned to project '${project.name}' as ${role}.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateProjectMemberRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Only administrators can update project memberships.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { projectId, userId } = req.params;
    const { role } = updateMemberRoleSchema.parse(req.body);

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

    const updated = await prisma.$transaction(async (tx) => {
      const membership = await tx.projectMembership.findUnique({
        where: {
          project_user_unique: {
            projectId: project.id,
            userId,
          },
        },
      });

      if (!membership) return null;

      const previousRole = membership.role;
      const next = await tx.projectMembership.update({
        where: { id: membership.id },
        data: { role },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      await recordAuditLog(
        {
          action: 'PROJECT_MEMBER_ROLE_UPDATED',
          entityType: 'PROJECT_MEMBERSHIP',
          entityId: next.id,
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          details: {
            projectId: project.id,
            projectName: project.name,
            targetUserId: userId,
            previousRole,
            newRole: role,
          },
        },
        tx,
        true
      );

      return next;
    });

    if (!updated) {
      res.status(404).json({
        success: false,
        error: { message: 'Project membership not found for this user', code: 'MEMBERSHIP_NOT_FOUND' },
      });
      return;
    }

    res.json({
      success: true,
      data: updated,
      message: `Membership role updated to ${role}.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function removeProjectMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Only administrators can remove project memberships.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { projectId, userId } = req.params;

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

    const removed = await prisma.$transaction(async (tx) => {
      const membership = await tx.projectMembership.findUnique({
        where: {
          project_user_unique: {
            projectId: project.id,
            userId,
          },
        },
        include: {
          user: { select: { id: true, email: true } },
        },
      });

      if (!membership) return null;

      await tx.projectMembership.delete({
        where: { id: membership.id },
      });

      await recordAuditLog(
        {
          action: 'PROJECT_MEMBER_REMOVED',
          entityType: 'PROJECT_MEMBERSHIP',
          entityId: membership.id,
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          details: {
            projectId: project.id,
            projectName: project.name,
            targetUserId: userId,
            targetUserEmail: membership.user.email,
            revokedRole: membership.role,
          },
        },
        tx,
        true
      );

      return membership;
    });

    if (!removed) {
      res.status(404).json({
        success: false,
        error: { message: 'Project membership not found for this user', code: 'MEMBERSHIP_NOT_FOUND' },
      });
      return;
    }

    res.json({
      success: true,
      message: `User '${removed.user.email}' removed from project '${project.name}'.`,
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// APP MEMBERSHIP CONTROLLERS
// ==========================================

export async function listAppMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId } = req.params;

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

    const members = await prisma.appMembership.findMany({
      where: { appId: app.id },
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, name: true, email: true, role: true, isActive: true },
        },
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    const formatted = members.map((m) => ({
      id: m.id,
      appId: m.appId,
      userId: m.userId,
      user: m.user,
      role: m.role,
      createdAt: m.createdAt,
      updatedAt: m.updatedAt,
      createdBy: m.createdBy,
    }));

    res.json({
      success: true,
      data: formatted,
    });
  } catch (err) {
    next(err);
  }
}

export async function assignAppMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Only administrators can assign application memberships.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { appId } = req.params;
    const { userId, role } = assignMemberSchema.parse(req.body);

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

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!targetUser) {
      res.status(404).json({
        success: false,
        error: { message: 'Target user not found', code: 'USER_NOT_FOUND' },
      });
      return;
    }

    const existingMembership = await prisma.appMembership.findUnique({
      where: {
        app_user_unique: {
          appId: app.id,
          userId,
        },
      },
    });

    if (existingMembership) {
      res.status(409).json({
        success: false,
        error: {
          message: `User '${targetUser.email}' is already directly assigned to this application with role '${existingMembership.role}'.`,
          code: 'MEMBER_ALREADY_EXISTS',
        },
      });
      return;
    }

    const membership = await prisma.$transaction(async (tx) => {
      const created = await tx.appMembership.create({
        data: {
          appId: app.id,
          userId: targetUser.id,
          role,
          createdById: req.user!.id,
        },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
          createdBy: {
            select: { id: true, name: true },
          },
        },
      });

      await recordAuditLog(
        {
          action: 'APP_MEMBER_ASSIGNED',
          entityType: 'APP_MEMBERSHIP',
          entityId: created.id,
          userId: req.user!.id,
          appId: app.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          details: {
            appId: app.id,
            appName: app.name,
            targetUserId: targetUser.id,
            targetUserEmail: targetUser.email,
            assignedRole: role,
          },
        },
        tx,
        true
      );

      return created;
    });

    res.status(201).json({
      success: true,
      data: membership,
      message: `User '${targetUser.email}' successfully assigned to application '${app.name}' as ${role}.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateAppMemberRole(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Only administrators can update application memberships.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { appId, userId } = req.params;
    const { role } = updateMemberRoleSchema.parse(req.body);

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

    const updated = await prisma.$transaction(async (tx) => {
      const membership = await tx.appMembership.findUnique({
        where: {
          app_user_unique: {
            appId: app.id,
            userId,
          },
        },
      });

      if (!membership) return null;

      const previousRole = membership.role;
      const next = await tx.appMembership.update({
        where: { id: membership.id },
        data: { role },
        include: {
          user: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      });

      await recordAuditLog(
        {
          action: 'APP_MEMBER_ROLE_UPDATED',
          entityType: 'APP_MEMBERSHIP',
          entityId: next.id,
          userId: req.user!.id,
          appId: app.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          details: {
            appId: app.id,
            appName: app.name,
            targetUserId: userId,
            previousRole,
            newRole: role,
          },
        },
        tx,
        true
      );

      return next;
    });

    if (!updated) {
      res.status(404).json({
        success: false,
        error: { message: 'Application membership not found for this user', code: 'MEMBERSHIP_NOT_FOUND' },
      });
      return;
    }

    res.json({
      success: true,
      data: updated,
      message: `Membership role updated to ${role}.`,
    });
  } catch (err) {
    next(err);
  }
}

export async function removeAppMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Only administrators can remove application memberships.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { appId, userId } = req.params;

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

    const removed = await prisma.$transaction(async (tx) => {
      const membership = await tx.appMembership.findUnique({
        where: {
          app_user_unique: {
            appId: app.id,
            userId,
          },
        },
        include: {
          user: { select: { id: true, email: true } },
        },
      });

      if (!membership) return null;

      await tx.appMembership.delete({
        where: { id: membership.id },
      });

      await recordAuditLog(
        {
          action: 'APP_MEMBER_REMOVED',
          entityType: 'APP_MEMBERSHIP',
          entityId: membership.id,
          userId: req.user!.id,
          appId: app.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          details: {
            appId: app.id,
            appName: app.name,
            targetUserId: userId,
            targetUserEmail: membership.user.email,
            revokedRole: membership.role,
          },
        },
        tx,
        true
      );

      return membership;
    });

    if (!removed) {
      res.status(404).json({
        success: false,
        error: { message: 'Application membership not found for this user', code: 'MEMBERSHIP_NOT_FOUND' },
      });
      return;
    }

    res.json({
      success: true,
      message: `User '${removed.user.email}' removed from application '${app.name}'.`,
    });
  } catch (err) {
    next(err);
  }
}

// ==========================================
// USER ACCESS OVERVIEW CONTROLLER
// ==========================================

export async function getUserAccessOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role !== Role.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Only administrators can inspect user access overviews.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { userId } = req.params;

    const targetUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, isActive: true },
    });

    if (!targetUser) {
      res.status(404).json({
        success: false,
        error: { message: 'User not found', code: 'USER_NOT_FOUND' },
      });
      return;
    }

    const [projectMemberships, appMemberships] = await Promise.all([
      prisma.projectMembership.findMany({
        where: { userId },
        include: {
          project: { select: { id: true, name: true, slug: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.appMembership.findMany({
        where: { userId },
        include: {
          app: {
            select: {
              id: true,
              name: true,
              packageName: true,
              projectId: true,
              project: { select: { id: true, name: true, slug: true } },
            },
          },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Build effective permissions for all apps the user is connected to
    const appAccessMap = new Map<string, any>();

    // 1. Direct app memberships
    for (const am of appMemberships) {
      appAccessMap.set(am.appId, {
        appId: am.appId,
        appName: am.app.name,
        packageName: am.app.packageName,
        projectId: am.app.projectId,
        projectName: am.app.project.name,
        directRole: am.role,
        projectRole: null,
        effectiveRole: am.role,
        assignedAt: am.createdAt,
      });
    }

    // 2. Apps under project memberships
    for (const pm of projectMemberships) {
      const projApps = await prisma.app.findMany({
        where: { projectId: pm.projectId },
        select: { id: true, name: true, packageName: true, projectId: true },
      });

      for (const pa of projApps) {
        if (appAccessMap.has(pa.id)) {
          const existing = appAccessMap.get(pa.id);
          existing.projectRole = pm.role;
          // Direct app membership takes precedence over project inheritance.
          existing.effectiveRole = existing.directRole;
        } else {
          appAccessMap.set(pa.id, {
            appId: pa.id,
            appName: pa.name,
            packageName: pa.packageName,
            projectId: pa.projectId,
            projectName: pm.project.name,
            directRole: null,
            projectRole: pm.role,
            effectiveRole: pm.role,
            assignedAt: pm.createdAt,
          });
        }
      }
    }

    res.json({
      success: true,
      data: {
        user: targetUser,
        isGlobalAdmin: targetUser.role === Role.ADMIN,
        projects: projectMemberships.map((pm) => ({
          projectId: pm.projectId,
          projectName: pm.project.name,
          projectSlug: pm.project.slug,
          role: pm.role,
          assignedAt: pm.createdAt,
          assignedBy: pm.createdBy,
        })),
        apps: Array.from(appAccessMap.values()),
      },
    });
  } catch (err) {
    next(err);
  }
}
