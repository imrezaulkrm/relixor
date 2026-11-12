import { Request, Response, NextFunction } from 'express';
import { ReleaseChannel, ReleaseStatus } from '@prisma/client';
import { prisma } from '../services/prisma';
import { config } from '../config';
import { getStorageProvider } from '../storage';
import { recordAuditLog } from '../services/auditService';
import {
  buildCleanupPreview,
  executeCleanup,
  getRetentionPolicies,
  protectionReason,
} from '../services/retentionService';

export async function listRetentionPolicies(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ success: true, data: await getRetentionPolicies() });
  } catch (err) {
    next(err);
  }
}

export async function updateRetentionPolicy(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = String(req.params.channel || '').toUpperCase() as ReleaseChannel;
    if (!Object.values(ReleaseChannel).includes(channel)) {
      res.status(400).json({ success: false, error: { message: 'Invalid release channel.', code: 'INVALID_CHANNEL' } });
      return;
    }

    const retentionDays = Number(req.body.retentionDays);
    if (!Number.isInteger(retentionDays) || retentionDays < 0 || retentionDays > 3650) {
      res.status(400).json({
        success: false,
        error: { message: 'retentionDays must be an integer between 0 and 3650.', code: 'INVALID_RETENTION_DAYS' },
      });
      return;
    }
    if (typeof req.body.enabled !== 'boolean') {
      res.status(400).json({
        success: false,
        error: { message: 'enabled must be a boolean.', code: 'INVALID_ENABLED' },
      });
      return;
    }

    if (channel === ReleaseChannel.PRODUCTION) {
      res.status(400).json({
        success: false,
        error: {
          message: 'Production artifacts are never deleted automatically. This policy cannot be enabled.',
          code: 'PRODUCTION_RETENTION_FORBIDDEN',
        },
      });
      return;
    }

    const policy = await prisma.retentionPolicy.upsert({
      where: { channel },
      create: { channel, retentionDays, enabled: req.body.enabled },
      update: { retentionDays, enabled: req.body.enabled },
    });

    await recordAuditLog({
      action: 'RETENTION_POLICY_UPDATED',
      entityType: 'RETENTION_POLICY',
      entityId: policy.id,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { channel, retentionDays, enabled: req.body.enabled },
    });

    res.json({ success: true, data: policy });
  } catch (err) {
    next(err);
  }
}

export async function previewCleanup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channelRaw = typeof req.query.channel === 'string' ? req.query.channel.toUpperCase() : '';
    const channel = Object.values(ReleaseChannel).includes(channelRaw as ReleaseChannel)
      ? (channelRaw as ReleaseChannel)
      : undefined;

    const preview = await buildCleanupPreview(channel);

    await recordAuditLog({
      action: 'RETENTION_CLEANUP_PREVIEW',
      entityType: 'RETENTION',
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        channel: channel || null,
        candidates: preview.candidates.length,
        bytes: preview.totalBytes,
      },
    });

    res.json({
      success: true,
      data: {
        ...preview,
        deletionEnabled: config.retention.allowDelete,
        defaultMode: 'DRY_RUN',
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function runCleanup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const modeRaw = String(req.body.mode || 'DRY_RUN').toUpperCase();
    if (!['DRY_RUN', 'EXECUTE'].includes(modeRaw)) {
      res.status(400).json({
        success: false,
        error: { message: 'mode must be DRY_RUN or EXECUTE.', code: 'INVALID_CLEANUP_MODE' },
      });
      return;
    }

    if (modeRaw === 'EXECUTE' && !config.retention.allowDelete) {
      res.status(403).json({
        success: false,
        error: {
          message: 'Artifact deletion is disabled. Set RETENTION_ALLOW_DELETE=true to enable explicit cleanup execution.',
          code: 'RETENTION_EXECUTION_DISABLED',
        },
      });
      return;
    }

    const channelRaw = typeof req.body.channel === 'string' ? req.body.channel.toUpperCase() : '';
    const channel = Object.values(ReleaseChannel).includes(channelRaw as ReleaseChannel)
      ? (channelRaw as ReleaseChannel)
      : undefined;

    if (channel === ReleaseChannel.PRODUCTION) {
      res.status(400).json({
        success: false,
        error: { message: 'Production artifacts are protected from cleanup.', code: 'PRODUCTION_PROTECTED' },
      });
      return;
    }

    const result = await executeCleanup(modeRaw as 'DRY_RUN' | 'EXECUTE', channel, {
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    await recordAuditLog({
      action: modeRaw === 'EXECUTE' ? 'RETENTION_CLEANUP_EXECUTE' : 'RETENTION_CLEANUP_DRY_RUN',
      entityType: 'RETENTION',
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        channel: channel || null,
        considered: result.considered,
        filesDeleted: result.filesDeleted,
        bytesFreed: result.bytesFreed,
        failures: result.failures.length,
      },
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

export async function listCleanupHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const runs = await prisma.cleanupRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { executedBy: { select: { id: true, name: true, email: true } } },
    });
    res.json({ success: true, data: runs });
  } catch (err) {
    next(err);
  }
}

export async function getRetentionStorageStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const [policies, byChannel, totalAggregate, releases, pinnedCount, productionCount] = await Promise.all([
      getRetentionPolicies(),
      prisma.release.groupBy({ by: ['channel'], _count: { id: true }, _sum: { fileSize: true } }),
      prisma.release.aggregate({ _count: { id: true }, _sum: { fileSize: true } }),
      prisma.release.findMany({
        where: { status: { notIn: [ReleaseStatus.ARCHIVED] } },
        select: { channel: true, status: true, isPinned: true, appId: true, storageKey: true },
      }),
      prisma.release.count({ where: { isPinned: true } }),
      prisma.release.count({ where: { channel: ReleaseChannel.PRODUCTION } }),
    ]);

    const protectedCount = releases.filter((release) => protectionReason(release) !== null).length;

    let diskBytes = 0;
    try {
      diskBytes = await getStorageProvider().getTotalStorageUsed();
    } catch {
      diskBytes = totalAggregate._sum.fileSize || 0;
    }

    res.json({
      success: true,
      data: {
        policies,
        deletionEnabled: config.retention.allowDelete,
        totals: {
          releases: totalAggregate._count.id,
          releaseBytes: totalAggregate._sum.fileSize || 0,
          diskBytes,
          protectedReleases: protectedCount,
          pinnedReleases: pinnedCount,
          productionReleases: productionCount,
        },
        byChannel: byChannel.map((group) => ({
          channel: group.channel,
          releases: group._count.id,
          bytes: group._sum.fileSize || 0,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}
