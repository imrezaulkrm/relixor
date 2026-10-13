import { Request, Response, NextFunction } from 'express';
import { Role, TokenPermission } from '@prisma/client';

export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
      });
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: {
          message: `Access denied. Role '${req.user.role}' is not authorized for this action. Required: ${allowedRoles.join(', ')}`,
          code: 'FORBIDDEN_ROLE',
        },
      });
      return;
    }

    next();
  };
}

export function requirePermission(minPermission: TokenPermission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
      });
      return;
    }

    // If request comes from an API token, verify token's permission level and appId scope
    if (req.authMethod === 'api_token' && req.apiToken) {
      const token = req.apiToken;
      const permLevels: Record<TokenPermission, number> = {
        READ: 1,
        WRITE: 2,
        ADMIN: 3,
      };

      if (permLevels[token.permission] < permLevels[minPermission]) {
        res.status(403).json({
          success: false,
          error: {
            message: `API token does not have sufficient permissions. Required: ${minPermission}, Token has: ${token.permission}`,
            code: 'FORBIDDEN_TOKEN_PERMISSION',
          },
        });
        return;
      }

      // Check if token is scoped to a specific app and if the route has an appId param
      const targetAppId = req.params.appId;
      if (token.appId && targetAppId && token.appId !== targetAppId) {
        res.status(403).json({
          success: false,
          error: {
            message: `API token is scoped to a different application and cannot access app '${targetAppId}'.`,
            code: 'FORBIDDEN_APP_SCOPE',
          },
        });
        return;
      }

      return next();
    }

    // For user sessions (JWT)
    // ADMIN has all permissions
    if (req.user.role === Role.ADMIN) {
      return next();
    }

    // DEVELOPER has WRITE and READ permissions
    if (req.user.role === Role.DEVELOPER) {
      if (minPermission === TokenPermission.ADMIN) {
        res.status(403).json({
          success: false,
          error: { message: 'Admin role required.', code: 'FORBIDDEN' },
        });
        return;
      }
      return next();
    }

    // VIEWER only has READ permission
    if (req.user.role === Role.VIEWER) {
      if (minPermission !== TokenPermission.READ) {
        res.status(403).json({
          success: false,
          error: { message: 'Viewers have read-only access.', code: 'FORBIDDEN_READ_ONLY' },
        });
        return;
      }
      return next();
    }

    res.status(403).json({
      success: false,
      error: { message: 'Access denied.', code: 'FORBIDDEN' },
    });
  };
}
