import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/services/prisma';
import { createTestApkBuffer } from './helpers';

const app = createApp();

describe('Release lifecycle and approval workflow (Module 03)', () => {
  let adminToken: string;
  let devToken: string;
  let viewerToken: string;
  let devUserId: string;
  let viewerUserId: string;
  let projectId: string;
  let appId: string;
  let projectSlug: string;

  let v1Id: string;
  let v2Id: string;

  beforeAll(async () => {
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@relixor.internal', password: 'AdminPassword123!' });
    adminToken = adminRes.body.data.token;

    const devRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dev@relixor.internal', password: 'DevPassword123!' });
    devToken = devRes.body.data.token;
    devUserId = devRes.body.data.user.id;

    const viewerRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'viewer@relixor.internal', password: 'ViewerPassword123!' });
    viewerToken = viewerRes.body.data.token;
    viewerUserId = viewerRes.body.data.user.id;

    projectSlug = `release-lifecycle-${Date.now()}`;
    const projRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Release Lifecycle Project', slug: projectSlug });
    projectId = projRes.body.data.id;

    const appRes = await request(app)
      .post(`/api/v1/projects/${projectId}/apps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Release Lifecycle App', packageName: `com.lifecycle.${Date.now()}` });
    appId = appRes.body.data.id;

    await request(app)
      .post(`/api/v1/apps/${appId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: devUserId, role: 'DEVELOPER' });

    await request(app)
      .post(`/api/v1/apps/${appId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: viewerUserId, role: 'VIEWER' });
  });

  afterAll(async () => {
    if (appId) await prisma.app.delete({ where: { id: appId } }).catch(() => {});
    if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    await prisma.$disconnect();
  });

  async function upload(version: string, versionCode: number, token = devToken) {
    return request(app)
      .post(`/api/v1/apps/${appId}/releases`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', createTestApkBuffer('Lifecycle', version), `app-${version}.apk`)
      .field('version', version)
      .field('versionCode', String(versionCode))
      .field('channel', 'PRODUCTION')
      .field('notes', `Lifecycle ${version}`)
      .field('gitCommitSha', 'abcdef1234567890')
      .field('gitBranch', 'main')
      .field('gitlabPipelineId', '42')
      .field('gitlabPipelineUrl', 'https://gitlab.example.com/pipelines/42');
  }

  it('uploads a release in UPLOADED status with CI metadata and status history', async () => {
    const res = await upload('1.0.0', 100);
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('UPLOADED');
    expect(res.body.data.channel).toBe('PRODUCTION');
    expect(res.body.data.gitCommitSha).toBe('abcdef1234567890');
    expect(res.body.data.gitlabPipelineId).toBe('42');
    expect(res.body.data.approvedAt).toBeNull();
    expect(res.body.data.statusHistory.map((h: any) => h.toStatus)).toEqual(['UPLOADED']);
    v1Id = res.body.data.id;
  });

  it('refuses publication before approval (no implicit public release on upload)', async () => {
    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${v1Id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('APPROVAL_REQUIRED');
  });

  it('refuses approval before submission', async () => {
    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${v1Id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_TRANSITION');
  });

  it('submits an uploaded release for approval', async () => {
    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${v1Id}/submit`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING_APPROVAL');
  });

  it('blocks self-approval by the uploading developer', async () => {
    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${v1Id}/approve`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SELF_APPROVAL_FORBIDDEN');
  });

  it('prevents viewers from approving or publishing', async () => {
    const approve = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${v1Id}/approve`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(approve.status).toBe(403);

    const publish = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${v1Id}/publish`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(publish.status).toBe(403);
  });

  it('allows an administrator to approve and records approval history', async () => {
    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${v1Id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('APPROVED');
    expect(res.body.data.approvedAt).not.toBeNull();
    expect(res.body.data.approvedBy.email).toBe('admin@relixor.internal');

    const history = res.body.data.statusHistory.map((h: any) => h.toStatus);
    expect(history).toEqual(['UPLOADED', 'PENDING_APPROVAL', 'APPROVED']);
  });

  it('publishes an approved production release and exposes it as current', async () => {
    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${v1Id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PUBLISHED');
    expect(res.body.data.publishedAt).not.toBeNull();

    const current = await request(app)
      .get(`/api/v1/apps/${appId}/releases/current`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(current.status).toBe(200);
    expect(current.body.data.id).toBe(v1Id);
  });

  it('keeps app publication private by default and allows administrators to enable it', async () => {
    const create = await request(app)
      .post(`/api/v1/projects/${projectId}/apps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Publication Settings App', packageName: `com.publication.${Date.now()}` });
    const publicationAppId = create.body.data.id;
    expect(create.body.data.isPublic).toBe(false);

    const publishRes = await request(app)
      .put(`/api/v1/apps/${publicationAppId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isPublic: true, publicSlug: `publication-${Date.now()}` });
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.data.isPublic).toBe(true);
    expect(publishRes.body.data.publicSlug).toBeDefined();

    await prisma.app.delete({ where: { id: publicationAppId } });
  });

  it('rejects a release with a mandatory reason and records it', async () => {
    const v2 = await upload('2.0.0', 200);
    expect(v2.status).toBe(201);
    v2Id = v2.body.data.id;

    await request(app)
      .post(`/api/v1/apps/${appId}/releases/${v2Id}/submit`)
      .set('Authorization', `Bearer ${devToken}`);

    const noReason = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${v2Id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(noReason.status).toBe(400);
    expect(noReason.body.error.code).toBe('REASON_REQUIRED');

    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${v2Id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Crashes on Android 12' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('REJECTED');
    expect(res.body.data.rejectionReason).toBe('Crashes on Android 12');
  });

  it('allows a rejected release to be resubmitted', async () => {
    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${v2Id}/submit`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PENDING_APPROVAL');
    expect(res.body.data.rejectionReason).toBeNull();
  });

  it('publishes a second production release and deprecates the previous one', async () => {
    await request(app)
      .post(`/api/v1/apps/${appId}/releases/${v2Id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`);
    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${v2Id}/publish`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('PUBLISHED');

    const previous = await prisma.release.findUnique({ where: { id: v1Id } });
    expect(previous?.status).toBe('DEPRECATED');
  });

  it('rolls back to the previous production release', async () => {
    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases/rollback`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(v1Id);
    expect(res.body.data.status).toBe('PUBLISHED');

    const rolledBack = await prisma.release.findUnique({ where: { id: v2Id } });
    expect(rolledBack?.status).toBe('DEPRECATED');
  });

  it('resets approval when promoting a release to PRODUCTION', async () => {
    const devRes = await request(app)
      .post(`/api/v1/apps/${appId}/releases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', createTestApkBuffer('Lifecycle', '3.0.0'), 'app-3.0.0.apk')
      .field('version', '3.0.0')
      .field('versionCode', '300')
      .field('channel', 'STAGING');
    const stagingId = devRes.body.data.id;

    const promote = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${stagingId}/promote`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ channel: 'PRODUCTION' });
    expect(promote.status).toBe(200);
    expect(promote.body.data.channel).toBe('PRODUCTION');
    expect(promote.body.data.status).toBe('PENDING_APPROVAL');
    expect(promote.body.data.approvedAt).toBeNull();
  });

  it('compares two releases', async () => {
    const res = await request(app)
      .get(`/api/v1/apps/${appId}/releases/compare?left=${v2Id}&right=${v1Id}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.newer).toBe('left');
    expect(res.body.data.versionCodeDelta).toBeGreaterThan(0);
  });

  it('filters and paginates the scoped global release catalog', async () => {
    const res = await request(app)
      .get(`/api/v1/releases?projectId=${projectId}&channel=PRODUCTION&limit=2&page=1&sortBy=versionCode&order=desc`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.meta.limit).toBe(2);
    expect(res.body.data.every((r: any) => r.channel === 'PRODUCTION')).toBe(true);

    const devScoped = await request(app)
      .get(`/api/v1/releases?projectId=${projectId}`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(devScoped.status).toBe(200);
    expect(devScoped.body.data.every((r: any) => r.appId === appId)).toBe(true);
  });

  it('prevents cross-application release access by guessed IDs', async () => {
    const otherProject = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Other Lifecycle', slug: `other-lifecycle-${Date.now()}` });
    const otherApp = await request(app)
      .post(`/api/v1/projects/${otherProject.body.data.id}/apps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Other App', packageName: `com.other.lifecycle.${Date.now()}` });

    const res = await request(app)
      .get(`/api/v1/apps/${otherApp.body.data.id}/releases/${v1Id}`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(res.status).toBe(403);

    await prisma.project.delete({ where: { id: otherProject.body.data.id } }).catch(() => {});
  });

  it('writes audit events for submission, approval, rejection and publication', async () => {
    const actions = await prisma.auditLog.findMany({
      where: { appId, action: { in: ['RELEASE_SUBMIT_APPROVAL', 'RELEASE_APPROVE', 'RELEASE_REJECT', 'RELEASE_PUBLISH', 'RELEASE_ROLLBACK', 'RELEASE_PROMOTE'] } },
      select: { action: true },
    });
    const unique = new Set(actions.map((a) => a.action));
    expect(unique.has('RELEASE_SUBMIT_APPROVAL')).toBe(true);
    expect(unique.has('RELEASE_APPROVE')).toBe(true);
    expect(unique.has('RELEASE_REJECT')).toBe(true);
    expect(unique.has('RELEASE_PUBLISH')).toBe(true);
    expect(unique.has('RELEASE_ROLLBACK')).toBe(true);
    expect(unique.has('RELEASE_PROMOTE')).toBe(true);
  });
});
