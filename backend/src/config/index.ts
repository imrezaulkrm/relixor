import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';
const rawJwtSecret = process.env.JWT_SECRET;

const DEFAULT_INSECURE_SECRET = 'relixor-default-jwt-secret-key-change-in-production';

if (isProduction) {
  if (!rawJwtSecret || rawJwtSecret.trim() === '' || rawJwtSecret === DEFAULT_INSECURE_SECRET) {
    throw new Error(
      'FATAL CONFIGURATION ERROR: In production mode (NODE_ENV=production), JWT_SECRET must be explicitly set to a unique, secure secret of at least 32 characters. Do not use default or empty keys.'
    );
  }
  if (rawJwtSecret.length < 32) {
    throw new Error(
      'FATAL CONFIGURATION ERROR: JWT_SECRET is too short. In production mode, JWT_SECRET must be at least 32 characters long.'
    );
  }
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  jwtSecret: rawJwtSecret || DEFAULT_INSECURE_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  corsOrigins: (process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost').split(','),
  
  storage: {
    provider: (process.env.STORAGE_PROVIDER || 'local').toLowerCase(),
    localDir: path.resolve(process.env.STORAGE_LOCAL_DIR || path.join(process.cwd(), '../storage/apks')),
    maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '500', 10),
  },

  adminDefault: {
    email: process.env.ADMIN_DEFAULT_EMAIL || 'admin@relixor.internal',
    password: process.env.ADMIN_DEFAULT_PASSWORD || '',
    name: process.env.ADMIN_DEFAULT_NAME || 'System Administrator',
  },
};
