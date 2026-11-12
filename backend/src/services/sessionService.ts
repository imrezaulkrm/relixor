import jwt from 'jsonwebtoken';
import { Role } from '@prisma/client';
import { config } from '../config';
import { prisma } from './prisma';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  tokenVersion: number;
}

export function parseExpiryMs(value: string): number {
  const match = /^(\d+)\s*([smhd])$/i.exec(value.trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const amount = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();
  const factors: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * factors[unit];
}

export function signSessionToken(user: SessionUser, sessionId: string): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      tokenVersion: user.tokenVersion,
      sid: sessionId,
    },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
  );
}

export async function createSession(
  user: SessionUser,
  ipAddress?: string,
  userAgent?: string
): Promise<{ sessionId: string; token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + parseExpiryMs(config.jwtExpiresIn));
  const session = await prisma.userSession.create({
    data: {
      userId: user.id,
      ipAddress: ipAddress || null,
      userAgent: userAgent || null,
      expiresAt,
    },
  });

  return {
    sessionId: session.id,
    token: signSessionToken(user, session.id),
    expiresAt,
  };
}

export async function revokeSession(sessionId: string, userId?: string): Promise<boolean> {
  const result = await prisma.userSession.updateMany({
    where: { id: sessionId, ...(userId ? { userId } : {}), revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count > 0;
}

export async function revokeAllSessions(userId: string): Promise<number> {
  const result = await prisma.userSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

export function sessionIsActive(session: {
  revokedAt: Date | null;
  expiresAt: Date;
}): boolean {
  return session.revokedAt === null && session.expiresAt.getTime() > Date.now();
}
