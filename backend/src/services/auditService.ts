import { PrismaClient } from '@prisma/client';
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

/**
 * Minimal client surface needed to write an audit record. Both the global Prisma client
 * and a transaction client satisfy it, so callers can keep a mutation and its audit
 * record in the same transaction.
 */
type AuditLogClient = Pick<PrismaClient, 'auditLog'>;

export async function recordAuditLog(
  params: AuditLogParams,
  client: AuditLogClient = prisma,
  throwOnError = false
): Promise<void> {
  try {
    const detailsStr = typeof params.details === 'object' ? JSON.stringify(params.details) : params.details;

    await client.auditLog.create({
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
    // Inside a transaction the caller opts in to propagating the error so the
    // membership mutation rolls back together with its audit record.
    if (throwOnError) throw error;
  }
}
