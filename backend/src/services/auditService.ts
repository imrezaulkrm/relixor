import { prisma } from './prisma';
import { logger } from '../utils/logger';

export interface AuditLogParams {
  action: string;
  entityType: string;
  entityId?: string;
  details?: Record<string, unknown> | string;
  userId?: string;
  appId?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function recordAuditLog(params: AuditLogParams): Promise<void> {
  try {
    const detailsStr = typeof params.details === 'object' ? JSON.stringify(params.details) : params.details;

    await prisma.auditLog.create({
      data: {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        details: detailsStr,
        userId: params.userId,
        appId: params.appId,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (error) {
    logger.error('Failed to write audit log', { error, params });
  }
}
