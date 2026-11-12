import { Request, Response, NextFunction } from 'express';
import { Role } from '@prisma/client';
import { canAccessProject, canAccessApp } from '../services/rbacService';

/**
 * Membership and access administration is reserved for interactive administrator
 * sessions. It is intentionally not available through API-token authentication.
 */
export function requireInteractiveSession(req: Request, res: Response, next: NextFunction): void {
  if (req.authMethod === 'api_token') {
    res.status(403).json({
      success: false,
      error: {
        message: 'Membership management requires an interactive administrator session.',
        code: 'FORBIDDEN',
      },
    });
    return;
  }
  next();
}

export function requireProjectAccess(minRole: 'VIEWER' | 'DEVELOPER' = 'VIEWER') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
        });
        return;
      }

      if (req.user.role === Role.ADMIN) {
        return next();
      }

      const projectId = req.params.projectId;
      if (!projectId) {
        return next();
      }

      const isAllowed = await canAccessProject(req.user.id, req.user.role, projectId, minRole);
      if (!isAllowed) {
        res.status(403).json({
          success: false,
          error: {
            message: `Access denied. You do not have sufficient permissions to access this project (${minRole} required).`,
            code: 'FORBIDDEN_RESOURCE_ACCESS',
          },
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAppAccess(minRole: 'VIEWER' | 'DEVELOPER' = 'VIEWER') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) {
        res.status(401).json({
          success: false,
          error: { message: 'Authentication required', code: 'UNAUTHORIZED' },
        });
        return;
      }

      const appId = req.params.appId;
      if (!appId) {
        return next();
      }

      // API token authorization
      if (req.authMethod === 'api_token' && req.apiToken) {
        if (req.apiToken.appId && req.apiToken.appId !== appId) {
          res.status(403).json({
            success: false,
            error: {
              message: `API token is scoped to a different application.`,
              code: 'FORBIDDEN_APP_SCOPE',
            },
          });
          return;
        }

        // App-scoped API tokens already bound to this application are authorized
        if (req.apiToken.appId === appId) {
          return next();
        }

        // Global API token: check token owner's access
        if (req.user.role === Role.ADMIN) {
          return next();
        }

        const tokenOwnerAllowed = await canAccessApp(req.user.id, req.user.role, appId, minRole);
        if (!tokenOwnerAllowed) {
          res.status(403).json({
            success: false,
            error: {
              message: `Access denied. Token owner does not have permission for this application.`,
              code: 'FORBIDDEN_RESOURCE_ACCESS',
            },
          });
          return;
        }
        return next();
      }

      // User session authorization
      if (req.user.role === Role.ADMIN) {
        return next();
      }

      const isAllowed = await canAccessApp(req.user.id, req.user.role, appId, minRole);
      if (!isAllowed) {
        res.status(403).json({
          success: false,
          error: {
            message: `Access denied. You do not have sufficient permissions to access this application (${minRole} required).`,
            code: 'FORBIDDEN_RESOURCE_ACCESS',
          },
        });
        return;
      }

      next();
    } catch (err) {
      next(err);
    }
  };
}
