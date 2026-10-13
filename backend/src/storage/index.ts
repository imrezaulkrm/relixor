import { config } from '../config';
import { StorageProvider } from './StorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';
import { logger } from '../utils/logger';

let storageInstance: StorageProvider;

export function getStorageProvider(): StorageProvider {
  if (!storageInstance) {
    if (config.storage.provider === 'local') {
      storageInstance = new LocalStorageProvider(config.storage.localDir);
      logger.info(`Initialized LocalStorageProvider at: ${config.storage.localDir}`);
    } else {
      // In the future or when configured with S3, S3StorageProvider can be initialized here
      logger.warn(`Storage provider '${config.storage.provider}' not fully configured, falling back to LocalStorageProvider.`);
      storageInstance = new LocalStorageProvider(config.storage.localDir);
    }
  }

  return storageInstance;
}

export * from './StorageProvider';
export * from './LocalStorageProvider';
