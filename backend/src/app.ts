import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth.routes';
import appRoutes from './routes/app.routes';
import releaseRoutes from './routes/release.routes';
import userRoutes from './routes/user.routes';
import tokenRoutes from './routes/token.routes';
import statsRoutes from './routes/stats.routes';
import auditRoutes from './routes/audit.routes';
import healthRoutes from './routes/health.routes';

export function createApp(): Express {
  const app = express();

  // Trust reverse proxy (Nginx / Docker)
  app.set('trust proxy', 1);

  // Security Headers
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    })
  );

  // CORS Configuration
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, CI/CD pipelines)
        if (!origin) return callback(null, true);
        if (config.corsOrigins.includes('*') || config.corsOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, true); // Permissive in internal setups, controllable via env
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
      exposedHeaders: ['Content-Disposition', 'Content-Length', 'X-Checksum-SHA256'],
    })
  );

  // Body Parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // General Rate Limiter (1000 requests per 15 minutes)
  const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 1000,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      error: { message: 'Too many requests, please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
    },
  });
  app.use('/api/', generalLimiter);

  // Auth Limiter (30 attempts per 15 minutes)
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 30,
    message: {
      success: false,
      error: { message: 'Too many authentication attempts, please try again later.', code: 'AUTH_RATE_LIMIT' },
    },
  });
  app.use('/api/v1/auth/login', authLimiter);

  // Root health endpoints
  app.use('/health', healthRoutes);
  app.use('/api/v1/health', healthRoutes);

  // API v1 Routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/apps', appRoutes);
  app.use('/api/v1/apps/:appId/releases', releaseRoutes);
  app.use('/api/v1/users', userRoutes);
  app.use('/api/v1/tokens', tokenRoutes);
  app.use('/api/v1/stats', statsRoutes);
  app.use('/api/v1/audit-logs', auditRoutes);

  // 404 Handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: { message: 'API route not found', code: 'NOT_FOUND' },
    });
  });

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
}
