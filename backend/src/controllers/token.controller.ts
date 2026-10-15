import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { Role, TokenPermission } from '@prisma/client';
import { prisma } from '../services/prisma';
import { generateApiToken } from '../utils/token';
import { recordAuditLog } from '../services/auditService';

const createTokenSchema = z.object({
  name: z.string().min(2).max(100),
  permission: z.nativeEnum(TokenPermission).default(TokenPermission.WRITE),
  appId: z.string().optional().nullable(),
  expiresInDays: z.number().int().min(1).max(365).optional().nullable(),
});

export async function listTokens(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const isAdmin = req.user?.role === Role.ADMIN;
    const where: Record<string, unknown> = {};

    // Developers can only see tokens they created; Admins see all tokens
    if (!isAdmin && req.user) {
      where.userId = req.user.id;
    }

    const tokens = await prisma.apiToken.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        tokenPrefix: true,
        permission: true,
        appId: true,
        expiresAt: true,
        lastUsedAt: true,
        revoked: true,
        createdAt: true,
        app: {
          select: { id: true, name: true, packageName: true },
        },
        user: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    res.json({
      success: true,
      data: tokens,
    });
  } catch (err) {
    next(err);
  }
}

export async function createToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = createTokenSchema.parse(req.body);

    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { message: 'Unauthorized', code: 'UNAUTHORIZED' },
      });
      return;
    }

    if (req.authMethod === 'api_token') {
      res.status(403).json({
        success: false,
        error: { message: 'API tokens cannot generate new API tokens. Please log in with a user session.', code: 'FORBIDDEN' },
      });
      return;
    }

    if (req.user.role === Role.VIEWER) {
      res.status(403).json({
        success: false,
        error: { message: 'Viewers cannot create API tokens.', code: 'FORBIDDEN' },
      });
      return;
    }

    // If an appId was provided, check that app exists
    if (data.appId) {
      const app = await prisma.app.findUnique({
        where: { id: data.appId },
      });
      if (!app) {
        res.status(404).json({
          success: false,
          error: { message: 'Target application for token scope not found.', code: 'APP_NOT_FOUND' },
        });
        return;
      }
    }

    // Developers cannot create ADMIN scoped tokens
    if (req.user.role !== Role.ADMIN && data.permission === TokenPermission.ADMIN) {
      res.status(403).json({
        success: false,
        error: { message: 'Only administrators can create ADMIN tokens.', code: 'FORBIDDEN' },
      });
      return;
    }

    const { plaintextToken, tokenPrefix, tokenHash } = generateApiToken();

    let expiresAt: Date | null = null;
    if (data.expiresInDays) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + data.expiresInDays);
    }

    const token = await prisma.apiToken.create({
      data: {
        name: data.name.trim(),
        tokenPrefix,
        tokenHash,
        permission: data.permission,
        appId: data.appId || null,
        userId: req.user.id,
        expiresAt,
      },
      include: {
        app: {
          select: { id: true, name: true, packageName: true },
        },
      },
    });

    await recordAuditLog({
      action: 'TOKEN_CREATE',
      entityType: 'TOKEN',
      entityId: token.id,
      userId: req.user.id,
      appId: token.appId || undefined,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        name: token.name,
        permission: token.permission,
        tokenPrefix: token.tokenPrefix,
        scopedAppId: token.appId,
        expiresAt: token.expiresAt,
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: token.id,
        name: token.name,
        tokenPrefix: token.tokenPrefix,
        permission: token.permission,
        appId: token.appId,
        app: token.app,
        expiresAt: token.expiresAt,
        createdAt: token.createdAt,
        plaintextToken, // ONLY returned once upon creation!
      },
      message: 'Token created successfully. Please store this secret token safely; it will not be displayed again.',
    });
  } catch (err) {
    next(err);
  }
}

export async function revokeToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tokenId } = req.params;

    const token = await prisma.apiToken.findUnique({
      where: { id: tokenId },
    });

    if (!token) {
      res.status(404).json({
        success: false,
        error: { message: 'Token not found', code: 'TOKEN_NOT_FOUND' },
      });
      return;
    }

    // Only Admin or the creator can revoke
    if (req.user?.role !== Role.ADMIN && token.userId !== req.user?.id) {
      res.status(403).json({
        success: false,
        error: { message: 'You are not authorized to revoke this token.', code: 'FORBIDDEN' },
      });
      return;
    }

    const updated = await prisma.apiToken.update({
      where: { id: tokenId },
      data: { revoked: true },
    });

    await recordAuditLog({
      action: 'TOKEN_REVOKE',
      entityType: 'TOKEN',
      entityId: tokenId,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { name: token.name, tokenPrefix: token.tokenPrefix },
    });

    res.json({
      success: true,
      message: `Token '${token.name}' has been revoked.`,
      data: updated,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteToken(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { tokenId } = req.params;

    const token = await prisma.apiToken.findUnique({
      where: { id: tokenId },
    });

    if (!token) {
      res.status(404).json({
        success: false,
        error: { message: 'Token not found', code: 'TOKEN_NOT_FOUND' },
      });
      return;
    }

    if (req.user?.role !== Role.ADMIN && token.userId !== req.user?.id) {
      res.status(403).json({
        success: false,
        error: { message: 'You are not authorized to delete this token.', code: 'FORBIDDEN' },
      });
      return;
    }

    await prisma.apiToken.delete({
      where: { id: tokenId },
    });

    await recordAuditLog({
      action: 'TOKEN_DELETE',
      entityType: 'TOKEN',
      entityId: tokenId,
      userId: req.user?.id,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: { name: token.name },
    });

    res.json({
      success: true,
      message: `Token '${token.name}' has been deleted.`,
    });
  } catch (err) {
    next(err);
  }
}
