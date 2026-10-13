import { createApp } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { prisma } from './services/prisma';

const app = createApp();

const server = app.listen(config.port, () => {
  logger.info(`🚀 Relixor Backend API running on port ${config.port} [${config.env}]`);
  logger.info(`Health check available at http://localhost:${config.port}/health`);
});

const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}. Gracefully shutting down...`);
  server.close(async () => {
    logger.info('HTTP server closed.');
    await prisma.$disconnect();
    logger.info('Database connection closed.');
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forcefully terminating server after timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
