import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/services/prisma';
import { createTestApkBuffer } from './helpers';

const app = createApp();

describe('Android updates and public download portal (Modules 05-06)', () => {
  let adminToken: string;
  let devToken: string;
  let devUserId: string;
  let projectId: string;
  let appId: string;
  let privateAppId: string;
  let slug: string;
  let productionReleaseId: string;
  let devReleaseId: string;

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@relixor.internal', password: 'AdminPassword123!' });
    adminToken = admin.body.data.token;

    const dev = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dev@relixor.internal', password: 'DevPassword123!' });
    devToken = dev.body.data.token;
    devUserId = dev.body.data.user.id;

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Portal Project', slug: `portal-${Date.now()}` });
    projectId = project.body.data.id;

    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/apps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Portal App',
        packageName: `com.portal.${Date.now()}`,
        description: 'Public portal test application',
      });
    appId = created.body.data.id;

    const privateApp = await request(app)
      .post(`/api/v1/projects/${projectId}/apps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Private App', packageName: `com.portal.private.${Date.now()}` });
    privateAppId = privateApp.body.data.id;

    const prod = await request(app)
      .post(`/api/v1/apps/${appId}/releases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', createTestApkBuffer('Portal', '1.0.0'), 'portal-1.0.0.apk')
      .field('version', '1.0.0')
      .field('versionCode', '100')
      .field('channel', 'PRODUCTION')
      .field('notes', 'Stable release notes')
      .field('isMandatory', 'true');
    productionReleaseId = prod.body.data.id;

    await request(app)
      .post(`/api/v1/apps/${appId}/releases/${productionReleaseId}/submit`)
      .set('Authorization', `Bearer ${adminToken}`);
    await request(app)
      .post(`/api/v1/apps/${appId}/releases/${productionReleaseId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    await request(app)
      .post(`/api/v1/apps/${appId}/releases/${productionReleaseId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);

    const devRelease = await request(app)
      .post(`/api/v1/apps/${appId}/releases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', createTestApkBuffer('Portal', '2.0.0-beta'), 'portal-beta.apk')
      .field('version', '2.0.0-beta')
      .field('versionCode', '200')
      .field('channel', 'DEV')
      .field('notes', 'Internal dev build');
    devReleaseId = devRelease.body.data.id;
    await request(app)
      .post(`/api/v1/apps/${appId}/releases/${devReleaseId}/submit`)
      .set('Authorization', `Bearer ${adminToken}`);
    await request(app)
      .post(`/api/v1/apps/${appId}/releases/${devReleaseId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    await request(app)
      .post(`/api/v1/apps/${appId}/releases/${devReleaseId}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);

    slug = `portal-app-${Date.now()}`;
    await request(app)
      .put(`/api/v1/apps/${appId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isPublic: true, publicSlug: slug });
  });

  afterAll(async () => {
    if (appId) await prisma.app.delete({ where: { id: appId } }).catch(() => {});
    if (privateAppId) await prisma.app.delete({ where: { id: privateAppId } }).catch(() => {});
    if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('requires authentication for private update checks', async () => {
    const res = await request(app).get(`/api/v1/apps/${appId}/updates/check?currentVersionCode=90`);
    expect(res.status).toBe(401);
  });

  it('denies update checks to users without app access', async () => {
    const res = await request(app)
      .get(`/api/v1/apps/${appId}/updates/check?currentVersionCode=90`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(res.status).toBe(403);
  });

  it('reports update availability and mandatory status to authorized users', async () => {
    await request(app)
      .post(`/api/v1/apps/${appId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: devUserId, role: 'VIEWER' });

    const res = await request(app)
      .get(`/api/v1/apps/${appId}/updates/check?currentVersionCode=90&channel=PRODUCTION`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.updateAvailable).toBe(true);
    expect(res.body.data.mandatoryUpdate).toBe(true);
    expect(res.body.data.latest.version).toBe('1.0.0');
    expect(res.body.data.latest.sha256).toBeDefined();
    expect(res.body.data.downloadPath).toContain(`/releases/${productionReleaseId}/download`);
  });

  it('returns no update when the installed version code is current', async () => {
    const res = await request(app)
      .get(`/api/v1/apps/${appId}/updates/check?currentVersionCode=100`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.updateAvailable).toBe(false);
  });

  it('lists only explicitly public applications in the catalog', async () => {
    const res = await request(app).get('/api/v1/public/apps?limit=50');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((a: any) => a.id);
    expect(ids).toContain(appId);
    expect(ids).not.toContain(privateAppId);

    const portalApp = res.body.data.find((a: any) => a.id === appId);
    expect(portalApp.latestRelease.version).toBe('1.0.0');
    expect(portalApp.publicReleaseCount).toBe(1);
    expect(portalApp).not.toHaveProperty('storageKey');
  });

  it('exposes only the latest published production release and hides internal channels', async () => {
    const res = await request(app).get(`/api/v1/public/apps/${slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.latestRelease.version).toBe('1.0.0');
    expect(res.body.data.latestRelease.releaseNotes).toBe('Stable release notes');
    expect(res.body.data.releases.every((r: any) => r.version === '1.0.0')).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('2.0.0-beta');
    expect(JSON.stringify(res.body)).not.toContain('storageKey');
  });

  it('serves public update checks with a short-lived download URL', async () => {
    const res = await request(app).get(`/api/v1/public/apps/${slug}/updates/check?currentVersionCode=50`);
    expect(res.status).toBe(200);
    expect(res.body.data.updateAvailable).toBe(true);
    expect(res.body.data.mandatoryUpdate).toBe(true);
    expect(res.body.data.downloadUrl).toMatch(/^\/api\/v1\/downloads\//);
    expect(res.body.data.downloadUrl).not.toContain(adminToken);
  });

  it('redeems a public ticket exactly once with correct checksum headers', async () => {
    const ticketRes = await request(app).post(`/api/v1/public/apps/${slug}/download-ticket`);
    expect(ticketRes.status).toBe(200);
    const url = ticketRes.body.data.downloadUrl;

    const download = await request(app).get(url);
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toBe('application/vnd.android.package-archive');
    expect(download.headers['content-length']).toBe(String(ticketRes.body.data.fileSize));
    expect(download.headers['x-checksum-sha256']).toBe(ticketRes.body.data.sha256);

    const replay = await request(app).get(url);
    expect(replay.status).toBe(410);
    expect(replay.body.error.code).toBe('TICKET_INVALID');
  });

  it('rejects a tampered download ticket', async () => {
    const res = await request(app).get('/api/v1/downloads/not-a-valid-ticket');
    expect(res.status).toBe(410);
  });

  it('does not issue QR tickets for internal-channel releases', async () => {
    const res = await request(app)
      .get(`/api/v1/apps/${appId}/releases/${devReleaseId}/download-ticket`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('NOT_PUBLICLY_DOWNLOADABLE');
  });

  it('rejects user credentials supplied in the URL query string', async () => {
    const res = await request(app).get(
      `/api/v1/apps/${appId}/releases/${productionReleaseId}/download?token=${adminToken}`
    );
    expect(res.status).toBe(401);
  });

  it('does not issue public tickets for private applications', async () => {
    const res = await request(app).post(`/api/v1/public/apps/${privateAppId}/download-ticket`);
    expect(res.status).toBe(404);
  });

  it('removes an application from the portal when publication is disabled', async () => {
    await request(app)
      .put(`/api/v1/apps/${appId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isPublic: false });

    const res = await request(app).get(`/api/v1/public/apps/${slug}`);
    expect(res.status).toBe(404);

    const catalog = await request(app).get('/api/v1/public/apps?search=Portal%20App');
    expect(catalog.body.data.map((a: any) => a.id)).not.toContain(appId);

    await request(app)
      .put(`/api/v1/apps/${appId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isPublic: true });
  });
});
