import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/services/prisma';
import { createTestApkBuffer } from './helpers';
import { executeCleanup } from '../src/services/retentionService';
import { getStorageProvider } from '../src/storage';

const app = createApp();

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

describe('APK retention and cleanup (Module 09)', () => {
  let adminToken: string;
  let devToken: string;
  let projectId: string;
  let appId: string;
  let oldDevId: string;
  let oldDevKey: string;
  let pinnedDevId: string;
  let approvedDevId: string;
  let oldProductionId: string;
  let recentDevId: string;

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@relixor.internal', password: 'AdminPassword123!' });
    adminToken = admin.body.data.token;

    const dev = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dev@relixor.internal', password: 'DevPassword123!' });
    devToken = dev.body.data.token;

    // Normalise policies so the suite is independent of previous runs.
    const defaults: Array<[string, number, boolean]> = [
      ['DEV', 7, true],
      ['QA', 30, true],
      ['STAGING', 60, true],
      ['BETA', 90, true],
      ['PRODUCTION', 0, false],
    ];
    for (const [channel, retentionDays, enabled] of defaults) {
      await prisma.retentionPolicy.upsert({
        where: { channel: channel as any },
        create: { channel: channel as any, retentionDays, enabled },
        update: { retentionDays, enabled },
      });
    }

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Retention Project', slug: `retention-${Date.now()}` });
    projectId = project.body.data.id;

    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/apps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Retention App', packageName: `com.retention.${Date.now()}` });
    appId = created.body.data.id;

    const upload = async (version: string, versionCode: number, channel: string) => {
      const res = await request(app)
        .post(`/api/v1/apps/${appId}/releases`)
        .set('Authorization', `Bearer ${adminToken}`)
        .attach('file', createTestApkBuffer('Retention', version), `retention-${versionCode}.apk`)
        .field('version', version)
        .field('versionCode', String(versionCode))
        .field('channel', channel);
      expect(res.status).toBe(201);
      return res.body.data;
    };

    const oldDev = await upload('1.0.0', 100, 'DEV');
    oldDevId = oldDev.id;
    oldDevKey = oldDev.storageKey;
    await prisma.release.update({ where: { id: oldDevId }, data: { createdAt: daysAgo(30) } });

    const pinned = await upload('1.0.1', 101, 'DEV');
    pinnedDevId = pinned.id;
    await prisma.release.update({
      where: { id: pinnedDevId },
      data: { createdAt: daysAgo(30), isPinned: true },
    });

    const approved = await upload('1.0.2', 102, 'DEV');
    approvedDevId = approved.id;
    await prisma.release.update({
      where: { id: approvedDevId },
      data: { createdAt: daysAgo(30), status: 'APPROVED' },
    });

    const production = await upload('1.0.3', 103, 'PRODUCTION');
    oldProductionId = production.id;
    await prisma.release.update({
      where: { id: oldProductionId },
      data: { createdAt: daysAgo(365), status: 'PUBLISHED', publishedAt: daysAgo(365) },
    });

    const recent = await upload('1.0.4', 104, 'DEV');
    recentDevId = recent.id;
  });

  afterAll(async () => {
    if (appId) await prisma.app.delete({ where: { id: appId } }).catch(() => {});
    if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('exposes default channel policies including disabled PRODUCTION', async () => {
    const res = await request(app)
      .get('/api/v1/retention/policies')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const byChannel = Object.fromEntries(res.body.data.map((p: any) => [p.channel, p]));
    expect(byChannel.DEV.retentionDays).toBe(7);
    expect(byChannel.QA.retentionDays).toBe(30);
    expect(byChannel.STAGING.retentionDays).toBe(60);
    expect(byChannel.PRODUCTION.enabled).toBe(false);
  });

  it('refuses to enable production auto-deletion', async () => {
    const res = await request(app)
      .put('/api/v1/retention/policies/PRODUCTION')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ retentionDays: 30, enabled: true });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PRODUCTION_RETENTION_FORBIDDEN');
  });

  it('allows administrators to adjust a non-production policy', async () => {
    const res = await request(app)
      .put('/api/v1/retention/policies/DEV')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ retentionDays: 10, enabled: true });
    expect(res.status).toBe(200);
    expect(res.body.data.retentionDays).toBe(10);
  });

  it('previews only eligible expired artifacts and never protected releases', async () => {
    const res = await request(app)
      .get('/api/v1/retention/candidates')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const ids = res.body.data.candidates.map((c: any) => c.id);
    expect(ids).toContain(oldDevId);
    expect(ids).not.toContain(pinnedDevId);
    expect(ids).not.toContain(approvedDevId);
    expect(ids).not.toContain(oldProductionId);
    expect(ids).not.toContain(recentDevId);
    expect(res.body.data.defaultMode).toBe('DRY_RUN');
    expect(res.body.data.deletionEnabled).toBe(false);
  });

  it('never deletes files during a dry run', async () => {
    const res = await request(app)
      .post('/api/v1/retention/cleanup')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'DRY_RUN' });
    expect(res.status).toBe(200);
    expect(res.body.data.filesDeleted).toBe(0);
    expect(await getStorageProvider().fileExists(oldDevKey)).toBe(true);

    const stillThere = await prisma.release.findUnique({ where: { id: oldDevId } });
    expect(stillThere?.status).not.toBe('ARCHIVED');
  });

  it('blocks explicit execution unless deployment configuration allows deletion', async () => {
    const res = await request(app)
      .post('/api/v1/retention/cleanup')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ mode: 'EXECUTE' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('RETENTION_EXECUTION_DISABLED');
    expect(await getStorageProvider().fileExists(oldDevKey)).toBe(true);
  });

  it('executes safely when authorized, archiving metadata and preserving protected files', async () => {
    const result = await executeCleanup('EXECUTE', 'DEV', { userId: undefined });
    expect(result.filesDeleted).toBeGreaterThanOrEqual(1);
    expect(await getStorageProvider().fileExists(oldDevKey)).toBe(false);

    const archived = await prisma.release.findUnique({ where: { id: oldDevId } });
    expect(archived?.status).toBe('ARCHIVED');
    expect(archived?.version).toBe('1.0.0');

    const pinned = await prisma.release.findUnique({ where: { id: pinnedDevId } });
    expect(pinned?.status).not.toBe('ARCHIVED');
    const approved = await prisma.release.findUnique({ where: { id: approvedDevId } });
    expect(approved?.status).toBe('APPROVED');
    const production = await prisma.release.findUnique({ where: { id: oldProductionId } });
    expect(production?.status).toBe('PUBLISHED');
  });

  it('records cleanup history and storage statistics', async () => {
    const history = await request(app)
      .get('/api/v1/retention/history')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(history.status).toBe(200);
    expect(history.body.data.length).toBeGreaterThanOrEqual(2);
    expect(history.body.data.some((r: any) => r.mode === 'EXECUTE')).toBe(true);

    const storage = await request(app)
      .get('/api/v1/retention/storage')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(storage.status).toBe(200);
    expect(storage.body.data.totals.productionReleases).toBeGreaterThanOrEqual(1);
    expect(storage.body.data.totals.protectedReleases).toBeGreaterThanOrEqual(1);
  });

  it('denies retention administration to non-admins', async () => {
    const res = await request(app)
      .get('/api/v1/retention/candidates')
      .set('Authorization', `Bearer ${devToken}`);
    expect(res.status).toBe(403);
  });
});
