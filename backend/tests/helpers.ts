export function createTestApkBuffer(appName: string = 'TestApp', version: string = '1.0.0'): Buffer {
  const comment = Buffer.from(`Test APK Artifact: ${appName} v${version}`);
  const manifestContent = Buffer.from(`<?xml version="1.0" encoding="utf-8"?>\n<manifest package="com.test.${appName.toLowerCase()}">\n  <application android:label="${appName}" />\n</manifest>`);

  const fileName = 'AndroidManifest.xml';
  const fileNameBuf = Buffer.from(fileName, 'utf8');

  function crc32(buf: Buffer): number {
    let crc = 0 ^ -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ (((crc ^ buf[i]) & 0xff) * 0xedb88320);
    }
    return (crc ^ -1) >>> 0;
  }
  const fileCrc = crc32(manifestContent);

  const localHeader = Buffer.alloc(30);
  localHeader.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
  localHeader.writeUInt16LE(20, 4);
  localHeader.writeUInt16LE(0, 6);
  localHeader.writeUInt16LE(0, 8);
  localHeader.writeUInt16LE(0x4500, 10);
  localHeader.writeUInt16LE(0x5600, 12);
  localHeader.writeUInt32LE(fileCrc, 14);
  localHeader.writeUInt32LE(manifestContent.length, 18);
  localHeader.writeUInt32LE(manifestContent.length, 22);
  localHeader.writeUInt16LE(fileNameBuf.length, 26);
  localHeader.writeUInt16LE(0, 28);

  const localFile = Buffer.concat([localHeader, fileNameBuf, manifestContent]);

  const cdHeader = Buffer.alloc(46);
  cdHeader.writeUInt32LE(0x02014b50, 0);
  cdHeader.writeUInt16LE(20, 4);
  cdHeader.writeUInt16LE(20, 6);
  cdHeader.writeUInt16LE(0, 8);
  cdHeader.writeUInt16LE(0, 10);
  cdHeader.writeUInt16LE(0x4500, 12);
  cdHeader.writeUInt16LE(0x5600, 14);
  cdHeader.writeUInt32LE(fileCrc, 16);
  cdHeader.writeUInt32LE(manifestContent.length, 20);
  cdHeader.writeUInt32LE(manifestContent.length, 24);
  cdHeader.writeUInt16LE(fileNameBuf.length, 28);
  cdHeader.writeUInt16LE(0, 30);
  cdHeader.writeUInt16LE(comment.length, 32);
  cdHeader.writeUInt16LE(0, 34);
  cdHeader.writeUInt16LE(0, 36);
  cdHeader.writeUInt32LE(0, 38);
  cdHeader.writeUInt32LE(0, 42);

  const centralDir = Buffer.concat([cdHeader, fileNameBuf, comment]);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(localFile.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([localFile, centralDir, eocd]);
}
