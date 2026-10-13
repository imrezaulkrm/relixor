import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/services/prisma';
import { createTestApkBuffer } from './helpers';

const app = createApp();

describe('APK Publishing and Releases CI/CD API', () => {
  let adminToken: string;
  let testAppId: string;
  let ciApiToken: string;
  let releaseId: string;

  beforeAll(async () => {
    // 1. Login as Admin
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@relixor.internal', password: 'AdminPassword123!' });
    adminToken = adminRes.body.data.token;

    // 2. Create a test app
    const appRes = await request(app)
      .post('/api/v1/apps')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'CI Pipeline Test App',
        packageName: `com.cipipeline.test.${Date.now()}`,
        description: 'Test application for automated pipeline releases',
      });
    testAppId = appRes.body.data.id;

    // 3. Create a CI/CD API Token scoped to this app
    const tokenRes = await request(app)
      .post('/api/v1/tokens')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'GitLab CI Runner Token',
        permission: 'WRITE',
        appId: testAppId,
      });
    ciApiToken = tokenRes.body.data.plaintextToken;
  });

  afterAll(async () => {
    // Clean up test app
    if (testAppId) {
      await prisma.app.delete({ where: { id: testAppId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('rejects APK release upload without authorization', async () => {
    const apkBuffer = createTestApkBuffer('CIApp', '2.0.0');

    const res = await request(app)
      .post(`/api/v1/apps/${testAppId}/releases`)
      .attach('file', apkBuffer, 'app-release.apk')
      .field('version', '2.0.0')
      .field('versionCode', '200');

    expect(res.status).toBe(401);
  });

  it('successfully publishes a new APK release using CI/CD API Token', async () => {
    const apkBuffer = createTestApkBuffer('CIApp', '2.0.0');

    const res = await request(app)
      .post(`/api/v1/apps/${testAppId}/releases`)
      .set('Authorization', `Bearer ${ciApiToken}`)
      .attach('file', apkBuffer, 'app-release.apk')
      .field('version', '2.0.0')
      .field('versionCode', '200')
      .field('channel', 'STAGING')
      .field('notes', 'Automated build from GitLab CI/CD pipeline commit #1234');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.version).toBe('2.0.0');
    expect(res.body.data.versionCode).toBe(200);
    expect(res.body.data.channel).toBe('STAGING');
    expect(res.body.data.sha256).toBeDefined();
    expect(res.body.data.fileSize).toBeGreaterThan(0);

    releaseId = res.body.data.id;
  });

  it('prevents accidental duplicate releases with the same version and versionCode', async () => {
    const apkBuffer = createTestApkBuffer('CIApp', '2.0.0');

    const res = await request(app)
      .post(`/api/v1/apps/${testAppId}/releases`)
      .set('Authorization', `Bearer ${ciApiToken}`)
      .attach('file', apkBuffer, 'app-duplicate.apk')
      .field('version', '2.0.0')
      .field('versionCode', '200')
      .field('channel', 'STAGING');

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe('DUPLICATE_RELEASE');
  });

  it('lists published releases for the app', async () => {
    const res = await request(app)
      .get(`/api/v1/apps/${testAppId}/releases`)
      .set('Authorization', `Bearer ${ciApiToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].version).toBe('2.0.0');
  });

  it('downloads the published APK binary with correct checksum and headers', async () => {
    const res = await request(app)
      .get(`/api/v1/apps/${testAppId}/releases/${releaseId}/download`)
      .set('Authorization', `Bearer ${ciApiToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/vnd.android.package-archive');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['x-checksum-sha256']).toBeDefined();
    expect(res.body).toBeDefined();
  });
});
