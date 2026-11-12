import crypto from 'crypto';
import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/services/prisma';
import { createTestApkBuffer } from './helpers';

const app = createApp();

describe('GitLab CI/CD upload integration (Module 07)', () => {
  let adminToken: string;
  let appId: string;
  let otherAppId: string;
  let writeToken: string;
  let readToken: string;
  let projectId: string;

  beforeAll(async () => {
    const admin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@relixor.internal', password: 'AdminPassword123!' });
    adminToken = admin.body.data.token;

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'CI Integration', slug: `ci-integration-${Date.now()}` });
    projectId = project.body.data.id;

    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/apps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'CI App', packageName: `com.ci.integration.${Date.now()}` });
    appId = created.body.data.id;

    const other = await request(app)
      .post(`/api/v1/projects/${projectId}/apps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'CI Other App', packageName: `com.ci.other.${Date.now()}` });
    otherAppId = other.body.data.id;

    const write = await request(app)
      .post('/api/v1/tokens')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'CI Write', permission: 'WRITE', appId });
    writeToken = write.body.data.plaintextToken;

    const read = await request(app)
      .post('/api/v1/tokens')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'CI Read', permission: 'READ', appId });
    readToken = read.body.data.plaintextToken;
  });

  afterAll(async () => {
    if (appId) await prisma.app.delete({ where: { id: appId } }).catch(() => {});
    if (otherAppId) await prisma.app.delete({ where: { id: otherAppId } }).catch(() => {});
    if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('rejects an upload whose declared checksum does not match', async () => {
    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases`)
      .set('X-API-Key', writeToken)
      .attach('file', createTestApkBuffer('CI', '1.0.0'), 'ci.apk')
      .field('version', '1.0.0')
      .field('versionCode', '100')
      .field('channel', 'DEV')
      .field('sha256', '0'.repeat(64));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CHECKSUM_MISMATCH');
    expect(await prisma.release.count({ where: { appId } })).toBe(0);
  });

  it('accepts a verified upload and records pipeline metadata', async () => {
    const buffer = createTestApkBuffer('CI', '1.0.0');
    const sha = crypto.createHash('sha256').update(buffer).digest('hex');

    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases`)
      .set('X-API-Key', writeToken)
      .attach('file', buffer, 'ci.apk')
      .field('version', '1.0.0')
      .field('versionCode', '100')
      .field('channel', 'DEV')
      .field('sha256', sha)
      .field('gitCommitSha', 'deadbeef')
      .field('gitBranch', 'main')
      .field('gitlabPipelineId', '9001')
      .field('gitlabPipelineUrl', 'https://gitlab.example.com/p/9001')
      .field('buildTimestamp', '2026-11-12T10:00:00.000Z');

    expect(res.status).toBe(201);
    expect(res.body.data.sha256).toBe(sha);
    expect(res.body.data.gitCommitSha).toBe('deadbeef');
    expect(res.body.data.gitlabPipelineId).toBe('9001');
    expect(res.body.data.status).toBe('UPLOADED');
  });

  it('returns a clear conflict when a pipeline retries the same build', async () => {
    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases`)
      .set('X-API-Key', writeToken)
      .attach('file', createTestApkBuffer('CI', '1.0.0'), 'ci.apk')
      .field('version', '1.0.0')
      .field('versionCode', '100')
      .field('channel', 'DEV');
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE_RELEASE');
  });

  it('denies uploads with a READ-only token', async () => {
    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases`)
      .set('X-API-Key', readToken)
      .attach('file', createTestApkBuffer('CI', '2.0.0'), 'ci.apk')
      .field('version', '2.0.0')
      .field('versionCode', '200');
    expect(res.status).toBe(403);
  });

  it('denies a token scoped to a different application', async () => {
    const res = await request(app)
      .post(`/api/v1/apps/${otherAppId}/releases`)
      .set('X-API-Key', writeToken)
      .attach('file', createTestApkBuffer('CI', '2.0.0'), 'ci.apk')
      .field('version', '2.0.0')
      .field('versionCode', '200');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_APP_SCOPE');
  });
});
