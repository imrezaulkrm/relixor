import { PrismaClient, Role, ReleaseChannel } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

function createMinimalValidApkBuffer(appName: string, version: string): Buffer {
  // A minimal valid ZIP archive containing an AndroidManifest.xml entry
  // Standard zip file format with PK\x03\x04 header
  const comment = Buffer.from(`Relixor APK Artifact: ${appName} v${version}`);
  const manifestContent = Buffer.from(`<?xml version="1.0" encoding="utf-8"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.relixor.pos" android:versionCode="100" android:versionName="${version}">\n  <application android:label="${appName}" />\n</manifest>`);

  const fileName = 'AndroidManifest.xml';
  const fileNameBuf = Buffer.from(fileName, 'utf8');

  // CRC-32 calculation for zip
  function crc32(buf: Buffer): number {
    let crc = 0 ^ -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ (((crc ^ buf[i]) & 0xff) * 0xedb88320);
    }
    return (crc ^ -1) >>> 0;
  }
  const fileCrc = crc32(manifestContent);

  // Local file header: 30 bytes + filename + data
  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
  localHeader.writeUInt16LE(20, 4);         // version needed
  localHeader.writeUInt16LE(0, 6);          // general purpose flag
  localHeader.writeUInt16LE(0, 8);          // compression (stored = 0)
  localHeader.writeUInt16LE(0x4500, 10);    // mod time
  localHeader.writeUInt16LE(0x5600, 12);    // mod date
  localHeader.writeUInt32LE(fileCrc, 14);   // crc32
  localHeader.writeUInt32LE(manifestContent.length, 18); // comp size
  localHeader.writeUInt32LE(manifestContent.length, 22); // uncomp size
  localHeader.writeUInt16LE(fileNameBuf.length, 26);     // file name len
  localHeader.writeUInt16LE(0, 28);                     // extra field len

  const localFile = Buffer.concat([localHeader, fileNameBuf, manifestContent]);

  // Central directory header: 46 bytes + filename
  const cdHeader = Buffer.alloc(46);
  cdHeader.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
  cdHeader.writeUInt16LE(20, 4);         // version made by
  cdHeader.writeUInt16LE(20, 6);         // version needed
  cdHeader.writeUInt16LE(0, 8);          // flag
  cdHeader.writeUInt16LE(0, 10);         // compression
  cdHeader.writeUInt16LE(0x4500, 12);    // mod time
  cdHeader.writeUInt16LE(0x5600, 14);    // mod date
  cdHeader.writeUInt32LE(fileCrc, 16);   // crc32
  cdHeader.writeUInt32LE(manifestContent.length, 20); // comp size
  cdHeader.writeUInt32LE(manifestContent.length, 24); // uncomp size
  cdHeader.writeUInt16LE(fileNameBuf.length, 28);     // filename len
  cdHeader.writeUInt16LE(0, 30);                      // extra len
  cdHeader.writeUInt16LE(comment.length, 32);         // comment len
  cdHeader.writeUInt16LE(0, 34);                      // disk start
  cdHeader.writeUInt16LE(0, 36);                      // internal attr
  cdHeader.writeUInt32LE(0, 38);                      // external attr
  cdHeader.writeUInt32LE(0, 42);                      // relative offset of local header

  const centralDir = Buffer.concat([cdHeader, fileNameBuf, comment]);

  // End of central directory record: 22 bytes
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(0, 4);          // disk num
  eocd.writeUInt16LE(0, 6);          // start disk
  eocd.writeUInt16LE(1, 8);          // entries on disk
  eocd.writeUInt16LE(1, 10);         // total entries
  eocd.writeUInt32LE(centralDir.length, 12); // cd size
  eocd.writeUInt32LE(localFile.length, 16);  // cd offset
  eocd.writeUInt16LE(0, 20);                 // comment len

  return Buffer.concat([localFile, centralDir, eocd]);
}

async function main() {
  console.log('🌱 Starting Relixor database seed...');

  const isProduction = process.env.NODE_ENV === 'production';
  const adminEmail = process.env.ADMIN_DEFAULT_EMAIL || 'admin@relixor.internal';
  const adminName = process.env.ADMIN_DEFAULT_NAME || 'System Administrator';
  let adminPassword = process.env.ADMIN_DEFAULT_PASSWORD;

  // 1. Ensure Admin User
  let admin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!admin) {
    if (isProduction) {
      if (!adminPassword || adminPassword.trim() === '' || adminPassword === 'AdminPassword123!') {
        throw new Error(
          'FATAL CONFIGURATION ERROR: In production mode (NODE_ENV=production), ADMIN_DEFAULT_PASSWORD must be explicitly set with a strong, custom secret (minimum 12 characters). Silently using a default password is not permitted.'
        );
      }
      if (adminPassword.length < 12) {
        throw new Error(
          'FATAL CONFIGURATION ERROR: ADMIN_DEFAULT_PASSWORD must be at least 12 characters long in production mode.'
        );
      }
    } else {
      adminPassword = adminPassword || 'AdminPassword123!';
    }

    const adminHash = await bcrypt.hash(adminPassword, 10);
    admin = await prisma.user.create({
      data: {
        email: adminEmail,
        name: adminName,
        passwordHash: adminHash,
        role: Role.ADMIN,
        isActive: true,
      },
    });
    console.log(`✅ Created Administrator user: ${adminEmail}`);
  } else {
    console.log(`ℹ️ Admin user already exists: ${adminEmail}`);
  }

  // In production, do not create demo/sample users or mock apps unless explicitly enabled via SEED_DEMO_DATA=true
  const shouldSeedDemoData = !isProduction || process.env.SEED_DEMO_DATA === 'true';

  if (!shouldSeedDemoData) {
    console.log('ℹ️ Production mode active: Skipping demo user and mock artifact creation.');
    console.log('🎉 Relixor database initialization completed successfully!');
    return;
  }

  // 2. Ensure Developer User (Development/Test only)
  const devEmail = 'dev@relixor.internal';
  let devUser = await prisma.user.findUnique({ where: { email: devEmail } });
  if (!devUser) {
    const devHash = await bcrypt.hash('DevPassword123!', 10);
    devUser = await prisma.user.create({
      data: {
        email: devEmail,
        name: 'Alex Developer',
        passwordHash: devHash,
        role: Role.DEVELOPER,
        isActive: true,
      },
    });
    console.log(`✅ Created Demo Developer user: ${devEmail} (password: DevPassword123!)`);
  }

  // 3. Ensure Viewer User (Development/Test only)
  const viewerEmail = 'viewer@relixor.internal';
  let viewerUser = await prisma.user.findUnique({ where: { email: viewerEmail } });
  if (!viewerUser) {
    const viewerHash = await bcrypt.hash('ViewerPassword123!', 10);
    viewerUser = await prisma.user.create({
      data: {
        email: viewerEmail,
        name: 'Taylor Viewer',
        passwordHash: viewerHash,
        role: Role.VIEWER,
        isActive: true,
      },
    });
    console.log(`✅ Created Demo Viewer user: ${viewerEmail} (password: ViewerPassword123!)`);
  }

  // 4. Ensure Demo Application
  const packageName = 'com.relixor.pos';
  let demoApp = await prisma.app.findUnique({ where: { packageName } });
  if (!demoApp) {
    demoApp = await prisma.app.create({
      data: {
        name: 'Relixor POS Terminal',
        packageName,
        description: 'Next-generation Android Point of Sale client with real-time sync and offline payment processing.',
      },
    });
    console.log(`✅ Created Demo App: ${demoApp.name} (${demoApp.packageName})`);
  }

  // 5. Seed sample releases with real stored APK files
  const storageDir = path.resolve(process.env.STORAGE_LOCAL_DIR || path.join(process.cwd(), '../storage/apks'));
  if (!fs.existsSync(storageDir)) {
    fs.mkdirSync(storageDir, { recursive: true });
  }

  const sampleReleases = [
    {
      version: '1.0.0',
      versionCode: 100,
      channel: ReleaseChannel.PRODUCTION,
      notes: 'Initial production release. Includes offline checkout mode and contactless payments.',
    },
    {
      version: '1.1.0-rc.1',
      versionCode: 110,
      channel: ReleaseChannel.STAGING,
      notes: 'Staging release: Added Bluetooth thermal printer support and improved battery efficiency.',
    },
    {
      version: '1.2.0-beta.2',
      versionCode: 120,
      channel: ReleaseChannel.QA,
      notes: 'QA build with new inventory barcode scanner engine and enhanced camera focus.',
    },
  ];

  for (const rel of sampleReleases) {
    const existing = await prisma.release.findUnique({
      where: {
        app_version_unique: {
          appId: demoApp.id,
          version: rel.version,
          versionCode: rel.versionCode,
        },
      },
    });

    if (!existing) {
      const apkBuffer = createMinimalValidApkBuffer(demoApp.name, rel.version);
      const sha256 = crypto.createHash('sha256').update(apkBuffer).digest('hex');

      const storageSubDir = path.join(storageDir, 'apks', demoApp.id);
      if (!fs.existsSync(storageSubDir)) {
        fs.mkdirSync(storageSubDir, { recursive: true });
      }

      const storageKey = `apks/${demoApp.id}/${rel.channel.toLowerCase()}_v${rel.version}_vc${rel.versionCode}_${sha256.substring(0, 8)}.apk`;
      const fullFilePath = path.join(storageDir, storageKey);
      fs.writeFileSync(fullFilePath, apkBuffer);

      await prisma.release.create({
        data: {
          appId: demoApp.id,
          version: rel.version,
          versionCode: rel.versionCode,
          channel: rel.channel,
          releaseNotes: rel.notes,
          fileName: `relixor-pos-v${rel.version}.apk`,
          storageKey,
          fileSize: apkBuffer.length,
          sha256,
          downloadCount: Math.floor(Math.random() * 45) + 5,
          uploadedById: admin.id,
        },
      });
      console.log(`✅ Created Release: v${rel.version} (${rel.channel})`);
    }
  }

  console.log('🎉 Relixor database seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
