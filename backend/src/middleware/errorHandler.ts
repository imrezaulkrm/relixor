import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import multer from 'multer';
import { logger } from '../utils/logger';
import { config } from '../config';

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  logger.error('Unhandled error occurred', {
    url: req.originalUrl,
    method: req.method,
    error: err instanceof Error ? err.stack : err,
  });

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        })),
      },
    });
    return;
  }

  if (err instanceof multer.MulterError) {
    let message = err.message;
    if (err.code === 'LIMIT_FILE_SIZE') {
      message = 'Uploaded file exceeds the maximum allowed size.';
    }
    res.status(400).json({
      success: false,
      error: {
        message,
        code: `UPLOAD_${err.code}`,
      },
    });
    return;
  }

  if (err instanceof Error) {
    // Do not leak storage paths, ORM internals or filesystem details in production.
    res.status(400).json({
      success: false,
      error: {
        message: config.env === 'production' ? 'The request could not be completed.' : err.message,
        code: 'BAD_REQUEST',
      },
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: {
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
    },
  });
}
