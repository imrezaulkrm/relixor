import { Request, Response, NextFunction } from 'express';
import { ReleaseChannel, ReleaseStatus } from '@prisma/client';
import { prisma } from '../services/prisma';

export interface UpdateReleaseView {
  id: string;
  version: string;
  versionCode: number;
  channel: ReleaseChannel;
  status: ReleaseStatus;
  releaseNotes: string | null;
  fileName: string;
  fileSize: number;
  sha256: string;
  isMandatory: boolean;
  minSupportedVersionCode: number | null;
  publishedAt: Date | null;
  buildTimestamp: Date | null;
  downloadCount: number;
}

export function toUpdateView(release: {
  id: string;
  version: string;
  versionCode: number;
  channel: ReleaseChannel;
  status: ReleaseStatus;
  releaseNotes: string | null;
  fileName: string;
  fileSize: number;
  sha256: string;
  isMandatory: boolean;
  minSupportedVersionCode: number | null;
  publishedAt: Date | null;
  buildTimestamp: Date | null;
  downloadCount: number;
}): UpdateReleaseView {
  return {
    id: release.id,
    version: release.version,
    versionCode: release.versionCode,
    channel: release.channel,
    status: release.status,
    releaseNotes: release.releaseNotes,
    fileName: release.fileName,
    fileSize: release.fileSize,
    sha256: release.sha256,
    isMandatory: release.isMandatory,
    minSupportedVersionCode: release.minSupportedVersionCode,
    publishedAt: release.publishedAt,
    buildTimestamp: release.buildTimestamp,
    downloadCount: release.downloadCount,
  };
}

export function isMandatoryUpdate(
  release: { isMandatory: boolean; minSupportedVersionCode: number | null },
  currentVersionCode: number
): boolean {
  if (release.isMandatory) return true;
  return (
    release.minSupportedVersionCode !== null &&
    currentVersionCode > 0 &&
    currentVersionCode < release.minSupportedVersionCode
  );
}

function parseCurrentVersionCode(value: unknown): number {
  const parsed = parseInt(String(value ?? '0'), 10);
  return Number.isNaN(parsed) || parsed < 0 ? 0 : parsed;
}

function resolveChannel(value: unknown): ReleaseChannel {
  const channel = String(value || 'PRODUCTION').toUpperCase();
  return Object.values(ReleaseChannel).includes(channel as ReleaseChannel)
    ? (channel as ReleaseChannel)
    : ReleaseChannel.PRODUCTION;
}

export async function checkForUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId } = req.params;
    const currentVersionCode = parseCurrentVersionCode(req.query.currentVersionCode);
    const channel = resolveChannel(req.query.channel);

    const app = await prisma.app.findUnique({
      where: { id: appId },
      select: { id: true, name: true, packageName: true, description: true, iconUrl: true, isPublic: true },
    });
    if (!app) {
      res.status(404).json({ success: false, error: { message: 'Application not found', code: 'APP_NOT_FOUND' } });
      return;
    }

    const latest = await prisma.release.findFirst({
      where: {
        appId,
        channel,
        status: { in: [ReleaseStatus.PUBLISHED, ReleaseStatus.APPROVED] },
      },
      orderBy: [{ versionCode: 'desc' }, { publishedAt: 'desc' }],
    });

    if (!latest) {
      res.json({
        success: true,
        data: {
          app,
          currentVersionCode,
          updateAvailable: false,
          mandatoryUpdate: false,
          latest: null,
          downloadPath: null,
        },
      });
      return;
    }

    const updateAvailable = currentVersionCode === 0 || latest.versionCode > currentVersionCode;
    const mandatoryUpdate = isMandatoryUpdate(latest, currentVersionCode);

    res.json({
      success: true,
      data: {
        app,
        currentVersionCode,
        updateAvailable,
        mandatoryUpdate,
        latest: toUpdateView(latest),
        downloadPath: `/api/v1/apps/${appId}/releases/${latest.id}/download`,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getLatestUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId } = req.params;
    const channel = resolveChannel(req.query.channel);

    const app = await prisma.app.findUnique({
      where: { id: appId },
      select: { id: true, name: true, packageName: true, description: true, iconUrl: true, isPublic: true },
    });
    if (!app) {
      res.status(404).json({ success: false, error: { message: 'Application not found', code: 'APP_NOT_FOUND' } });
      return;
    }

    const latest = await prisma.release.findFirst({
      where: {
        appId,
        channel,
        status: { in: [ReleaseStatus.PUBLISHED, ReleaseStatus.APPROVED] },
      },
      orderBy: [{ versionCode: 'desc' }, { publishedAt: 'desc' }],
    });

    res.json({
      success: true,
      data: {
        app,
        latest: latest ? toUpdateView(latest) : null,
        downloadPath: latest ? `/api/v1/apps/${appId}/releases/${latest.id}/download` : null,
      },
    });
  } catch (err) {
    next(err);
  }
}
