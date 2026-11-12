import { ReleaseChannel, ReleaseStatus } from '@prisma/client';
import { prisma } from './prisma';
import { getStorageProvider } from '../storage';
import { logger } from '../utils/logger';

export interface CleanupCandidate {
  id: string;
  appId: string;
  appName: string;
  projectName: string;
  version: string;
  versionCode: number;
  channel: ReleaseChannel;
  status: ReleaseStatus;
  isPinned: boolean;
  fileName: string;
  storageKey: string;
  fileSize: number;
  createdAt: Date;
  ageDays: number;
  retentionDays: number;
}

export interface CleanupPreview {
  candidates: CleanupCandidate[];
  protectedReleases: number;
  totalBytes: number;
  channels: Array<{
    channel: ReleaseChannel;
    retentionDays: number;
    enabled: boolean;
    candidates: number;
    bytes: number;
  }>;
}

const ACTIVE_WORKFLOW_STATUSES: ReleaseStatus[] = [
  ReleaseStatus.PENDING_APPROVAL,
  ReleaseStatus.APPROVED,
];

export function protectionReason(release: {
  channel: ReleaseChannel;
  status: ReleaseStatus;
  isPinned: boolean;
  storageKey: string;
  appId: string;
}): string | null {
  if (release.channel === ReleaseChannel.PRODUCTION) return 'production_channel';
  if (release.isPinned) return 'pinned';
  if (ACTIVE_WORKFLOW_STATUSES.includes(release.status)) return 'active_workflow';
  if (release.status === ReleaseStatus.ARCHIVED) return 'already_archived';
  if (!release.storageKey.startsWith(`apks/${release.appId}/`)) return 'unverified_storage_ownership';
  return null;
}

export async function getRetentionPolicies() {
  return prisma.retentionPolicy.findMany({ orderBy: { channel: 'asc' } });
}

export async function buildCleanupPreview(channelFilter?: ReleaseChannel): Promise<CleanupPreview> {
  const policies = await prisma.retentionPolicy.findMany();
  const activePolicies = policies.filter(
    (policy) => policy.enabled && policy.retentionDays > 0 && policy.channel !== ReleaseChannel.PRODUCTION
  );

  const policyByChannel = new Map(policies.map((policy) => [policy.channel, policy]));
  const candidates: CleanupCandidate[] = [];
  const channelSummary: CleanupPreview['channels'] = [];
  let protectedReleases = 0;

  for (const policy of activePolicies) {
    if (channelFilter && policy.channel !== channelFilter) continue;

    const cutoff = new Date(Date.now() - policy.retentionDays * 24 * 60 * 60 * 1000);
    const releases = await prisma.release.findMany({
      where: {
        channel: policy.channel,
        createdAt: { lt: cutoff },
        status: { notIn: [ReleaseStatus.ARCHIVED, ...ACTIVE_WORKFLOW_STATUSES] },
        isPinned: false,
      },
      include: {
        app: { select: { name: true, project: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    let channelBytes = 0;
    let channelCandidates = 0;

    for (const release of releases) {
      const reason = protectionReason(release);
      if (reason) {
        protectedReleases += 1;
        continue;
      }
      const ageDays = Math.floor((Date.now() - release.createdAt.getTime()) / (24 * 60 * 60 * 1000));
      candidates.push({
        id: release.id,
        appId: release.appId,
        appName: release.app.name,
        projectName: release.app.project.name,
        version: release.version,
        versionCode: release.versionCode,
        channel: release.channel,
        status: release.status,
        isPinned: release.isPinned,
        fileName: release.fileName,
        storageKey: release.storageKey,
        fileSize: release.fileSize,
        createdAt: release.createdAt,
        ageDays,
        retentionDays: policy.retentionDays,
      });
      channelBytes += release.fileSize;
      channelCandidates += 1;
    }

    channelSummary.push({
      channel: policy.channel,
      retentionDays: policy.retentionDays,
      enabled: policyByChannel.get(policy.channel)?.enabled ?? false,
      candidates: channelCandidates,
      bytes: channelBytes,
    });
  }

  return {
    candidates,
    protectedReleases,
    totalBytes: candidates.reduce((sum, candidate) => sum + candidate.fileSize, 0),
    channels: channelSummary,
  };
}

export interface CleanupExecutionResult {
  mode: 'DRY_RUN' | 'EXECUTE';
  considered: number;
  filesDeleted: number;
  bytesFreed: number;
  failures: Array<{ releaseId: string; reason: string }>;
  skipped: Array<{ releaseId: string; reason: string }>;
}

/**
 * Executes cleanup. Files are deleted only after ownership checks pass; release
 * metadata is preserved and the record is archived so history is not lost.
 */
export async function executeCleanup(
  mode: 'DRY_RUN' | 'EXECUTE',
  channelFilter: ReleaseChannel | undefined,
  actor: { userId?: string; ipAddress?: string; userAgent?: string }
): Promise<CleanupExecutionResult> {
  const preview = await buildCleanupPreview(channelFilter);
  const result: CleanupExecutionResult = {
    mode,
    considered: preview.candidates.length,
    filesDeleted: 0,
    bytesFreed: 0,
    failures: [],
    skipped: [],
  };

  if (mode === 'DRY_RUN') {
    await prisma.cleanupRun.create({
      data: {
        mode,
        channel: channelFilter || null,
        releasesConsidered: preview.candidates.length,
        releasesDeleted: 0,
        bytesFreed: 0,
        details: JSON.stringify({
          candidates: preview.candidates.map((candidate) => ({
            id: candidate.id,
            channel: candidate.channel,
            version: candidate.version,
            ageDays: candidate.ageDays,
            fileSize: candidate.fileSize,
          })),
          protectedReleases: preview.protectedReleases,
        }),
        executedById: actor.userId || null,
      },
    });
    return result;
  }

  const storage = getStorageProvider();

  for (const candidate of preview.candidates) {
    const reason = protectionReason(candidate);
    if (reason) {
      result.skipped.push({ releaseId: candidate.id, reason });
      continue;
    }

    try {
      const exists = await storage.fileExists(candidate.storageKey);
      if (!exists) {
        result.skipped.push({ releaseId: candidate.id, reason: 'file_missing' });
        await prisma.release.update({
          where: { id: candidate.id },
          data: { status: ReleaseStatus.ARCHIVED },
        });
        continue;
      }

      await storage.deleteFile(candidate.storageKey);
      await prisma.release.update({
        where: { id: candidate.id },
        data: { status: ReleaseStatus.ARCHIVED },
      });
      result.filesDeleted += 1;
      result.bytesFreed += candidate.fileSize;
    } catch (error) {
      logger.warn('Retention cleanup failed for release', { releaseId: candidate.id, error });
      result.failures.push({
        releaseId: candidate.id,
        reason: error instanceof Error ? error.message : 'unknown_error',
      });
    }
  }

  await prisma.cleanupRun.create({
    data: {
      mode,
      channel: channelFilter || null,
      releasesConsidered: preview.candidates.length,
      releasesDeleted: result.filesDeleted,
      bytesFreed: result.bytesFreed,
      details: JSON.stringify({
        failures: result.failures,
        skipped: result.skipped,
        protectedReleases: preview.protectedReleases,
      }),
      executedById: actor.userId || null,
    },
  });

  return result;
}

let schedulerTimer: NodeJS.Timeout | null = null;

export function startRetentionScheduler(intervalMinutes: number, allowDelete: boolean): void {
  if (schedulerTimer) return;
  const run = async () => {
    try {
      const result = await executeCleanup(allowDelete ? 'EXECUTE' : 'DRY_RUN', undefined, {
        userId: undefined,
        ipAddress: 'scheduler',
      });
      logger.info('Scheduled retention run completed', {
        mode: result.mode,
        considered: result.considered,
        deleted: result.filesDeleted,
      });
    } catch (error) {
      logger.error('Scheduled retention run failed', { error });
    }
  };
  schedulerTimer = setInterval(run, intervalMinutes * 60 * 1000);
  logger.info(`Retention scheduler enabled (${intervalMinutes} minute interval, delete=${allowDelete})`);
}
