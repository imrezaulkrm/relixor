import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../services/prisma';
import { hashApiToken } from '../utils/token';
import { AuthUser, AuthApiToken } from '../types/express';

interface JwtPayload {
  userId: string;
  email: string;
  role: string;
  name: string;
}

export async function authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    let authHeader = req.headers.authorization;
    let tokenString: string | undefined;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      tokenString = authHeader.substring(7).trim();
    } else if (req.headers['x-api-key']) {
      tokenString = (req.headers['x-api-key'] as string).trim();
    } else if (req.query.token && typeof req.query.token === 'string') {
      tokenString = req.query.token.trim();
    }

    if (!tokenString) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required. Missing Bearer token or X-API-Key header.', code: 'UNAUTHORIZED' },
      });
      return;
    }

    // Check if it is an API token (starts with relixor_live_)
    if (tokenString.startsWith('relixor_live_')) {
      const hashed = hashApiToken(tokenString);

      const dbToken = await prisma.apiToken.findUnique({
        where: { tokenHash: hashed },
        include: { user: true },
      });

      if (!dbToken || dbToken.revoked) {
        res.status(401).json({
          success: false,
          error: { message: 'Invalid or revoked API token.', code: 'INVALID_TOKEN' },
        });
        return;
      }

      if (dbToken.expiresAt && dbToken.expiresAt < new Date()) {
        res.status(401).json({
          success: false,
          error: { message: 'API token has expired.', code: 'TOKEN_EXPIRED' },
        });
        return;
      }

      if (!dbToken.user.isActive) {
        res.status(401).json({
          success: false,
          error: { message: 'Associated user account is deactivated.', code: 'USER_INACTIVE' },
        });
        return;
      }

      // Update lastUsedAt asynchronously
      prisma.apiToken.update({
        where: { id: dbToken.id },
        data: { lastUsedAt: new Date() },
      }).catch(() => {});

      const authApiToken: AuthApiToken = {
        id: dbToken.id,
        name: dbToken.name,
        permission: dbToken.permission,
        appId: dbToken.appId,
        userId: dbToken.userId,
      };

      const authUser: AuthUser = {
        id: dbToken.user.id,
        email: dbToken.user.email,
        name: dbToken.user.name,
        role: dbToken.user.role,
      };

      req.user = authUser;
      req.apiToken = authApiToken;
      req.authMethod = 'api_token';
      return next();
    }

    // Otherwise, verify as JWT token
    try {
      const decoded = jwt.verify(tokenString, config.jwtSecret) as JwtPayload;

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, name: true, role: true, isActive: true },
      });

      if (!user || !user.isActive) {
        res.status(401).json({
          success: false,
          error: { message: 'User account is invalid or deactivated.', code: 'USER_INACTIVE' },
        });
        return;
      }

      req.user = {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      };
      req.authMethod = 'jwt';
      return next();
    } catch (jwtErr) {
      res.status(401).json({
        success: false,
        error: { message: 'Invalid or expired session token.', code: 'INVALID_SESSION' },
      });
      return;
    }
  } catch (err) {
    next(err);
  }
}
