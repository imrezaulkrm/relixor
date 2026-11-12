import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { QaStatus, ReleaseChannel } from '@prisma/client';
import { prisma } from '../services/prisma';
import { recordAuditLog } from '../services/auditService';

const verificationSchema = z.object({
  status: z.nativeEnum(QaStatus),
  notes: z.string().max(4000).optional(),
});

async function loadRelease(appId: string, releaseId: string) {
  return prisma.release.findFirst({
    where: { id: releaseId, appId },
    select: { id: true, appId: true, version: true, versionCode: true, channel: true, status: true },
  });
}

export async function listQaVerifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, releaseId } = req.params;
    const release = await loadRelease(appId, releaseId);
    if (!release) {
      res.status(404).json({ success: false, error: { message: 'Release not found', code: 'RELEASE_NOT_FOUND' } });
      return;
    }

    const verifications = await prisma.qaVerification.findMany({
      where: { releaseId },
      orderBy: { updatedAt: 'desc' },
      include: { reviewer: { select: { id: true, name: true, email: true } } },
    });

    res.json({ success: true, data: verifications });
  } catch (err) {
    next(err);
  }
}

export async function recordQaVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      res.status(401).json({ success: false, error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
      return;
    }
    if (req.authMethod === 'api_token') {
      res.status(403).json({
        success: false,
        error: { message: 'QA verification requires an interactive user session.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { appId, releaseId } = req.params;
    const release = await loadRelease(appId, releaseId);
    if (!release) {
      res.status(404).json({ success: false, error: { message: 'Release not found', code: 'RELEASE_NOT_FOUND' } });
      return;
    }

    const data = verificationSchema.parse(req.body);

    const verification = await prisma.$transaction(async (tx) => {
      const saved = await tx.qaVerification.upsert({
        where: { qa_release_reviewer_unique: { releaseId, reviewerId: req.user!.id } },
        create: {
          releaseId,
          reviewerId: req.user!.id,
          status: data.status,
          notes: data.notes?.trim() || null,
        },
        update: { status: data.status, notes: data.notes?.trim() || null },
        include: { reviewer: { select: { id: true, name: true, email: true } } },
      });

      await recordAuditLog(
        {
          action: 'QA_VERIFICATION_RECORDED',
          entityType: 'RELEASE',
          entityId: releaseId,
          appId,
          userId: req.user!.id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          details: {
            version: release.version,
            versionCode: release.versionCode,
            channel: release.channel,
            status: data.status,
          },
        },
        tx,
        true
      );

      return saved;
    });

    res.status(201).json({ success: true, data: verification });
  } catch (err) {
    next(err);
  }
}

export async function getQaReleaseSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { appId, releaseId } = req.params;
    const release = await loadRelease(appId, releaseId);
    if (!release) {
      res.status(404).json({ success: false, error: { message: 'Release not found', code: 'RELEASE_NOT_FOUND' } });
      return;
    }

    const groups = await prisma.qaVerification.groupBy({
      by: ['status'],
      where: { releaseId },
      _count: { id: true },
    });

    const counts: Record<string, number> = { PASS: 0, FAIL: 0, BLOCKED: 0 };
    for (const group of groups) counts[group.status] = group._count.id;

    res.json({
      success: true,
      data: {
        release,
        counts,
        tested: counts.PASS + counts.FAIL + counts.BLOCKED > 0,
        channel: release.channel as ReleaseChannel,
      },
    });
  } catch (err) {
    next(err);
  }
}
