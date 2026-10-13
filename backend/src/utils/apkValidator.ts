import fs from 'fs';

export interface ApkValidationResult {
  isValid: boolean;
  error?: string;
}

/**
 * Validates that the uploaded file has valid ZIP/APK structure
 * APKs are ZIP archives and must start with the standard PK signature (0x50 0x4B 0x03 0x04)
 */
export async function validateApkFile(filePath: string): Promise<ApkValidationResult> {
  try {
    const stats = await fs.promises.stat(filePath);
    if (stats.size < 30) {
      return { isValid: false, error: 'File is too small to be a valid APK package.' };
    }

    const fd = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(4);
    await fd.read(buffer, 0, 4, 0);
    await fd.close();

    // Check PK\x03\x04 or PK\x05\x06 (empty zip) or PK\x07\x08
    const isZipSignature = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;

    if (!isZipSignature) {
      return {
        isValid: false,
        error: 'Invalid file signature. File must be a valid Android APK (ZIP archive format).',
      };
    }

    return { isValid: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown validation error';
    return { isValid: false, error: `APK validation failed: ${message}` };
  }
}
