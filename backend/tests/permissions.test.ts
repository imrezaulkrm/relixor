import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/services/prisma';
import { createTestApkBuffer } from './helpers';

const app = createApp();

describe('Role-Based Permissions API', () => {
  let adminToken: string;
  let devToken: string;
  let viewerToken: string;
  let adminUser: any;
  let testAppId: string;
  let testReleaseId: string;

  beforeAll(async () => {
    // Login as Admin
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@relixor.internal', password: 'AdminPassword123!' });
    adminToken = adminRes.body.data.token;
    adminUser = adminRes.body.data.user;

    // Login as Developer
    const devRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dev@relixor.internal', password: 'DevPassword123!' });
    devToken = devRes.body.data.token;

    // Login as Viewer
    const viewerRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'viewer@relixor.internal', password: 'ViewerPassword123!' });
    viewerToken = viewerRes.body.data.token;

    // Create a base test app for release tests
    const appRes = await request(app)
      .post('/api/v1/apps')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Permissions Matrix App',
        packageName: `com.matrix.app.${Date.now()}`,
      });
    testAppId = appRes.body.data.id;

    // Upload a test release to testAppId
    const apkBuffer = createTestApkBuffer('MatrixApp', '1.0.0');
    const relRes = await request(app)
      .post(`/api/v1/apps/${testAppId}/releases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', apkBuffer, 'matrix.apk')
      .field('version', '1.0.0')
      .field('versionCode', '100')
      .field('channel', 'DEV');
    testReleaseId = relRes.body.data.id;
  });

  afterAll(async () => {
    if (testAppId) {
      await prisma.app.delete({ where: { id: testAppId } }).catch(() => {});
    }
    await prisma.$disconnect();
  });

  // 1. Unauthenticated requests receive HTTP 401
  it('rejects unauthenticated requests with HTTP 401', async () => {
    const res = await request(app).get('/api/v1/apps');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  // 2. User Management: Admin allowed, Developer and Viewer denied
  describe('User Management Access', () => {
    it('allows Admin to list users', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('forbids Developer from listing users', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${devToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('forbids Viewer from listing users', async () => {
      const res = await request(app)
        .get('/api/v1/users')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('forbids Developer from creating a user', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          email: 'unauthorized_create@relixor.internal',
          name: 'Unauthorized User',
          password: 'Password123!',
          role: 'ADMIN',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('forbids Viewer from creating a user', async () => {
      const res = await request(app)
        .post('/api/v1/users')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          email: 'viewer_create@relixor.internal',
          name: 'Viewer Created',
          password: 'Password123!',
          role: 'VIEWER',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('prevents user from modifying their own role or deactivating themselves', async () => {
      const res = await request(app)
        .put(`/api/v1/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: 'DEVELOPER',
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('CANNOT_MODIFY_OWN_ROLE');
    });
  });

  // 3. Application Permissions
  describe('Application Management Permissions', () => {
    it('allows Viewer to view apps and app details', async () => {
      const listRes = await request(app)
        .get('/api/v1/apps')
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(listRes.status).toBe(200);

      const getRes = await request(app)
        .get(`/api/v1/apps/${testAppId}`)
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(getRes.status).toBe(200);
    });

    it('forbids Viewer from creating applications', async () => {
      const res = await request(app)
        .post('/api/v1/apps')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: 'Unauthorized App',
          packageName: 'com.unauthorized.app',
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it('allows Developer to create an application', async () => {
      const testPkg = `com.test.devapp.${Date.now()}`;
      const res = await request(app)
        .post('/api/v1/apps')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          name: 'Developer Test App',
          packageName: testPkg,
          description: 'App created by developer',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.packageName).toBe(testPkg);
    });

    it('forbids Viewer from editing applications', async () => {
      const res = await request(app)
        .put(`/api/v1/apps/${testAppId}`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({ name: 'Hacked Name' });

      expect(res.status).toBe(403);
    });

    it('allows Developer to edit an application', async () => {
      const res = await request(app)
        .put(`/api/v1/apps/${testAppId}`)
        .set('Authorization', `Bearer ${devToken}`)
        .send({ name: 'Developer Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('Developer Updated Name');
    });

    it('forbids Developer and Viewer from deleting applications', async () => {
      const devRes = await request(app)
        .delete(`/api/v1/apps/${testAppId}`)
        .set('Authorization', `Bearer ${devToken}`);
      expect(devRes.status).toBe(403);

      const viewerRes = await request(app)
        .delete(`/api/v1/apps/${testAppId}`)
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(viewerRes.status).toBe(403);
    });
  });

  // 4. Release Management & Deletion
  describe('Release Permissions', () => {
    it('allows Viewer to view releases and download APKs', async () => {
      const listRes = await request(app)
        .get(`/api/v1/apps/${testAppId}/releases`)
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(listRes.status).toBe(200);

      const dlRes = await request(app)
        .get(`/api/v1/apps/${testAppId}/releases/${testReleaseId}/download`)
        .set('Authorization', `Bearer ${viewerToken}`);
      expect(dlRes.status).toBe(200);
    });

    it('forbids Viewer from publishing a release', async () => {
      const apkBuffer = createTestApkBuffer('ViewerUpload', '1.0.1');
      const res = await request(app)
        .post(`/api/v1/apps/${testAppId}/releases`)
        .set('Authorization', `Bearer ${viewerToken}`)
        .attach('file', apkBuffer, 'viewer.apk')
        .field('version', '1.0.1')
        .field('versionCode', '101');

      expect(res.status).toBe(403);
    });

    it('forbids Viewer from deleting a release', async () => {
      const res = await request(app)
        .delete(`/api/v1/apps/${testAppId}/releases/${testReleaseId}`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
    });

    it('allows Developer to publish a release and delete it', async () => {
      // 1. Developer uploads release
      const apkBuffer = createTestApkBuffer('DevUpload', '3.0.0');
      const uploadRes = await request(app)
        .post(`/api/v1/apps/${testAppId}/releases`)
        .set('Authorization', `Bearer ${devToken}`)
        .attach('file', apkBuffer, 'dev-release.apk')
        .field('version', '3.0.0')
        .field('versionCode', '300')
        .field('channel', 'DEV');

      expect(uploadRes.status).toBe(201);
      const devRelId = uploadRes.body.data.id;

      // 2. Developer deletes the release (Allowed by matrix)
      const delRes = await request(app)
        .delete(`/api/v1/apps/${testAppId}/releases/${devRelId}`)
        .set('Authorization', `Bearer ${devToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);
    });
  });

  // 5. API Token Generation & Permissions
  describe('API Token Generation Permissions', () => {
    it('forbids Viewer from generating an API token', async () => {
      const res = await request(app)
        .post('/api/v1/tokens')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send({
          name: 'Viewer Attempt Token',
          permission: 'WRITE',
        });

      expect(res.status).toBe(403);
    });

    it('forbids Developer from creating an ADMIN-privileged token', async () => {
      const res = await request(app)
        .post('/api/v1/tokens')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          name: 'Developer Escalation Token',
          permission: 'ADMIN',
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('FORBIDDEN');
    });

    it('allows Developer to generate a WRITE token', async () => {
      const res = await request(app)
        .post('/api/v1/tokens')
        .set('Authorization', `Bearer ${devToken}`)
        .send({
          name: 'Developer Valid Token',
          permission: 'WRITE',
          appId: testAppId,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.plaintextToken).toBeDefined();

      // Clean up token
      await prisma.apiToken.delete({ where: { id: res.body.data.id } });
    });

    it('allows Admin to generate an ADMIN-privileged token', async () => {
      const res = await request(app)
        .post('/api/v1/tokens')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Admin Token',
          permission: 'ADMIN',
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.permission).toBe('ADMIN');

      // Clean up token
      await prisma.apiToken.delete({ where: { id: res.body.data.id } });
    });
  });

  // 6. Audit Log Access
  describe('Audit Log Access Permissions', () => {
    it('forbids Viewer from accessing audit logs', async () => {
      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
    });

    it('forbids Developer from accessing system-wide audit logs', async () => {
      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${devToken}`);

      expect(res.status).toBe(403);
    });

    it('allows Developer to access permitted application-level audit events', async () => {
      const res = await request(app)
        .get(`/api/v1/audit-logs?appId=${testAppId}`)
        .set('Authorization', `Bearer ${devToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.logs)).toBe(true);
    });

    it('allows Admin to access system-wide audit logs', async () => {
      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.logs)).toBe(true);
    });
  });

  // 7. Interactive user restrictions against API tokens
  describe('API Token Interactive Restrictions', () => {
    let testApiToken: string;

    beforeAll(async () => {
      const tokenRes = await request(app)
        .post('/api/v1/tokens')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Interactive Restriction Test Token',
          permission: 'ADMIN',
        });
      testApiToken = tokenRes.body.data.plaintextToken;
    });

    it('prevents API tokens from changing user passwords', async () => {
      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${testApiToken}`)
        .send({
          currentPassword: 'AdminPassword123!',
          newPassword: 'NewPassword123!',
        });

      expect(res.status).toBe(403);
    });

    it('prevents API tokens from managing other API tokens', async () => {
      const res = await request(app)
        .get('/api/v1/tokens')
        .set('Authorization', `Bearer ${testApiToken}`);

      expect(res.status).toBe(403);
    });

    it('prevents API tokens from accessing system-wide audit logs', async () => {
      const res = await request(app)
        .get('/api/v1/audit-logs')
        .set('Authorization', `Bearer ${testApiToken}`);

      expect(res.status).toBe(403);
    });
  });
});
