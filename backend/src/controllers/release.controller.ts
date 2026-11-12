import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { Role, ReleaseChannel, ReleaseStatus } from '@prisma/client';
import { prisma } from '../services/prisma';
import { getStorageProvider } from '../storage';
import { calculateFileSha256 } from '../utils/checksum';
import { validateApkFile } from '../utils/apkValidator';
import { recordAuditLog } from '../services/auditService';
import { logger } from '../utils/logger';
import { config } from '../config';
import {
  releaseInclude,
  transitionRelease,
  compareVersions,
  canApprove,
  isPubliclyDownloadable,
} from '../services/releaseService';
import { createDownloadTicket } from '../services/downloadTicket';
import { getAccessibleAppIds } from '../services/rbacService';

const CHANNELS: ReleaseChannel[] = [
  ReleaseChannel.DEV,
  ReleaseChannel.QA,
  ReleaseChannel.STAGING,
  ReleaseChannel.BETA,
  ReleaseChannel.PRODUCTION,
];

async function cleanupTemp(path?: string) {
  if (path) await fs.promises.unlink(path).catch(() => {});
}

function auditParams(req: Request, action: string, release: { id: string; appId: string }, details: Record<string, unknown>) {
  return {
    action,
    entityType: 'RELEASE',
    entityId: release.id,
    appId: release.appId,
    userId: req.user?.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    details,
  };
}

function parseBool(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.toLowerCase());
  return fallback;
}

export async function uploadRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  const tempFile = req.file;

  try {
    const { appId } = req.params;

    if (req.user?.role === Role.VIEWER) {
      await cleanupTemp(tempFile?.path);
      res.status(403).json({
        success: false,
        error: { message: 'Viewers have read-only access and cannot publish releases.', code: 'FORBIDDEN' },
      });
      return;
    }

    if (!tempFile) {
      res.status(400).json({
        success: false,
        error: { message: 'No APK file uploaded. Form field must be named "file".', code: 'MISSING_FILE' },
      });
      return;
    }

    const app = await prisma.app.findUnique({ where: { id: appId } });
    if (!app) {
      await cleanupTemp(tempFile.path);
      res.status(404).json({ success: false, error: { message: 'Application not found', code: 'APP_NOT_FOUND' } });
      return;
    }

    const version = req.body.version?.trim();
    const versionCode = parseInt(req.body.versionCode, 10);
    const minSupportedVersionCode = req.body.minSupportedVersionCode
      ? parseInt(req.body.minSupportedVersionCode, 10)
      : null;
    const releaseNotes = req.body.notes?.trim() || req.body.releaseNotes?.trim() || '';
    const channel = ((req.body.channel?.toUpperCase() || 'DEV') as ReleaseChannel);

    if (!version) {
      await cleanupTemp(tempFile.path);
      res.status(400).json({ success: false, error: { message: 'Field "version" is required (e.g. 1.0.0).', code: 'MISSING_VERSION' } });
      return;
    }
    if (!/^[a-zA-Z0-9_\-+.]+$/.test(version)) {
      await cleanupTemp(tempFile.path);
      res.status(400).json({ success: false, error: { message: 'Version format is invalid.', code: 'INVALID_VERSION_FORMAT' } });
      return;
    }
    if (Number.isNaN(versionCode) || versionCode < 1) {
      await cleanupTemp(tempFile.path);
      res.status(400).json({ success: false, error: { message: 'Field "versionCode" must be a positive integer.', code: 'INVALID_VERSION_CODE' } });
      return;
    }
    if (!CHANNELS.includes(channel)) {
      await cleanupTemp(tempFile.path);
      res.status(400).json({ success: false, error: { message: 'Invalid release channel.', code: 'INVALID_CHANNEL' } });
      return;
    }
    if (
      minSupportedVersionCode !== null &&
      (Number.isNaN(minSupportedVersionCode) || minSupportedVersionCode < 1)
    ) {
      await cleanupTemp(tempFile.path);
      res.status(400).json({
        success: false,
        error: { message: 'minSupportedVersionCode must be a positive integer.', code: 'INVALID_MIN_SUPPORTED_VERSION' },
      });
      return;
    }

    const existingRelease = await prisma.release.findUnique({
      where: { app_version_unique: { appId, version, versionCode } },
    });
    if (existingRelease) {
      await cleanupTemp(tempFile.path);
      res.status(409).json({
        success: false,
        error: {
          message: `Release version '${version}' with versionCode '${versionCode}' already exists for this app.`,
          code: 'DUPLICATE_RELEASE',
        },
      });
      return;
    }

    const versionCodeConflict = await prisma.release.findFirst({ where: { appId, versionCode } });
    if (versionCodeConflict) {
      await cleanupTemp(tempFile.path);
      res.status(409).json({
        success: false,
        error: {
          message: `Version code ${versionCode} is already used by version ${versionCodeConflict.version}. Version codes must be unique per application.`,
          code: 'VERSION_CODE_CONFLICT',
        },
      });
      return;
    }

    const validation = await validateApkFile(tempFile.path);
    if (!validation.isValid) {
      await cleanupTemp(tempFile.path);
      res.status(400).json({ success: false, error: { message: validation.error || 'Invalid APK file', code: 'INVALID_APK' } });
      return;
    }

    const sha256 = await calculateFileSha256(tempFile.path);
    const declaredSha256 = typeof req.body.sha256 === 'string' ? req.body.sha256.trim().toLowerCase() : '';
    if (declaredSha256 && declaredSha256 !== sha256) {
      await cleanupTemp(tempFile.path);
      res.status(400).json({
        success: false,
        error: {
          message: 'Declared SHA-256 does not match the uploaded APK content.',
          code: 'CHECKSUM_MISMATCH',
        },
      });
      return;
    }
    const storageKey = `apks/${appId}/${channel.toLowerCase()}_v${version}_vc${versionCode}_${sha256.substring(0, 8)}.apk`;
    const storage = getStorageProvider();
    const stored = await storage.saveFromTemp(tempFile.path, storageKey);

    const buildTimestampRaw = req.body.buildTimestamp;
    const parsedBuildTimestamp = buildTimestampRaw ? new Date(buildTimestampRaw) : null;

    try {
      const release = await prisma.$transaction(async (tx) => {
        const created = await tx.release.create({
          data: {
            appId,
            version,
            versionCode,
            channel,
            status: ReleaseStatus.UPLOADED,
            title: req.body.title?.trim() || `v${version}`,
            description: req.body.description?.trim() || null,
            releaseNotes,
            fileName: tempFile.originalname,
            storageKey: stored.key,
            fileSize: stored.size,
            sha256,
            isMandatory: parseBool(req.body.isMandatory),
            minSupportedVersionCode,
            gitCommitSha: req.body.gitCommitSha?.trim() || null,
            gitBranch: req.body.gitBranch?.trim() || null,
            gitlabPipelineId: req.body.gitlabPipelineId?.trim() || null,
            gitlabPipelineUrl: req.body.gitlabPipelineUrl?.trim() || null,
            buildTimestamp:
              parsedBuildTimestamp && !Number.isNaN(parsedBuildTimestamp.getTime())
                ? parsedBuildTimestamp
                : null,
            uploadedById: req.user?.id,
          },
          include: releaseInclude,
        });

        await transitionRelease(tx, created.id, ReleaseStatus.DRAFT, ReleaseStatus.UPLOADED, req.user?.id);
        await recordAuditLog(
          auditParams(req, 'RELEASE_UPLOAD', created, {
            appName: app.name,
            packageName: app.packageName,
            version: created.version,
            versionCode: created.versionCode,
            channel: created.channel,
            fileSize: created.fileSize,
            sha256: created.sha256,
          }),
          tx,
          true
        );
        await tx.app.update({ where: { id: appId }, data: { updatedAt: new Date() } });
        return tx.release.findUniqueOrThrow({ where: { id: created.id }, include: releaseInclude });
      });

      res.status(201).json({ success: true, data: release });
    } catch (err) {
      await storage.deleteFile(stored.key).catch(() => {});
      throw err;
    }
  } catch (err) {
    await cleanupTemp(tempFile?.path);
    next(err);
  }
}

export async function listReleases(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId } = req.params;
    const channelQuery = typeof req.query.channel === 'string' ? req.query.channel.toUpperCase() : undefined;
    const statusQuery = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '50'), 10) || 50));

    const where: Record<string, unknown> = { appId };
    if (channelQuery && CHANNELS.includes(channelQuery as ReleaseChannel)) where.channel = channelQuery;
    if (statusQuery && Object.values(ReleaseStatus).includes(statusQuery as ReleaseStatus)) where.status = statusQuery;
    if (search) {
      where.OR = [
        { version: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { releaseNotes: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [releases, total] = await Promise.all([
      prisma.release.findMany({
        where,
        orderBy: [{ versionCode: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: releaseInclude,
      }),
      prisma.release.count({ where }),
    ]);

    res.json({ success: true, data: releases, meta: { page, limit, total } });
  } catch (err) {
    next(err);
  }
}

export async function getReleaseById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, releaseId } = req.params;
    const release = await prisma.release.findFirst({
      where: { id: releaseId, appId },
      include: releaseInclude,
    });

    if (!release) {
      res.status(404).json({ success: false, error: { message: 'Release not found', code: 'RELEASE_NOT_FOUND' } });
      return;
    }

    res.json({ success: true, data: release });
  } catch (err) {
    next(err);
  }
}

export async function updateRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, releaseId } = req.params;
    const release = await prisma.release.findFirst({ where: { id: releaseId, appId } });
    if (!release) {
      res.status(404).json({ success: false, error: { message: 'Release not found', code: 'RELEASE_NOT_FOUND' } });
      return;
    }

    const data: Record<string, unknown> = {};
    if (typeof req.body.title === 'string') data.title = req.body.title.trim().slice(0, 200);
    if (typeof req.body.description === 'string') data.description = req.body.description.trim();
    if (typeof req.body.releaseNotes === 'string') data.releaseNotes = req.body.releaseNotes.trim();
    if (typeof req.body.isMandatory === 'boolean') data.isMandatory = req.body.isMandatory;
    if (typeof req.body.isPinned === 'boolean') data.isPinned = req.body.isPinned;
    if (req.body.minSupportedVersionCode !== undefined) {
      const value = parseInt(req.body.minSupportedVersionCode, 10);
      data.minSupportedVersionCode = Number.isNaN(value) || value < 0 ? null : value;
    }

    if (Object.keys(data).length === 0) {
      res.status(400).json({ success: false, error: { message: 'No editable fields supplied.', code: 'NO_CHANGES' } });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.release.update({ where: { id: release.id }, data, include: releaseInclude });
      await recordAuditLog(
        auditParams(req, 'RELEASE_UPDATE', changed, { version: changed.version, fields: Object.keys(data) }),
        tx,
        true
      );
      return changed;
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

async function getReleaseOr404(req: Request, res: Response) {
  const release = await prisma.release.findFirst({
    where: { id: req.params.releaseId, appId: req.params.appId },
    include: releaseInclude,
  });
  if (!release) {
    res.status(404).json({ success: false, error: { message: 'Release not found', code: 'RELEASE_NOT_FOUND' } });
  }
  return release;
}

export async function submitRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const release = await getReleaseOr404(req, res);
    if (!release) return;
    const submittable: ReleaseStatus[] = [ReleaseStatus.UPLOADED, ReleaseStatus.REJECTED, ReleaseStatus.DRAFT];
    if (!submittable.includes(release.status)) {
      res.status(409).json({
        success: false,
        error: { message: `Release in status ${release.status} cannot be submitted for approval.`, code: 'INVALID_TRANSITION' },
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.release.update({
        where: { id: release.id },
        data: { status: ReleaseStatus.PENDING_APPROVAL, rejectionReason: null },
        include: releaseInclude,
      });
      await transitionRelease(tx, release.id, release.status, ReleaseStatus.PENDING_APPROVAL, req.user?.id);
      await recordAuditLog(
        auditParams(req, 'RELEASE_SUBMIT_APPROVAL', changed, {
          version: changed.version,
          channel: changed.channel,
          fromStatus: release.status,
        }),
        tx,
        true
      );
      return tx.release.findUniqueOrThrow({ where: { id: changed.id }, include: releaseInclude });
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function approveRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
      return;
    }
    const release = await getReleaseOr404(req, res);
    if (!release) return;

    if (release.status !== ReleaseStatus.PENDING_APPROVAL) {
      res.status(409).json({
        success: false,
        error: { message: `Only PENDING_APPROVAL releases can be approved (current: ${release.status}).`, code: 'INVALID_TRANSITION' },
      });
      return;
    }
    if (!canApprove(req.user, release, config.allowSelfApproval)) {
      res.status(403).json({
        success: false,
        error: {
          message: 'Developers cannot approve their own release under the current approval policy.',
          code: 'SELF_APPROVAL_FORBIDDEN',
        },
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.release.update({
        where: { id: release.id },
        data: {
          status: ReleaseStatus.APPROVED,
          approvedById: req.user?.id,
          approvedAt: new Date(),
          rejectionReason: null,
        },
        include: releaseInclude,
      });
      await transitionRelease(tx, release.id, release.status, ReleaseStatus.APPROVED, req.user?.id);
      await recordAuditLog(
        auditParams(req, 'RELEASE_APPROVE', changed, {
          version: changed.version,
          channel: changed.channel,
          approvedBy: req.user?.email,
        }),
        tx,
        true
      );
      return tx.release.findUniqueOrThrow({ where: { id: changed.id }, include: releaseInclude });
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function rejectRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const release = await getReleaseOr404(req, res);
    if (!release) return;
    const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
    if (!reason) {
      res.status(400).json({ success: false, error: { message: 'A rejection reason is required.', code: 'REASON_REQUIRED' } });
      return;
    }
    if (release.status !== ReleaseStatus.PENDING_APPROVAL) {
      res.status(409).json({
        success: false,
        error: { message: `Only PENDING_APPROVAL releases can be rejected (current: ${release.status}).`, code: 'INVALID_TRANSITION' },
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.release.update({
        where: { id: release.id },
        data: { status: ReleaseStatus.REJECTED, rejectionReason: reason },
        include: releaseInclude,
      });
      await transitionRelease(tx, release.id, release.status, ReleaseStatus.REJECTED, req.user?.id, reason);
      await recordAuditLog(
        auditParams(req, 'RELEASE_REJECT', changed, { version: changed.version, channel: changed.channel, reason }),
        tx,
        true
      );
      return tx.release.findUniqueOrThrow({ where: { id: changed.id }, include: releaseInclude });
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function publishRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const release = await getReleaseOr404(req, res);
    if (!release) return;

    if (release.status !== ReleaseStatus.APPROVED) {
      res.status(409).json({
        success: false,
        error: {
          message: 'Production publication requires an approved release. Submit for approval and obtain approval first.',
          code: 'APPROVAL_REQUIRED',
        },
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      // Only one PUBLISHED production release per app: deprecate the previous one.
      if (release.channel === ReleaseChannel.PRODUCTION) {
        const previous = await tx.release.findFirst({
          where: {
            appId: release.appId,
            channel: ReleaseChannel.PRODUCTION,
            status: ReleaseStatus.PUBLISHED,
            id: { not: release.id },
          },
        });
        if (previous) {
          await tx.release.update({ where: { id: previous.id }, data: { status: ReleaseStatus.DEPRECATED } });
          await transitionRelease(tx, previous.id, ReleaseStatus.PUBLISHED, ReleaseStatus.DEPRECATED, req.user?.id, 'Superseded by newer production release');
        }
      }

      const changed = await tx.release.update({
        where: { id: release.id },
        data: { status: ReleaseStatus.PUBLISHED, publishedAt: new Date() },
        include: releaseInclude,
      });
      await transitionRelease(tx, release.id, release.status, ReleaseStatus.PUBLISHED, req.user?.id);
      await recordAuditLog(
        auditParams(req, 'RELEASE_PUBLISH', changed, {
          version: changed.version,
          channel: changed.channel,
          approvedBy: changed.approvedBy?.email,
          public: changed.app.isPublic,
        }),
        tx,
        true
      );
      return tx.release.findUniqueOrThrow({ where: { id: changed.id }, include: releaseInclude });
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function deprecateRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const release = await getReleaseOr404(req, res);
    if (!release) return;
    const deprecatable: ReleaseStatus[] = [ReleaseStatus.PUBLISHED, ReleaseStatus.APPROVED];
    if (!deprecatable.includes(release.status)) {
      res.status(409).json({
        success: false,
        error: { message: `Release in status ${release.status} cannot be deprecated.`, code: 'INVALID_TRANSITION' },
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.release.update({
        where: { id: release.id },
        data: { status: ReleaseStatus.DEPRECATED },
        include: releaseInclude,
      });
      await transitionRelease(tx, release.id, release.status, ReleaseStatus.DEPRECATED, req.user?.id);
      await recordAuditLog(
        auditParams(req, 'RELEASE_DEPRECATE', changed, { version: changed.version, channel: changed.channel }),
        tx,
        true
      );
      return tx.release.findUniqueOrThrow({ where: { id: changed.id }, include: releaseInclude });
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function promoteRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const release = await getReleaseOr404(req, res);
    if (!release) return;
    const target = String(req.body.channel || '').toUpperCase() as ReleaseChannel;
    if (!CHANNELS.includes(target)) {
      res.status(400).json({ success: false, error: { message: 'Invalid target channel.', code: 'INVALID_CHANNEL' } });
      return;
    }
    if (target === release.channel) {
      res.status(400).json({ success: false, error: { message: 'Release is already in that channel.', code: 'SAME_CHANNEL' } });
      return;
    }
    if (release.status === ReleaseStatus.ARCHIVED) {
      res.status(409).json({ success: false, error: { message: 'Archived releases cannot be promoted.', code: 'INVALID_TRANSITION' } });
      return;
    }

    const nextStatus = target === ReleaseChannel.PRODUCTION ? ReleaseStatus.PENDING_APPROVAL : ReleaseStatus.UPLOADED;

    const updated = await prisma.$transaction(async (tx) => {
      const changed = await tx.release.update({
        where: { id: release.id },
        data: {
          channel: target,
          status: nextStatus,
          approvedById: null,
          approvedAt: null,
          publishedAt: null,
          rejectionReason: null,
        },
        include: releaseInclude,
      });
      await transitionRelease(
        tx,
        release.id,
        release.status,
        nextStatus,
        req.user?.id,
        `Promoted ${release.channel} → ${target}`
      );
      await recordAuditLog(
        auditParams(req, 'RELEASE_PROMOTE', changed, {
          version: changed.version,
          fromChannel: release.channel,
          toChannel: target,
          requiresApproval: target === ReleaseChannel.PRODUCTION,
        }),
        tx,
        true
      );
      return tx.release.findUniqueOrThrow({ where: { id: changed.id }, include: releaseInclude });
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function rollbackRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId } = req.params;
    const current = await prisma.release.findFirst({
      where: { appId, channel: ReleaseChannel.PRODUCTION, status: ReleaseStatus.PUBLISHED },
      orderBy: { publishedAt: 'desc' },
    });

    const candidate = await prisma.release.findFirst({
      where: {
        appId,
        channel: ReleaseChannel.PRODUCTION,
        status: { in: [ReleaseStatus.PUBLISHED, ReleaseStatus.DEPRECATED] },
        publishedAt: { not: null },
        ...(current ? { id: { not: current.id } } : {}),
      },
      orderBy: [{ publishedAt: 'desc' }, { versionCode: 'desc' }],
    });

    if (!candidate) {
      res.status(404).json({
        success: false,
        error: { message: 'No previous production release is available for rollback.', code: 'NO_ROLLBACK_TARGET' },
      });
      return;
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (current) {
        await tx.release.update({ where: { id: current.id }, data: { status: ReleaseStatus.DEPRECATED } });
        await transitionRelease(tx, current.id, ReleaseStatus.PUBLISHED, ReleaseStatus.DEPRECATED, req.user?.id, 'Rolled back');
      }
      const restored = await tx.release.update({
        where: { id: candidate.id },
        data: { status: ReleaseStatus.PUBLISHED, publishedAt: new Date() },
        include: releaseInclude,
      });
      await transitionRelease(tx, candidate.id, candidate.status, ReleaseStatus.PUBLISHED, req.user?.id, 'Rollback target');
      await recordAuditLog(
        auditParams(req, 'RELEASE_ROLLBACK', restored, {
          version: restored.version,
          versionCode: restored.versionCode,
          previousVersion: current?.version || null,
        }),
        tx,
        true
      );
      return tx.release.findUniqueOrThrow({ where: { id: restored.id }, include: releaseInclude });
    });

    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

export async function getCurrentProductionRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId } = req.params;
    const release = await prisma.release.findFirst({
      where: { appId, channel: ReleaseChannel.PRODUCTION, status: ReleaseStatus.PUBLISHED },
      orderBy: [{ publishedAt: 'desc' }, { versionCode: 'desc' }],
      include: releaseInclude,
    });
    res.json({ success: true, data: release });
  } catch (err) {
    next(err);
  }
}

export async function compareReleases(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId } = req.params;
    const leftId = String(req.query.left || '');
    const rightId = String(req.query.right || '');
    if (!leftId || !rightId) {
      res.status(400).json({
        success: false,
        error: { message: 'Both "left" and "right" release IDs are required.', code: 'MISSING_RELEASE_IDS' },
      });
      return;
    }
    const [left, right] = await Promise.all([
      prisma.release.findFirst({ where: { id: leftId, appId }, include: releaseInclude }),
      prisma.release.findFirst({ where: { id: rightId, appId }, include: releaseInclude }),
    ]);
    if (!left || !right) {
      res.status(404).json({ success: false, error: { message: 'One or both releases were not found for this app.', code: 'RELEASE_NOT_FOUND' } });
      return;
    }

    const cmp = compareVersions(left.version, right.version);
    res.json({
      success: true,
      data: {
        left,
        right,
        newer: cmp > 0 ? 'left' : cmp < 0 ? 'right' : 'equal',
        versionCodeDelta: left.versionCode - right.versionCode,
        sizeDelta: left.fileSize - right.fileSize,
        fileSizeChanged: left.sha256 !== right.sha256,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createReleaseDownloadTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const release = await getReleaseOr404(req, res);
    if (!release) return;
    const isPublic = release.app.isPublic && isPubliclyDownloadable(release);
    if (!isPublic) {
      res.status(409).json({
        success: false,
        error: {
          message:
            'This release is not publicly downloadable. Use the authenticated download endpoint for internal artifacts.',
          code: 'NOT_PUBLICLY_DOWNLOADABLE',
        },
      });
      return;
    }

    const issued = await createDownloadTicket(release.id, release.appId, req.user?.id);
    res.json({
      success: true,
      data: {
        ticket: issued.ticket,
        expiresInSeconds: issued.expiresInSeconds,
        expiresAt: issued.expiresAt.toISOString(),
        downloadPath: `/api/v1/downloads/${issued.ticket}`,
        public: true,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function downloadRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, releaseId } = req.params;
    const release = await prisma.release.findFirst({
      where: { id: releaseId, appId },
      include: { app: true },
    });

    if (!release) {
      res.status(404).json({ success: false, error: { message: 'Release not found', code: 'RELEASE_NOT_FOUND' } });
      return;
    }

    await streamRelease(req, res, release, 'RELEASE_DOWNLOAD');
  } catch (err) {
    next(err);
  }
}

export async function streamRelease(
  req: Request,
  res: Response,
  release: {
    id: string;
    appId: string;
    app: { name: string };
    storageKey: string;
    fileName: string;
    fileSize: number;
    sha256: string;
    version: string;
    channel: string;
  },
  action: string
): Promise<void> {
  const storage = getStorageProvider();
  const stream = await storage.getFileStream(release.storageKey);

  prisma.release
    .update({ where: { id: release.id }, data: { downloadCount: { increment: 1 } } })
    .catch((e) => logger.warn('Failed to increment download count', { error: e }));

  recordAuditLog({
    action,
    entityType: 'RELEASE',
    entityId: release.id,
    appId: release.appId,
    userId: req.user?.id,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    details: { appName: release.app.name, version: release.version, channel: release.channel },
  }).catch(() => {});

  const safeFilename = release.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
  res.setHeader('Content-Length', release.fileSize.toString());
  res.setHeader('X-Checksum-SHA256', release.sha256);
  res.setHeader('Cache-Control', 'private, max-age=0, must-revalidate');
  stream.pipe(res);
}

export async function deleteRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.user?.role === Role.VIEWER) {
      res.status(403).json({ success: false, error: { message: 'Viewers cannot delete releases.', code: 'FORBIDDEN' } });
      return;
    }

    const { appId, releaseId } = req.params;
    const release = await prisma.release.findFirst({ where: { id: releaseId, appId }, include: { app: true } });

    if (!release) {
      res.status(404).json({ success: false, error: { message: 'Release not found', code: 'RELEASE_NOT_FOUND' } });
      return;
    }

    if (release.isPinned) {
      res.status(409).json({ success: false, error: { message: 'Pinned releases must be unpinned before deletion.', code: 'RELEASE_PINNED' } });
      return;
    }

    if (release.channel === ReleaseChannel.PRODUCTION && release.status === ReleaseStatus.PUBLISHED) {
      res.status(409).json({
        success: false,
        error: {
          message: 'The current production release cannot be deleted. Deprecate it or publish a replacement first.',
          code: 'PROTECTED_RELEASE',
        },
      });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await recordAuditLog(
        auditParams(req, 'RELEASE_DELETE', release, {
          appName: release.app.name,
          version: release.version,
          versionCode: release.versionCode,
          channel: release.channel,
        }),
        tx,
        true
      );
      await tx.release.delete({ where: { id: release.id } });
    });

    const storage = getStorageProvider();
    await storage.deleteFile(release.storageKey).catch((e) => logger.warn('Could not delete storage file', { error: e }));

    res.json({ success: true, message: `Release version ${release.version} (${release.channel}) deleted successfully.` });
  } catch (err) {
    next(err);
  }
}

/**
 * Global release catalog, scoped to the apps the caller may read.
 * Supports project/app/channel/status/version/search filters, sorting and pagination.
 */
export async function listAllReleases(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
      return;
    }

    let accessibleAppIds: string[] | 'ALL' = 'ALL';
    if (req.user.role !== Role.ADMIN) {
      accessibleAppIds = await getAccessibleAppIds(req.user.id, req.user.role, 'VIEWER');
    }
    if (req.authMethod === 'api_token' && req.apiToken?.appId) {
      accessibleAppIds =
        accessibleAppIds === 'ALL'
          ? [req.apiToken.appId]
          : accessibleAppIds.filter((id) => id === req.apiToken?.appId);
    }

    const appIdQuery = typeof req.query.appId === 'string' ? req.query.appId.trim() : undefined;
    const projectQuery = typeof req.query.projectId === 'string' ? req.query.projectId.trim() : undefined;
    const channelQuery = typeof req.query.channel === 'string' ? req.query.channel.toUpperCase() : undefined;
    const statusQuery = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : undefined;
    const versionQuery = typeof req.query.version === 'string' ? req.query.version.trim() : undefined;
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '25'), 10) || 25));
    const sortBy = ['createdAt', 'versionCode', 'publishedAt', 'downloadCount'].includes(String(req.query.sortBy))
      ? String(req.query.sortBy)
      : 'createdAt';
    const order = String(req.query.order).toLowerCase() === 'asc' ? 'asc' : 'desc';

    const where: Record<string, unknown> = {};
    if (accessibleAppIds !== 'ALL') {
      if (accessibleAppIds.length === 0) {
        res.json({ success: true, data: [], meta: { page, limit, total: 0 } });
        return;
      }
      where.appId = { in: accessibleAppIds };
    }
    if (appIdQuery) where.appId = appIdQuery;
    if (projectQuery) where.app = { projectId: projectQuery };
    if (channelQuery && CHANNELS.includes(channelQuery as ReleaseChannel)) where.channel = channelQuery;
    if (statusQuery && Object.values(ReleaseStatus).includes(statusQuery as ReleaseStatus)) where.status = statusQuery;
    if (versionQuery) where.version = { contains: versionQuery, mode: 'insensitive' };
    if (search) {
      where.OR = [
        { version: { contains: search, mode: 'insensitive' } },
        { title: { contains: search, mode: 'insensitive' } },
        { releaseNotes: { contains: search, mode: 'insensitive' } },
        { app: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const [releases, total] = await Promise.all([
      prisma.release.findMany({
        where,
        orderBy: { [sortBy]: order },
        skip: (page - 1) * limit,
        take: limit,
        include: releaseInclude,
      }),
      prisma.release.count({ where }),
    ]);

    res.json({ success: true, data: releases, meta: { page, limit, total } });
  } catch (err) {
    next(err);
  }
}
