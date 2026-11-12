import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/services/prisma';
import { createTestApkBuffer } from './helpers';

const app = createApp();

describe('QA reports and exports (Module 08)', () => {
  let adminToken: string;
  let devToken: string;
  let devUserId: string;
  let outsiderToken: string;
  let projectId: string;
  let appId: string;
  let releaseId: string;

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

    const outsiderEmail = `qa-outsider-${Date.now()}@relixor.internal`;
    await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'QA Outsider', email: outsiderEmail, password: 'OutsiderPass123!', role: 'VIEWER' });
    const outsider = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: outsiderEmail, password: 'OutsiderPass123!' });
    outsiderToken = outsider.body.data.token;

    const project = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'QA Reporting Project', slug: `qa-reporting-${Date.now()}` });
    projectId = project.body.data.id;

    const created = await request(app)
      .post(`/api/v1/projects/${projectId}/apps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'QA Reporting App', packageName: `com.qa.reporting.${Date.now()}`, description: 'Report app' });
    appId = created.body.data.id;

    await request(app)
      .post(`/api/v1/apps/${appId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: devUserId, role: 'DEVELOPER' });

    const release = await request(app)
      .post(`/api/v1/apps/${appId}/releases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', createTestApkBuffer('QAReport', '1.0.0'), 'qa.apk')
      .field('version', '1.0.0')
      .field('versionCode', '100')
      .field('channel', 'QA')
      .field('notes', 'QA candidate');
    releaseId = release.body.data.id;
  });

  afterAll(async () => {
    if (appId) await prisma.app.delete({ where: { id: appId } }).catch(() => {});
    if (projectId) await prisma.project.delete({ where: { id: projectId } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('records QA verification results with reviewer identity', async () => {
    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${releaseId}/qa-verifications`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: 'PASS', notes: '=cmd() formula check' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('PASS');
    expect(res.body.data.reviewer.id).toBe(devUserId);

    const second = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${releaseId}/qa-verifications`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'BLOCKED', notes: 'Printer flow blocked' });
    expect(second.status).toBe(201);

    const list = await request(app)
      .get(`/api/v1/apps/${appId}/releases/${releaseId}/qa-verifications`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveLength(2);

    const summary = await request(app)
      .get(`/api/v1/apps/${appId}/releases/${releaseId}/qa-summary`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(summary.status).toBe(200);
    expect(summary.body.data.counts.PASS).toBe(1);
    expect(summary.body.data.counts.BLOCKED).toBe(1);
    expect(summary.body.data.tested).toBe(true);
  });

  it('updates an existing reviewer result instead of duplicating it', async () => {
    const res = await request(app)
      .post(`/api/v1/apps/${appId}/releases/${releaseId}/qa-verifications`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ status: 'FAIL', notes: '=cmd() regression found' });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('FAIL');

    const count = await prisma.qaVerification.count({ where: { releaseId } });
    expect(count).toBe(2);
  });

  it('produces a scoped JSON report with real recorded results only', async () => {
    const res = await request(app)
      .get(`/api/v1/reports/qa?projectId=${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const row = res.body.data.rows.find((r: any) => r.version === '1.0.0');
    expect(row).toBeDefined();
    expect(row.qaResult).toContain('FAIL');
    expect(row.qaResult).toContain('BLOCKED');
    expect(row.qaReviewers).toContain('Alex Developer');
    expect(res.body.data.summary.totalReleases).toBe(1);
    expect(res.body.data.summary.failed).toBe(1);
  });

  it('does not leak unreleased QA data to an unassigned user', async () => {
    const res = await request(app)
      .get('/api/v1/reports/qa')
      .set('Authorization', `Bearer ${outsiderToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.rows).toEqual([]);
    expect(res.body.data.summary.totalReleases).toBe(0);
  });

  it('exports CSV with stable headers, escaped values and formula neutralisation', async () => {
    const res = await request(app)
      .get(`/api/v1/reports/qa/export?format=csv&appId=${appId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('.csv');
    expect(res.text).toContain('Project,Application,Package Name,Version,Version Code');
    expect(res.text).toContain('QA Result');
    expect(res.text).toContain("'=cmd() regression found");
  });

  it('exports a valid PDF report', async () => {
    const res = await request(app)
      .get(`/api/v1/reports/qa/export?format=pdf&appId=${appId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((response, callback) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => callback(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    const body: Buffer = res.body;
    expect(body.subarray(0, 5).toString()).toBe('%PDF-');
    expect(body.toString('latin1')).toContain('Relixor QA Report');
    expect(body.toString('latin1').trimEnd().endsWith('%%EOF')).toBe(true);
    expect(body.toString('latin1')).toContain('/Type /Page');
  });

  it('rejects unsupported export formats', async () => {
    const res = await request(app)
      .get('/api/v1/reports/qa/export?format=xlsx')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_FORMAT');
  });

  it('audits report exports', async () => {
    const audit = await prisma.auditLog.findFirst({
      where: {
        action: 'REPORT_EXPORT',
        userId: (await prisma.user.findUnique({ where: { email: 'admin@relixor.internal' } }))!.id,
        details: { contains: '"format":"csv"' },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit).not.toBeNull();
    expect(audit?.details).toContain('csv');
  });

  it('denies report exports to API tokens', async () => {
    const token = await request(app)
      .post('/api/v1/tokens')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Report Token', permission: 'READ' });

    const res = await request(app)
      .get('/api/v1/reports/qa/export?format=csv')
      .set('X-API-Key', token.body.data.plaintextToken);
    expect(res.status).toBe(403);
  });
});
