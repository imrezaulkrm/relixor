import { Request, Response, NextFunction } from 'express';
import { Prisma, ReleaseChannel, ReleaseStatus, Role } from '@prisma/client';
import { prisma } from '../services/prisma';
import { getAccessibleAppIds } from '../services/rbacService';
import { recordAuditLog } from '../services/auditService';
import { buildPdfReport, PdfReportRow } from '../services/pdfReport';

interface ReportFilters {
  from?: Date;
  to?: Date;
  projectId?: string;
  appId?: string;
  channel?: ReleaseChannel;
  status?: ReleaseStatus;
}

function parseFilters(req: Request): ReportFilters {
  const parseDate = (value: unknown): Date | undefined => {
    if (typeof value !== 'string' || !value.trim()) return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  };
  const channelRaw = String(req.query.channel || '').toUpperCase();
  const statusRaw = String(req.query.status || '').toUpperCase();

  return {
    from: parseDate(req.query.from),
    to: parseDate(req.query.to),
    projectId: typeof req.query.projectId === 'string' && req.query.projectId.trim() ? req.query.projectId.trim() : undefined,
    appId: typeof req.query.appId === 'string' && req.query.appId.trim() ? req.query.appId.trim() : undefined,
    channel: Object.values(ReleaseChannel).includes(channelRaw as ReleaseChannel)
      ? (channelRaw as ReleaseChannel)
      : undefined,
    status: Object.values(ReleaseStatus).includes(statusRaw as ReleaseStatus)
      ? (statusRaw as ReleaseStatus)
      : undefined,
  };
}

async function collectRows(req: Request) {
  if (!req.user) throw new Error('UNAUTHORIZED');
  if (req.authMethod === 'api_token') {
    const err = new Error('FORBIDDEN');
    (err as Error & { code?: string }).code = 'FORBIDDEN';
    throw err;
  }

  let accessibleAppIds: string[] | 'ALL' = 'ALL';
  if (req.user.role !== Role.ADMIN) {
    accessibleAppIds = await getAccessibleAppIds(req.user.id, req.user.role, 'VIEWER');
  }

  const filters = parseFilters(req);
  const where: Prisma.ReleaseWhereInput = {};
  if (accessibleAppIds !== 'ALL') {
    if (accessibleAppIds.length === 0) return { filters, rows: [], empty: true, admin: false };
    where.appId = { in: accessibleAppIds };
  }
  if (filters.appId) where.appId = filters.appId;
  if (filters.projectId) where.app = { projectId: filters.projectId };
  if (filters.channel) where.channel = filters.channel;
  if (filters.status) where.status = filters.status;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: filters.from } : {}),
      ...(filters.to ? { lte: filters.to } : {}),
    };
  }

  const releases = await prisma.release.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 5000,
    include: {
      app: { select: { name: true, packageName: true, project: { select: { name: true } } } },
      uploadedBy: { select: { name: true, email: true } },
      approvedBy: { select: { name: true, email: true } },
      qaVerifications: {
        orderBy: { updatedAt: 'desc' },
        include: { reviewer: { select: { name: true } } },
      },
    },
  });

  const rows = releases.map((release) => {
    const verifications = release.qaVerifications;
    const qaResult = verifications.length === 0 ? 'NOT_TESTED' : verifications.map((v) => v.status).join(', ');
    const qaReviewers = verifications.map((v) => v.reviewer.name).join('; ');
    const qaNotes = verifications
      .map((v) => v.notes)
      .filter((note): note is string => Boolean(note && note.trim()))
      .join(' | ');

    return {
      id: release.id,
      appId: release.appId,
      project: release.app.project.name,
      application: release.app.name,
      packageName: release.app.packageName,
      version: release.version,
      versionCode: release.versionCode,
      channel: release.channel,
      status: release.status,
      qaResult,
      qaReviewers,
      qaNotes,
      uploadedBy: release.uploadedBy?.name || 'Unknown',
      approvedBy: release.approvedBy?.name || '',
      createdAt: release.createdAt.toISOString(),
      publishedAt: release.publishedAt ? release.publishedAt.toISOString() : '',
      downloads: release.downloadCount,
      sha256: release.sha256,
      hasFailures: verifications.some((v) => v.status === 'FAIL' || v.status === 'BLOCKED'),
      tested: verifications.length > 0,
    };
  });

  return { filters, rows, empty: false, admin: req.user.role === Role.ADMIN };
}

function summarise(rows: Awaited<ReturnType<typeof collectRows>>['rows']) {
  return {
    totalReleases: rows.length,
    tested: rows.filter((r) => r.tested).length,
    notTested: rows.filter((r) => !r.tested).length,
    failed: rows.filter((r) => r.hasFailures).length,
    downloads: rows.reduce((sum, r) => sum + r.downloads, 0),
  };
}

export async function getQaReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { filters, rows } = await collectRows(req);
    res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        filters: {
          from: filters.from?.toISOString() || null,
          to: filters.to?.toISOString() || null,
          projectId: filters.projectId || null,
          appId: filters.appId || null,
          channel: filters.channel || null,
          status: filters.status || null,
        },
        summary: summarise(rows),
        rows: rows.map(({ hasFailures, tested, ...row }) => row),
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      res.status(401).json({ success: false, error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
      return;
    }
    if (err instanceof Error && (err as Error & { code?: string }).code === 'FORBIDDEN') {
      res.status(403).json({
        success: false,
        error: { message: 'Reports require an interactive user session.', code: 'FORBIDDEN' },
      });
      return;
    }
    next(err);
  }
}

function csvCell(value: unknown): string {
  let text = value === null || value === undefined ? '' : String(value);
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

const CSV_HEADERS = [
  'Project',
  'Application',
  'Package Name',
  'Version',
  'Version Code',
  'Channel',
  'Release Status',
  'QA Result',
  'QA Reviewers',
  'QA Notes',
  'Uploaded By',
  'Approved By',
  'Created At',
  'Published At',
  'Downloads',
  'SHA-256',
];

export async function exportQaReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const format = String(req.query.format || 'csv').toLowerCase();
    if (!['csv', 'pdf'].includes(format)) {
      res.status(400).json({
        success: false,
        error: { message: 'Unsupported export format. Use "csv" or "pdf".', code: 'INVALID_FORMAT' },
      });
      return;
    }

    const { filters, rows } = await collectRows(req);
    const summary = summarise(rows);
    const generatedAt = new Date();
    const dateStamp = generatedAt.toISOString().slice(0, 10);

    await recordAuditLog({
      action: 'REPORT_EXPORT',
      entityType: 'REPORT',
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        format,
        filters: {
          from: filters.from?.toISOString() || null,
          to: filters.to?.toISOString() || null,
          projectId: filters.projectId || null,
          appId: filters.appId || null,
          channel: filters.channel || null,
          status: filters.status || null,
        },
        rows: rows.length,
      },
    });

    if (format === 'csv') {
      const lines = [CSV_HEADERS.join(',')];
      for (const row of rows) {
        lines.push(
          [
            row.project,
            row.application,
            row.packageName,
            row.version,
            row.versionCode,
            row.channel,
            row.status,
            row.qaResult,
            row.qaReviewers,
            row.qaNotes,
            row.uploadedBy,
            row.approvedBy,
            row.createdAt,
            row.publishedAt,
            row.downloads,
            row.sha256,
          ]
            .map(csvCell)
            .join(',')
        );
      }
      const csv = `\uFEFF${lines.join('\r\n')}\r\n`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="relixor-qa-report-${dateStamp}.csv"`);
      res.send(csv);
      return;
    }

    const pdfRows: PdfReportRow[] = rows.map((row) => ({
      application: row.application,
      version: row.version,
      versionCode: row.versionCode,
      channel: row.channel,
      status: row.status,
      qaResult: row.qaResult,
      qaReviewers: row.qaReviewers,
      publishedAt: row.publishedAt,
    }));

    const pdf = buildPdfReport({
      title: 'Relixor QA Report',
      subtitle: filters.projectId || filters.appId ? `Filtered report` : 'All authorized projects and applications',
      generatedAt: generatedAt.toISOString(),
      summary: [
        `Releases: ${summary.totalReleases}   Tested: ${summary.tested}   Not tested: ${summary.notTested}`,
        `Releases with failures/blockers: ${summary.failed}   Downloads: ${summary.downloads}`,
      ],
      rows: pdfRows,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="relixor-qa-report-${dateStamp}.pdf"`);
    res.send(pdf);
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHORIZED') {
      res.status(401).json({ success: false, error: { message: 'Authentication required', code: 'UNAUTHORIZED' } });
      return;
    }
    if (err instanceof Error && (err as Error & { code?: string }).code === 'FORBIDDEN') {
      res.status(403).json({
        success: false,
        error: { message: 'Reports require an interactive user session.', code: 'FORBIDDEN' },
      });
      return;
    }
    next(err);
  }
}
