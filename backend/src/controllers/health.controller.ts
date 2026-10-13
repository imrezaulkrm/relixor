import { Request, Response } from 'express';
import { prisma } from '../services/prisma';
import { getStorageProvider } from '../storage';

const startTime = Date.now();

export async function checkHealth(req: Request, res: Response): Promise<void> {
  const status: {
    status: 'ok' | 'degraded' | 'error';
    uptimeSeconds: number;
    timestamp: string;
    checks: {
      database: 'connected' | 'error';
      storage: 'ready' | 'error';
    };
  } = {
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks: {
      database: 'connected',
      storage: 'ready',
    },
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch {
    status.checks.database = 'error';
    status.status = 'error';
  }

  try {
    const storage = getStorageProvider();
    await storage.getTotalStorageUsed();
  } catch {
    status.checks.storage = 'error';
    status.status = status.status === 'ok' ? 'degraded' : 'error';
  }

  const statusCode = status.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(status);
}
