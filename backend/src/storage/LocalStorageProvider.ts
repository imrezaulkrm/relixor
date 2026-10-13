import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { StorageProvider } from './StorageProvider';
import { logger } from '../utils/logger';

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
    this.ensureBaseDir();
  }

  private ensureBaseDir(): void {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
      logger.info(`Created local storage directory: ${this.baseDir}`);
    }
  }

  private getFullPath(storageKey: string): string {
    const resolvedBase = path.resolve(this.baseDir);
    const resolvedPath = path.resolve(resolvedBase, storageKey);
    const relativePath = path.relative(resolvedBase, resolvedPath);

    // Reject any path that escapes base directory, sibling directory with shared prefix, or root
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      throw new Error(`Path traversal attempt detected: ${storageKey}`);
    }

    return resolvedPath;
  }

  async saveFromTemp(tempFilePath: string, storageKey: string): Promise<{ size: number; key: string }> {
    const destPath = this.getFullPath(storageKey);
    const destDir = path.dirname(destPath);

    if (!fs.existsSync(destDir)) {
      await fs.promises.mkdir(destDir, { recursive: true });
    }

    // Atomic move via copy & unlink to ensure cross-device link safety
    await fs.promises.copyFile(tempFilePath, destPath);
    await fs.promises.unlink(tempFilePath).catch(() => {});

    const stats = await fs.promises.stat(destPath);
    logger.info(`Stored artifact locally: ${storageKey} (${stats.size} bytes)`);

    return {
      size: stats.size,
      key: storageKey,
    };
  }

  async getFileStream(storageKey: string): Promise<Readable> {
    const filePath = this.getFullPath(storageKey);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found in storage: ${storageKey}`);
    }

    return fs.createReadStream(filePath);
  }

  async deleteFile(storageKey: string): Promise<void> {
    const filePath = this.getFullPath(storageKey);
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      logger.info(`Deleted stored artifact: ${storageKey}`);
    }
  }

  async fileExists(storageKey: string): Promise<boolean> {
    const filePath = this.getFullPath(storageKey);
    return fs.existsSync(filePath);
  }

  async getTotalStorageUsed(): Promise<number> {
    let totalBytes = 0;

    const calculateDirSize = async (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          await calculateDirSize(fullPath);
        } else if (entry.isFile()) {
          const stat = await fs.promises.stat(fullPath);
          totalBytes += stat.size;
        }
      }
    };

    await calculateDirSize(this.baseDir);
    return totalBytes;
  }
}
