import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/services/prisma';
import { createTestApkBuffer } from './helpers';

const app = createApp();

describe('Role-specific dashboards (Module 04)', () => {
  let adminToken: string;
  let devToken: string;
  let viewerToken: string;
  let devUserId: string;
  let viewerUserId: string;
  let projectId: string;
  let appId: string;
  let scopedAppId: string;

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@relixor.internal', password: 'AdminPassword123!' });
    adminToken = admin.body.data.token;

    // Dedicated users keep dashboard isolation assertions independent of other suites.
    const devEmail = `dashboard-dev-${Date.now()}@relixor.internal`;
    const devCreated = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dashboard Developer', email: devEmail, password: 'DashboardPass123!', role: 'DEVELOPER' });
    devUserId = devCreated.body.data.id;
    const dev = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: devEmail, password: 'DashboardPass123!' });
    devToken = dev.body.data.token;

    const viewerEmail = `dashboard-viewer-${Date.now()}@relixor.internal`;
    const viewerCreated = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dashboard Viewer', email: viewerEmail, password: 'DashboardPass123!', role: 'VIEWER' });
    viewerUserId = viewerCreated.body.data.id;
    const viewer = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: viewerEmail, password: 'DashboardPass123!' });
    viewerToken = viewer.body.data.token;

    const proj = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dashboard Project', slug: `dashboard-${Date.now()}` });
    projectId = proj.body.data.id;

    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/apps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dashboard App', packageName: `com.dashboard.${Date.now()}` });
    appId = created.body.data.id;

    const scopedApp = await request(app)
      .post(`/api/v1/projects/${projectId}/apps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Unrelated Dashboard App', packageName: `com.dashboard.other.${Date.now()}` });
    scopedAppId = scopedApp.body.data.id;

    await request(app)
      .post(`/api/v1/apps/${appId}/releases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', createTestApkBuffer('Dashboard', '1.0.0'), 'dashboard.apk')
      .field('version', '1.0.0')
      .field('versionCode', '100')
      .field('channel', 'QA');
  });

  afterAll(async () => {
    if (appId) await prisma.app.delete({ where: { id: appId } }).catch(() => {});
    if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('returns an empty restricted dashboard for an unassigned developer', async () => {
    const res = await request(app)
      .get('/api/v1/stats/overview')
      .set('Authorization', `Bearer ${devToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.scope).toBe('RESTRICTED');
    expect(res.body.data.totals.apps).toBe(0);
    expect(res.body.data.totals.releases).toBe(0);
    expect(res.body.data.totals.users).toBeNull();
    expect(res.body.data.recentUploads).toEqual([]);
    expect(res.body.data.recentActivity).toEqual([]);
    expect(res.body.data.securityEvents).toEqual([]);
  });

  it('scopes developer figures to assigned applications', async () => {
    await request(app)
      .post(`/api/v1/apps/${appId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: devUserId, role: 'DEVELOPER' });

    const res = await request(app)
      .get('/api/v1/stats/overview')
      .set('Authorization', `Bearer ${devToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totals.apps).toBe(1);
    expect(res.body.data.totals.releases).toBe(1);
    expect(res.body.data.totals.users).toBeNull();
    expect(res.body.data.recentUploads.every((r: any) => r.app.id === appId)).toBe(true);
    expect(res.body.data.assignedProjects.map((p: any) => p.id)).toEqual([projectId]);
    expect(res.body.data.channelCounts.QA).toBe(1);
  });

  it('scopes a viewer and exposes QA review queues only for authorized apps', async () => {
    await request(app)
      .post(`/api/v1/apps/${appId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: viewerUserId, role: 'VIEWER' });

    const res = await request(app)
      .get('/api/v1/stats/overview')
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.totals.apps).toBe(1);
    expect(res.body.data.totals.pendingApprovals).toBe(0);
    expect(res.body.data.pendingQaVerifications).toBe(1);
    expect(res.body.data.qaReleases).toEqual([]);
    expect(res.body.data.securityEvents).toEqual([]);
  });

  it('grants administrators global totals and security events', async () => {
    const res = await request(app)
      .get('/api/v1/stats/overview')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.scope).toBe('GLOBAL');
    expect(res.body.data.totals.users).toBeGreaterThanOrEqual(3);
    expect(res.body.data.totals.apps).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(res.body.data.securityEvents)).toBe(true);
  });

  it('enforces a scoped API token dashboard boundary', async () => {
    const tokenRes = await request(app)
      .post('/api/v1/tokens')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Dashboard Scoped Token', permission: 'READ', appId: scopedAppId });
    expect(tokenRes.status).toBe(201);

    const res = await request(app)
      .get('/api/v1/stats/overview')
      .set('X-API-Key', tokenRes.body.data.plaintextToken);
    expect(res.status).toBe(200);
    expect(res.body.data.totals.apps).toBe(1);
    expect(res.body.data.totals.releases).toBe(0);
    expect(res.body.data.totals.users).toBeNull();
  });
});
