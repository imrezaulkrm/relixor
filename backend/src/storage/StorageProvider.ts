import { Readable } from 'stream';

export interface StorageProvider {
  /**
   * Save a file from a temporary local path to destination storage key atomically
   */
  saveFromTemp(tempFilePath: string, storageKey: string): Promise<{ size: number; key: string }>;

  /**
   * Get a readable stream for downloading a file
   */
  getFileStream(storageKey: string): Promise<Readable>;

  /**
   * Delete a stored file
   */
  deleteFile(storageKey: string): Promise<void>;

  /**
   * Check if a file exists
   */
  fileExists(storageKey: string): Promise<boolean>;

  /**
   * Get total storage size used (in bytes)
   */
  getTotalStorageUsed(): Promise<number>;
}
