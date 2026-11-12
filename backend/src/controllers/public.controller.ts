import { Request, Response, NextFunction } from 'express';
import { ReleaseChannel, ReleaseStatus } from '@prisma/client';
import { prisma } from '../services/prisma';
import { createDownloadTicket, consumeDownloadTicket } from '../services/downloadTicket';
import { streamRelease } from './release.controller';
import { toUpdateView, isMandatoryUpdate } from './update.controller';

const PUBLIC_RELEASE_WHERE = {
  channel: ReleaseChannel.PRODUCTION,
  status: ReleaseStatus.PUBLISHED,
  publishedAt: { not: null },
  approvedAt: { not: null },
};

function publicAppView(app: {
  id: string;
  name: string;
  packageName: string;
  description: string | null;
  iconUrl: string | null;
  publicSlug: string | null;
  updatedAt: Date;
}) {
  return {
    id: app.id,
    name: app.name,
    packageName: app.packageName,
    description: app.description,
    iconUrl: app.iconUrl,
    publicSlug: app.publicSlug,
    updatedAt: app.updatedAt,
  };
}

function publicReleaseView(release: {
  id: string;
  version: string;
  versionCode: number;
  releaseNotes: string | null;
  fileSize: number;
  sha256: string;
  publishedAt: Date | null;
  downloadCount: number;
  isMandatory: boolean;
  minSupportedVersionCode: number | null;
}) {
  return {
    id: release.id,
    version: release.version,
    versionCode: release.versionCode,
    releaseNotes: release.releaseNotes,
    fileSize: release.fileSize,
    sha256: release.sha256,
    publishedAt: release.publishedAt,
    downloadCount: release.downloadCount,
    isMandatory: release.isMandatory,
    minSupportedVersionCode: release.minSupportedVersionCode,
  };
}

async function findPublicApp(idOrSlug: string) {
  return prisma.app.findFirst({
    where: {
      isPublic: true,
      OR: [{ id: idOrSlug }, { publicSlug: idOrSlug }],
    },
  });
}

export async function listPublicApps(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = Math.min(60, Math.max(1, parseInt(String(req.query.limit || '12'), 10) || 12));

    const where: Record<string, unknown> = { isPublic: true };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { packageName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [apps, total] = await Promise.all([
      prisma.app.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          releases: {
            where: PUBLIC_RELEASE_WHERE,
            orderBy: [{ versionCode: 'desc' }],
            take: 1,
            select: {
              id: true,
              version: true,
              versionCode: true,
              releaseNotes: true,
              fileSize: true,
              sha256: true,
              publishedAt: true,
              downloadCount: true,
              isMandatory: true,
              minSupportedVersionCode: true,
            },
          },
          _count: { select: { releases: { where: PUBLIC_RELEASE_WHERE } } },
        },
      }),
      prisma.app.count({ where }),
    ]);

    res.json({
      success: true,
      data: apps.map((app) => ({
        ...publicAppView(app),
        latestRelease: app.releases[0] ? publicReleaseView(app.releases[0]) : null,
        publicReleaseCount: app._count.releases,
      })),
      meta: { page, limit, total },
    });
  } catch (err) {
    next(err);
  }
}

export async function getPublicApp(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const app = await findPublicApp(req.params.appRef || req.params.appId || req.params.slug);
    if (!app) {
      res.status(404).json({ success: false, error: { message: 'Public application not found', code: 'APP_NOT_FOUND' } });
      return;
    }

    const releases = await prisma.release.findMany({
      where: { appId: app.id, ...PUBLIC_RELEASE_WHERE },
      orderBy: [{ versionCode: 'desc' }],
      take: 5,
      select: {
        id: true,
        version: true,
        versionCode: true,
        releaseNotes: true,
        fileSize: true,
        sha256: true,
        publishedAt: true,
        downloadCount: true,
        isMandatory: true,
        minSupportedVersionCode: true,
      },
    });

    const downloads = await prisma.release.aggregate({
      where: { appId: app.id, ...PUBLIC_RELEASE_WHERE },
      _sum: { downloadCount: true },
    });

    res.json({
      success: true,
      data: {
        ...publicAppView(app),
        latestRelease: releases[0] ? publicReleaseView(releases[0]) : null,
        releases: releases.map(publicReleaseView),
        totalDownloads: downloads._sum.downloadCount || 0,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function publicCheckForUpdate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const app = await findPublicApp(req.params.appRef || req.params.appId || req.params.slug);
    if (!app) {
      res.status(404).json({ success: false, error: { message: 'Public application not found', code: 'APP_NOT_FOUND' } });
      return;
    }

    const currentVersionCode = Math.max(0, parseInt(String(req.query.currentVersionCode || '0'), 10) || 0);
    const latest = await prisma.release.findFirst({
      where: { appId: app.id, ...PUBLIC_RELEASE_WHERE },
      orderBy: [{ versionCode: 'desc' }, { publishedAt: 'desc' }],
    });

    if (!latest) {
      res.json({
        success: true,
        data: {
          app: publicAppView(app),
          currentVersionCode,
          updateAvailable: false,
          mandatoryUpdate: false,
          latest: null,
          downloadUrl: null,
        },
      });
      return;
    }

    const issued = await createDownloadTicket(latest.id, app.id, undefined, 600);
    res.json({
      success: true,
      data: {
        app: publicAppView(app),
        currentVersionCode,
        updateAvailable: currentVersionCode === 0 || latest.versionCode > currentVersionCode,
        mandatoryUpdate: isMandatoryUpdate(latest, currentVersionCode),
        latest: { ...toUpdateView(latest), sha256: latest.sha256 },
        downloadUrl: `/api/v1/downloads/${issued.ticket}`,
        ticketExpiresInSeconds: issued.expiresInSeconds,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function publicLatestRelease(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const app = await findPublicApp(req.params.appRef || req.params.appId || req.params.slug);
    if (!app) {
      res.status(404).json({ success: false, error: { message: 'Public application not found', code: 'APP_NOT_FOUND' } });
      return;
    }

    const latest = await prisma.release.findFirst({
      where: { appId: app.id, ...PUBLIC_RELEASE_WHERE },
      orderBy: [{ versionCode: 'desc' }, { publishedAt: 'desc' }],
    });

    res.json({
      success: true,
      data: {
        app: publicAppView(app),
        latest: latest ? publicReleaseView(latest) : null,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function createPublicDownloadTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const app = await findPublicApp(req.params.appRef || req.params.appId || req.params.slug);
    if (!app) {
      res.status(404).json({ success: false, error: { message: 'Public application not found', code: 'APP_NOT_FOUND' } });
      return;
    }

    const latest = await prisma.release.findFirst({
      where: { appId: app.id, ...PUBLIC_RELEASE_WHERE },
      orderBy: [{ versionCode: 'desc' }, { publishedAt: 'desc' }],
    });
    if (!latest) {
      res.status(404).json({ success: false, error: { message: 'No published production release available.', code: 'RELEASE_NOT_FOUND' } });
      return;
    }

    const issued = await createDownloadTicket(latest.id, app.id, undefined, 600);
    res.json({
      success: true,
      data: {
        downloadUrl: `/api/v1/downloads/${issued.ticket}`,
        expiresAt: issued.expiresAt.toISOString(),
        expiresInSeconds: issued.expiresInSeconds,
        version: latest.version,
        versionCode: latest.versionCode,
        sha256: latest.sha256,
        fileSize: latest.fileSize,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function redeemDownloadTicket(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const payload = await consumeDownloadTicket(req.params.ticket);
    if (!payload) {
      res.status(410).json({
        success: false,
        error: { message: 'Download link is invalid, expired or already used.', code: 'TICKET_INVALID' },
      });
      return;
    }

    const release = await prisma.release.findFirst({
      where: { id: payload.releaseId, appId: payload.appId, ...PUBLIC_RELEASE_WHERE },
      include: { app: true },
    });

    if (!release || !release.app.isPublic) {
      res.status(404).json({ success: false, error: { message: 'Release is not publicly available.', code: 'RELEASE_NOT_FOUND' } });
      return;
    }

    await streamRelease(
      req,
      res,
      {
        id: release.id,
        appId: release.appId,
        app: { name: release.app.name },
        storageKey: release.storageKey,
        fileName: release.fileName,
        fileSize: release.fileSize,
        sha256: release.sha256,
        version: release.version,
        channel: release.channel,
      },
      'PUBLIC_DOWNLOAD'
    );
  } catch (err) {
    next(err);
  }
}
