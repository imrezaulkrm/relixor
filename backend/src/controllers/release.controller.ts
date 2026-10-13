import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { ReleaseChannel } from '@prisma/client';
import { prisma } from '../services/prisma';
import { getStorageProvider } from '../storage';
import { calculateFileSha256 } from '../utils/checksum';
import { validateApkFile } from '../utils/apkValidator';
import { recordAuditLog } from '../services/auditService';
import { logger } from '../utils/logger';

export async function uploadRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  const tempFile = req.file;

  try {
    const { appId } = req.params;

    if (!tempFile) {
      res.status(400).json({
        success: false,
        error: { message: 'No APK file uploaded. Form field must be named "file".', code: 'MISSING_FILE' },
      });
      return;
    }

    // Verify App exists
    const app = await prisma.app.findUnique({
      where: { id: appId },
    });

    if (!app) {
      // Clean up temp file
      if (tempFile.path) await fs.promises.unlink(tempFile.path).catch(() => {});
      res.status(404).json({
        success: false,
        error: { message: 'Application not found', code: 'APP_NOT_FOUND' },
      });
      return;
    }

    const version = req.body.version?.trim();
    const rawVersionCode = req.body.versionCode;
    const versionCode = parseInt(rawVersionCode, 10);
    const releaseNotes = req.body.notes?.trim() || req.body.releaseNotes?.trim() || '';

    let channel = (req.body.channel?.toUpperCase() || 'DEV') as ReleaseChannel;
    if (!['DEV', 'QA', 'STAGING', 'PRODUCTION'].includes(channel)) {
      channel = ReleaseChannel.DEV;
    }

    if (!version) {
      if (tempFile.path) await fs.promises.unlink(tempFile.path).catch(() => {});
      res.status(400).json({
        success: false,
        error: { message: 'Field "version" is required (e.g. 1.0.0).', code: 'MISSING_VERSION' },
      });
      return;
    }

    if (!/^[a-zA-Z0-9_\-+.]+$/.test(version)) {
      if (tempFile.path) await fs.promises.unlink(tempFile.path).catch(() => {});
      res.status(400).json({
        success: false,
        error: { message: 'Version format is invalid. Only alphanumeric characters, dots, hyphens, and plus signs are allowed.', code: 'INVALID_VERSION_FORMAT' },
      });
      return;
    }

    if (isNaN(versionCode) || versionCode < 1) {
      if (tempFile.path) await fs.promises.unlink(tempFile.path).catch(() => {});
      res.status(400).json({
        success: false,
        error: { message: 'Field "versionCode" must be a positive integer.', code: 'INVALID_VERSION_CODE' },
      });
      return;
    }

    // Check for duplicate release (prevent accidental duplicate overwrite)
    const existingRelease = await prisma.release.findUnique({
      where: {
        app_version_unique: {
          appId,
          version,
          versionCode,
        },
      },
    });

    if (existingRelease) {
      if (tempFile.path) await fs.promises.unlink(tempFile.path).catch(() => {});
      res.status(409).json({
        success: false,
        error: {
          message: `Release version '${version}' with versionCode '${versionCode}' already exists for this app.`,
          code: 'DUPLICATE_RELEASE',
        },
      });
      return;
    }

    // Validate APK signature
    const validation = await validateApkFile(tempFile.path);
    if (!validation.isValid) {
      if (tempFile.path) await fs.promises.unlink(tempFile.path).catch(() => {});
      res.status(400).json({
        success: false,
        error: { message: validation.error || 'Invalid APK file', code: 'INVALID_APK' },
      });
      return;
    }

    // Calculate SHA-256 checksum server-side
    const sha256 = await calculateFileSha256(tempFile.path);

    // Save file atomically into persistent storage
    const storageKey = `apks/${appId}/${channel.toLowerCase()}_v${version}_vc${versionCode}_${sha256.substring(0, 8)}.apk`;
    const storage = getStorageProvider();
    const stored = await storage.saveFromTemp(tempFile.path, storageKey);

    // Create Release record
    const release = await prisma.release.create({
      data: {
        appId,
        version,
        versionCode,
        channel,
        releaseNotes,
        fileName: tempFile.originalname,
        storageKey: stored.key,
        fileSize: stored.size,
        sha256,
        uploadedById: req.user?.id,
      },
      include: {
        app: {
          select: { id: true, name: true, packageName: true },
        },
        uploadedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Touch app's updatedAt
    await prisma.app.update({
      where: { id: appId },
      data: { updatedAt: new Date() },
    });

    await recordAuditLog({
      action: 'RELEASE_UPLOAD',
      entityType: 'RELEASE',
      entityId: release.id,
      appId: app.id,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        appName: app.name,
        packageName: app.packageName,
        version: release.version,
        versionCode: release.versionCode,
        channel: release.channel,
        fileSize: release.fileSize,
        sha256: release.sha256,
      },
    });

    res.status(201).json({
      success: true,
      data: release,
    });
  } catch (err) {
    if (tempFile?.path) {
      await fs.promises.unlink(tempFile.path).catch(() => {});
    }
    next(err);
  }
}

export async function listReleases(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId } = req.params;
    const channelQuery = typeof req.query.channel === 'string' ? req.query.channel.toUpperCase() : undefined;

    const where: Record<string, unknown> = { appId };

    if (channelQuery && ['DEV', 'QA', 'STAGING', 'PRODUCTION'].includes(channelQuery)) {
      where.channel = channelQuery as ReleaseChannel;
    }

    const releases = await prisma.release.findMany({
      where,
      orderBy: [{ versionCode: 'desc' }, { createdAt: 'desc' }],
      include: {
        uploadedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.json({
      success: true,
      data: releases,
    });
  } catch (err) {
    next(err);
  }
}

export async function getReleaseById(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, releaseId } = req.params;

    const release = await prisma.release.findFirst({
      where: { id: releaseId, appId },
      include: {
        app: true,
        uploadedBy: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    if (!release) {
      res.status(404).json({
        success: false,
        error: { message: 'Release not found', code: 'RELEASE_NOT_FOUND' },
      });
      return;
    }

    res.json({
      success: true,
      data: release,
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
      res.status(404).json({
        success: false,
        error: { message: 'Release not found', code: 'RELEASE_NOT_FOUND' },
      });
      return;
    }

    const storage = getStorageProvider();
    const stream = await storage.getFileStream(release.storageKey);

    // Track download count asynchronously
    prisma.release.update({
      where: { id: release.id },
      data: { downloadCount: { increment: 1 } },
    }).catch((e) => logger.warn('Failed to increment download count', { error: e }));

    recordAuditLog({
      action: 'RELEASE_DOWNLOAD',
      entityType: 'RELEASE',
      entityId: release.id,
      appId: release.appId,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        appName: release.app.name,
        version: release.version,
        channel: release.channel,
      },
    }).catch(() => {});

    // Set download headers
    const safeFilename = release.fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('Content-Length', release.fileSize.toString());
    res.setHeader('X-Checksum-SHA256', release.sha256);

    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

export async function deleteRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, releaseId } = req.params;

    const release = await prisma.release.findFirst({
      where: { id: releaseId, appId },
      include: { app: true },
    });

    if (!release) {
      res.status(404).json({
        success: false,
        error: { message: 'Release not found', code: 'RELEASE_NOT_FOUND' },
      });
      return;
    }

    // Delete stored file
    const storage = getStorageProvider();
    await storage.deleteFile(release.storageKey).catch((e) => logger.warn('Could not delete storage file', { error: e }));

    await prisma.release.delete({
      where: { id: release.id },
    });

    await recordAuditLog({
      action: 'RELEASE_DELETE',
      entityType: 'RELEASE',
      entityId: release.id,
      appId: release.appId,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        appName: release.app.name,
        version: release.version,
        versionCode: release.versionCode,
        channel: release.channel,
      },
    });

    res.json({
      success: true,
      message: `Release version ${release.version} (${release.channel}) deleted successfully.`,
    });
  } catch (err) {
    next(err);
  }
}
