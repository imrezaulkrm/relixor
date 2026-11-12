import { Role, MembershipRole } from '@prisma/client';
import { prisma } from './prisma';

export { MembershipRole };

/**
 * Resolves the effective project role for a user.
 * - Global ADMIN always resolves to 'ADMIN'.
 * - Direct ProjectMembership takes precedence.
 * - If user has an AppMembership in any child app, they receive 'VIEWER' to view the project container.
 * - Otherwise null (no access).
 */
export async function getEffectiveProjectRole(
  userId: string,
  userGlobalRole: Role,
  projectIdOrSlug: string
): Promise<'ADMIN' | MembershipRole | null> {
  if (userGlobalRole === Role.ADMIN) {
    return 'ADMIN';
  }

  const project = await prisma.project.findFirst({
    where: {
      OR: [{ id: projectIdOrSlug }, { slug: projectIdOrSlug }],
    },
    select: { id: true },
  });

  if (!project) return null;

  const directMembership = await prisma.projectMembership.findUnique({
    where: {
      project_user_unique: {
        projectId: project.id,
        userId,
      },
    },
  });

  if (directMembership) {
    return directMembership.role;
  }

  // Check if user has an app membership in any app in this project
  const childAppMembership = await prisma.appMembership.findFirst({
    where: {
      userId,
      app: { projectId: project.id },
    },
  });

  if (childAppMembership) {
    return MembershipRole.VIEWER;
  }

  return null;
}

/**
 * Resolves the effective application role for a user.
 * Deterministic Precedence Rules:
 * 1. Global ADMIN -> 'ADMIN'
 * 2. Direct AppMembership ALWAYS takes precedence over ProjectMembership.
 *    An explicit app-level assignment overrides project inheritance even when it is
 *    more restrictive (project DEVELOPER + app VIEWER => VIEWER) and even when it is
 *    more permissive (project VIEWER + app DEVELOPER => DEVELOPER).
 * 3. Otherwise inherit ProjectMembership.role.
 * 4. Neither exists -> null (Access denied)
 */
export async function getEffectiveAppRole(
  userId: string,
  userGlobalRole: Role,
  appId: string
): Promise<'ADMIN' | MembershipRole | null> {
  if (userGlobalRole === Role.ADMIN) {
    return 'ADMIN';
  }

  const app = await prisma.app.findUnique({
    where: { id: appId },
    select: { id: true, projectId: true },
  });

  if (!app) return null;

  const [appMembership, projMembership] = await Promise.all([
    prisma.appMembership.findUnique({
      where: {
        app_user_unique: {
          appId: app.id,
          userId,
        },
      },
    }),
    prisma.projectMembership.findUnique({
      where: {
        project_user_unique: {
          projectId: app.projectId,
          userId,
        },
      },
    }),
  ]);

  if (appMembership) {
    // Direct app assignment wins outright; never let project membership bypass it.
    return appMembership.role;
  }

  if (projMembership) {
    return projMembership.role;
  }

  return null;
}

export async function canAccessProject(
  userId: string,
  userGlobalRole: Role,
  projectIdOrSlug: string,
  minRole: 'VIEWER' | 'DEVELOPER' = 'VIEWER'
): Promise<boolean> {
  const role = await getEffectiveProjectRole(userId, userGlobalRole, projectIdOrSlug);
  if (!role) return false;
  if (role === 'ADMIN') return true;

  if (minRole === 'VIEWER') {
    return role === MembershipRole.VIEWER || role === MembershipRole.DEVELOPER;
  }
  return role === MembershipRole.DEVELOPER;
}

export async function canAccessApp(
  userId: string,
  userGlobalRole: Role,
  appId: string,
  minRole: 'VIEWER' | 'DEVELOPER' = 'VIEWER'
): Promise<boolean> {
  const role = await getEffectiveAppRole(userId, userGlobalRole, appId);
  if (!role) return false;
  if (role === 'ADMIN') return true;

  if (minRole === 'VIEWER') {
    return role === MembershipRole.VIEWER || role === MembershipRole.DEVELOPER;
  }
  return role === MembershipRole.DEVELOPER;
}

/**
 * Returns accessible project IDs for a user, or 'ALL' for administrators.
 */
export async function getAccessibleProjectIds(
  userId: string,
  userGlobalRole: Role
): Promise<string[] | 'ALL'> {
  if (userGlobalRole === Role.ADMIN) {
    return 'ALL';
  }

  const [projectMemberships, appMemberships] = await Promise.all([
    prisma.projectMembership.findMany({
      where: { userId },
      select: { projectId: true },
    }),
    prisma.appMembership.findMany({
      where: { userId },
      select: { app: { select: { projectId: true } } },
    }),
  ]);

  const idSet = new Set<string>();
  for (const pm of projectMemberships) {
    idSet.add(pm.projectId);
  }
  for (const am of appMemberships) {
    if (am.app?.projectId) {
      idSet.add(am.app.projectId);
    }
  }

  return Array.from(idSet);
}

/**
 * Returns accessible application IDs for a user, or 'ALL' for administrators.
 */
export async function getAccessibleAppIds(
  userId: string,
  userGlobalRole: Role,
  minRole: 'VIEWER' | 'DEVELOPER' = 'VIEWER'
): Promise<string[] | 'ALL'> {
  if (userGlobalRole === Role.ADMIN) {
    return 'ALL';
  }

  // Get all candidate apps from projects the user belongs to or apps user directly belongs to
  const [directApps, projectMemberships] = await Promise.all([
    prisma.appMembership.findMany({
      where: { userId },
      select: { appId: true },
    }),
    prisma.projectMembership.findMany({
      where: { userId },
      select: { projectId: true },
    }),
  ]);

  const candidateAppIds = new Set<string>();
  for (const da of directApps) {
    candidateAppIds.add(da.appId);
  }

  if (projectMemberships.length > 0) {
    const projApps = await prisma.app.findMany({
      where: {
        projectId: { in: projectMemberships.map((p) => p.projectId) },
      },
      select: { id: true },
    });
    for (const pa of projApps) {
      candidateAppIds.add(pa.id);
    }
  }

  // Filter candidate apps by effective role
  const accessibleAppIds: string[] = [];
  for (const appId of candidateAppIds) {
    const isAllowed = await canAccessApp(userId, userGlobalRole, appId, minRole);
    if (isAllowed) {
      accessibleAppIds.push(appId);
    }
  }

  return accessibleAppIds;
}
