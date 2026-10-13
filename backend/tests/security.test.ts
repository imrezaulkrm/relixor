import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/services/prisma';
import { createTestApkBuffer } from './helpers';
import { LocalStorageProvider } from '../src/storage/LocalStorageProvider';
import path from 'path';

const app = createApp();

describe('Security & Hardening Audit Tests', () => {
  let adminToken: string;
  let devToken: string;
  let testAppId: string;
  let scopedApiToken: string;

  beforeAll(async () => {
    // 1. Admin login
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@relixor.internal', password: 'AdminPassword123!' });
    adminToken = adminRes.body.data.token;

    // 2. Dev login
    const devRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dev@relixor.internal', password: 'DevPassword123!' });
    devToken = devRes.body.data.token;

    // 3. Create test app
    const appRes = await request(app)
      .post('/api/v1/apps')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Security Test App',
        packageName: `com.security.test.${Date.now()}`,
      });
    testAppId = appRes.body.data.id;

    // 4. Create an API token scoped to testAppId
    const tokenRes = await request(app)
      .post('/api/v1/tokens')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Scoped CI Token',
        permission: 'WRITE',
        appId: testAppId,
      });
    scopedApiToken = tokenRes.body.data.plaintextToken;
  });

  afterAll(async () => {
    if (testAppId) {
      await prisma.app.delete({ where: { id: testAppId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  it('blocks path traversal attempts in LocalStorageProvider', async () => {
    const storage = new LocalStorageProvider('/tmp/relixor-test-storage');
    // Escape upwards
    await expect(storage.getFileStream('../../etc/passwd')).rejects.toThrow('Path traversal attempt detected');
    // Sibling directory with matching prefix (/tmp/relixor-test-storage-sibling)
    await expect(storage.getFileStream('../relixor-test-storage-sibling/stolen.apk')).rejects.toThrow('Path traversal attempt detected');
    // Absolute path escape
    await expect(storage.getFileStream('/etc/passwd')).rejects.toThrow('Path traversal attempt detected');
    // Empty or root key
    await expect(storage.getFileStream('')).rejects.toThrow('Path traversal attempt detected');
  });

  it('blocks release uploads with path traversal characters in version string', async () => {
    const apkBuffer = createTestApkBuffer('TraversalApp', '1.0.0');

    const res = await request(app)
      .post(`/api/v1/apps/${testAppId}/releases`)
      .set('Authorization', `Bearer ${scopedApiToken}`)
      .attach('file', apkBuffer, 'app.apk')
      .field('version', '../../evil-version')
      .field('versionCode', '101');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_VERSION_FORMAT');
  });

  it('prevents app-scoped API tokens from creating new applications', async () => {
    const res = await request(app)
      .post('/api/v1/apps')
      .set('Authorization', `Bearer ${scopedApiToken}`)
      .send({
        name: 'Escalated App',
        packageName: `com.escalated.test.${Date.now()}`,
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_APP_SCOPE');
  });

  it('prevents API tokens from generating other API tokens', async () => {
    const res = await request(app)
      .post('/api/v1/tokens')
      .set('Authorization', `Bearer ${scopedApiToken}`)
      .send({
        name: 'Chained Token',
        permission: 'WRITE',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('prevents API tokens from accessing user management endpoints', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${scopedApiToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('prevents developers from revoking other users tokens', async () => {
    // Admin creates token
    const tokenRes = await request(app)
      .post('/api/v1/tokens')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Admin Exclusive Token',
        permission: 'WRITE',
      });
    const adminTokenId = tokenRes.body.data.id;

    // Developer attempts to revoke admin's token
    const revokeRes = await request(app)
      .put(`/api/v1/tokens/${adminTokenId}/revoke`)
      .set('Authorization', `Bearer ${devToken}`);

    expect(revokeRes.status).toBe(403);
  });
});
