import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { config } from '../config';

const tempDir = path.join(os.tmpdir(), 'relixor-uploads');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, tempDir);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname) || '.apk';
    cb(null, `upload-${uniqueSuffix}${ext}`);
  },
});

export const uploadApk = multer({
  storage,
  limits: {
    fileSize: config.storage.maxFileSizeMb * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    // Check if filename ends with .apk or mime type
    const isApkExt = file.originalname.toLowerCase().endsWith('.apk');
    if (!isApkExt) {
      return cb(new Error('Only .apk files are supported.'));
    }
    cb(null, true);
  },
});
