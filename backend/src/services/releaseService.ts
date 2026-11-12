import { Prisma, ReleaseStatus, ReleaseChannel, Role } from '@prisma/client';
import { prisma } from './prisma';

type Tx = Prisma.TransactionClient;

export const releaseInclude = {
  app: {
    select: {
      id: true,
      name: true,
      packageName: true,
      isPublic: true,
      publicSlug: true,
      projectId: true,
      project: { select: { id: true, name: true, slug: true } },
    },
  },
  uploadedBy: { select: { id: true, name: true, email: true } },
  approvedBy: { select: { id: true, name: true, email: true } },
  statusHistory: {
    orderBy: { createdAt: 'asc' as const },
    include: { changedBy: { select: { id: true, name: true } } },
  },
  qaVerifications: {
    orderBy: { updatedAt: 'desc' as const },
    include: { reviewer: { select: { id: true, name: true, email: true } } },
  },
} satisfies Prisma.ReleaseInclude;

export function isPubliclyDownloadable(release: {
  channel: ReleaseChannel;
  status: ReleaseStatus;
  publishedAt: Date | null;
}): boolean {
  return (
    release.channel === ReleaseChannel.PRODUCTION &&
    release.status === ReleaseStatus.PUBLISHED &&
    release.publishedAt !== null
  );
}

export async function transitionRelease(
  tx: Tx,
  releaseId: string,
  fromStatus: ReleaseStatus,
  toStatus: ReleaseStatus,
  userId: string | undefined,
  reason?: string
): Promise<void> {
  await tx.releaseStatusHistory.create({
    data: {
      releaseId,
      fromStatus,
      toStatus,
      changedById: userId,
      reason: reason || null,
    },
  });
}

/** Compare two semantic-ish versions. Returns >0 when left is newer. */
export function compareVersions(left: string, right: string): number {
  const parse = (v: string) =>
    v
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map((part) => {
        const n = parseInt(part, 10);
        return Number.isNaN(n) ? part : n;
      });
  const a = parse(left);
  const b = parse(right);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    if (a[i] === undefined) return -1;
    if (b[i] === undefined) return 1;
    if (typeof a[i] === 'number' && typeof b[i] === 'number') {
      if (a[i] !== b[i]) return (a[i] as number) - (b[i] as number);
    } else {
      const cmp = String(a[i]).localeCompare(String(b[i]));
      if (cmp !== 0) return cmp;
    }
  }
  return 0;
}

export async function findCurrentProductionRelease(appId: string) {
  return prisma.release.findFirst({
    where: { appId, channel: ReleaseChannel.PRODUCTION, status: ReleaseStatus.PUBLISHED },
    orderBy: [{ publishedAt: 'desc' }, { versionCode: 'desc' }],
    include: releaseInclude,
  });
}

export function canApprove(
  actor: { id: string; role: Role },
  release: { uploadedById: string | null },
  allowSelfApproval: boolean
): boolean {
  if (actor.role === Role.VIEWER) return false;
  if (actor.id === release.uploadedById && !allowSelfApproval && actor.role !== Role.ADMIN) {
    return false;
  }
  return true;
}
