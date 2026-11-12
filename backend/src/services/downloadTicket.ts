import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from './prisma';

export interface DownloadTicketPayload {
  purpose: 'download';
  releaseId: string;
  appId: string;
  jti: string;
}

export interface IssuedDownloadTicket {
  ticket: string;
  expiresInSeconds: number;
  expiresAt: Date;
}

/**
 * Issues a short-lived, single-use download ticket. The JWT carries only opaque
 * identifiers; consumption is tracked in the database so a ticket cannot be replayed.
 */
export async function createDownloadTicket(
  releaseId: string,
  appId: string,
  userId?: string,
  expiresInSeconds = 300
): Promise<IssuedDownloadTicket> {
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  const record = await prisma.downloadTicket.create({
    data: { releaseId, appId, userId: userId || null, expiresAt },
    select: { id: true },
  });

  const ticket = jwt.sign(
    { purpose: 'download', releaseId, appId, jti: record.id },
    config.jwtSecret,
    { expiresIn: expiresInSeconds }
  );

  return { ticket, expiresInSeconds, expiresAt };
}

/**
 * Verifies and atomically consumes a ticket. Returns null for invalid, expired,
 * already-consumed or mismatched tickets.
 */
export async function consumeDownloadTicket(ticket: string): Promise<DownloadTicketPayload | null> {
  let decoded: DownloadTicketPayload;
  try {
    decoded = jwt.verify(ticket, config.jwtSecret) as DownloadTicketPayload;
  } catch {
    return null;
  }

  if (decoded.purpose !== 'download' || !decoded.releaseId || !decoded.appId || !decoded.jti) {
    return null;
  }

  const consumed = await prisma.downloadTicket.updateMany({
    where: {
      id: decoded.jti,
      releaseId: decoded.releaseId,
      appId: decoded.appId,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { consumedAt: new Date() },
  });

  return consumed.count === 1 ? decoded : null;
}

export function verifyDownloadTicket(ticket: string): DownloadTicketPayload | null {
  try {
    const decoded = jwt.verify(ticket, config.jwtSecret) as DownloadTicketPayload;
    if (decoded.purpose !== 'download' || !decoded.releaseId || !decoded.appId || !decoded.jti) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
