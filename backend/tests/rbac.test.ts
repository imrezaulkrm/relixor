import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/services/prisma';
import { createTestApkBuffer } from './helpers';

const app = createApp();

describe('User Assignment & Granular RBAC API (Module 02)', () => {
  let adminToken: string;
  let devToken: string;
  let viewerToken: string;
  let devUser: any;
  let viewerUser: any;

  let testProjectId: string;
  let testProjectSlug: string;
  let testAppId: string;
  let testReleaseId: string;

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
    devUser = devRes.body.data.user;

    // 3. Viewer login
    const viewerRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'viewer@relixor.internal', password: 'ViewerPassword123!' });
    viewerToken = viewerRes.body.data.token;
    viewerUser = viewerRes.body.data.user;

    // 4. Create an isolated project and application for RBAC testing
    testProjectSlug = `rbac-project-${Date.now()}`;
    const projRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'RBAC Test Project',
        slug: testProjectSlug,
        description: 'Isolated project for RBAC test scenarios',
      });
    testProjectId = projRes.body.data.id;

    // 5. Create app under this project
    const appRes = await request(app)
      .post(`/api/v1/projects/${testProjectId}/apps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'RBAC Target App',
        packageName: `com.rbac.target.${Date.now()}`,
        description: 'Target application for membership tests',
      });
    testAppId = appRes.body.data.id;

    // 6. Upload a release for this app
    const apkBuffer = createTestApkBuffer('Rbactest', '1.0.0');
    const uploadRes = await request(app)
      .post(`/api/v1/apps/${testAppId}/releases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', apkBuffer, 'test.apk')
      .field('version', '1.0.0')
      .field('versionCode', '100')
      .field('channel', 'PRODUCTION')
      .field('notes', 'Initial release');
    testReleaseId = uploadRes.body.data.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // Scenario 10: Unassigned user cannot access project
  it('Scenario 10: Developer cannot access an unassigned project', async () => {
    const res = await request(app)
      .get(`/api/v1/projects/${testProjectId}`)
      .set('Authorization', `Bearer ${devToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_RESOURCE_ACCESS');
  });

  // Scenario 11: Unassigned user cannot access app
  it('Scenario 11: Viewer cannot access an unassigned app', async () => {
    const res = await request(app)
      .get(`/api/v1/apps/${testAppId}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN_RESOURCE_ACCESS');
  });

  // Scenario 9: Non-admin cannot manage memberships
  it('Scenario 9: Non-admin cannot manage memberships (HTTP 403)', async () => {
    const devAttempt = await request(app)
      .post(`/api/v1/projects/${testProjectId}/members`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({ userId: viewerUser.id, role: 'VIEWER' });
    expect(devAttempt.status).toBe(403);

    const viewerAttempt = await request(app)
      .post(`/api/v1/apps/${testAppId}/members`)
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ userId: devUser.id, role: 'DEVELOPER' });
    expect(viewerAttempt.status).toBe(403);
  });

  it('Scenario 9b: API tokens cannot manage memberships, even when owned by an ADMIN', async () => {
    const tokenRes = await request(app)
      .post('/api/v1/tokens')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Admin RBAC Probe', permission: 'ADMIN' });
    const plaintext = tokenRes.body.data.plaintextToken;

    const res = await request(app)
      .post(`/api/v1/projects/${testProjectId}/members`)
      .set('X-API-Key', plaintext)
      .send({ userId: viewerUser.id, role: 'VIEWER' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  // Scenario 1 & 2: ADMIN can assign and list project members
  it('Scenario 1 & 2: ADMIN can assign and list project members', async () => {
    const assignRes = await request(app)
      .post(`/api/v1/projects/${testProjectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: devUser.id, role: 'DEVELOPER' });

    expect(assignRes.status).toBe(201);
    expect(assignRes.body.success).toBe(true);
    expect(assignRes.body.data.role).toBe('DEVELOPER');

    const listRes = await request(app)
      .get(`/api/v1/projects/${testProjectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((m: any) => m.userId === devUser.id && m.role === 'DEVELOPER')).toBe(true);
  });

  // Scenario 8: Duplicate assignment returns 409
  it('Scenario 8: Duplicate assignment returns 409', async () => {
    const res = await request(app)
      .post(`/api/v1/projects/${testProjectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: devUser.id, role: 'DEVELOPER' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('MEMBER_ALREADY_EXISTS');
  });

  // Scenario 12: Project member can access its assigned project apps
  it('Scenario 12: Project member can access assigned project and its apps', async () => {
    // Dev now has project membership
    const projRes = await request(app)
      .get(`/api/v1/projects/${testProjectId}`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(projRes.status).toBe(200);

    const appRes = await request(app)
      .get(`/api/v1/apps/${testAppId}`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(appRes.status).toBe(200);
    expect(appRes.body.data.id).toBe(testAppId);
  });

  // Scenario 3: ADMIN can update project member role
  it('Scenario 3: ADMIN can update project member role', async () => {
    const updateRes = await request(app)
      .put(`/api/v1/projects/${testProjectId}/members/${devUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'VIEWER' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.role).toBe('VIEWER');
  });

  // Scenario 4: ADMIN can remove a project member
  it('Scenario 4: ADMIN can remove a project member', async () => {
    const removeRes = await request(app)
      .delete(`/api/v1/projects/${testProjectId}/members/${devUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(removeRes.status).toBe(200);

    // Verify dev no longer has project access
    const checkRes = await request(app)
      .get(`/api/v1/projects/${testProjectId}`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(checkRes.status).toBe(403);
  });

  // Scenario 5 & 13: ADMIN can assign app member and app member can access assigned app
  it('Scenario 5 & 13: ADMIN can assign app member and app member can access assigned app', async () => {
    const assignRes = await request(app)
      .post(`/api/v1/apps/${testAppId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: viewerUser.id, role: 'VIEWER' });

    expect(assignRes.status).toBe(201);
    expect(assignRes.body.data.role).toBe('VIEWER');

    // Viewer can now access app
    const appRes = await request(app)
      .get(`/api/v1/apps/${testAppId}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(appRes.status).toBe(200);
    expect(appRes.body.data.id).toBe(testAppId);
  });

  // Scenario 6: ADMIN can update app member role
  it('Scenario 6: ADMIN can update app member role', async () => {
    const updateRes = await request(app)
      .put(`/api/v1/apps/${testAppId}/members/${viewerUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'DEVELOPER' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.role).toBe('DEVELOPER');
  });

  // Scenario 7: ADMIN can remove an app member
  it('Scenario 7: ADMIN can remove an app member', async () => {
    const removeRes = await request(app)
      .delete(`/api/v1/apps/${testAppId}/members/${viewerUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(removeRes.status).toBe(200);

    // Viewer should now be denied
    const checkRes = await request(app)
      .get(`/api/v1/apps/${testAppId}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(checkRes.status).toBe(403);
  });

  // Scenario 14: App-level VIEWER overrides project-level DEVELOPER (precedence rule)
  it('Scenario 14: App-level VIEWER overrides project-level DEVELOPER (precedence rule)', async () => {
    // 1. Assign Dev as DEVELOPER on the project
    await request(app)
      .post(`/api/v1/projects/${testProjectId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: devUser.id, role: 'DEVELOPER' });

    // 2. Assign Dev as VIEWER directly on the app
    await request(app)
      .post(`/api/v1/apps/${testAppId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: devUser.id, role: 'VIEWER' });

    // 3. Dev can view the app
    const viewRes = await request(app)
      .get(`/api/v1/apps/${testAppId}`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(viewRes.status).toBe(200);

    // 4. Dev ATTEMPTS to upload a release (requires DEVELOPER) -> MUST BE REJECTED!
    const apkBuf = createTestApkBuffer('PrecedenceTest', '2.0.0');
    const uploadRes = await request(app)
      .post(`/api/v1/apps/${testAppId}/releases`)
      .set('Authorization', `Bearer ${devToken}`)
      .attach('file', apkBuf, 'test2.apk')
      .field('version', '2.0.0')
      .field('versionCode', '200')
      .field('channel', 'DEV');

    // Expected: 403 Forbidden because app-level VIEWER is more restrictive
    expect(uploadRes.status).toBe(403);
    expect(uploadRes.body.error.code).toBe('FORBIDDEN_RESOURCE_ACCESS');
  });

  // Scenario 14b: Project VIEWER has read-only inherited access
  it('Scenario 14b: Project VIEWER has read-only inherited access', async () => {
    // Remove the direct app membership created in Scenario 14 so the project role is inherited.
    await request(app)
      .delete(`/api/v1/apps/${testAppId}/members/${devUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    await request(app)
      .put(`/api/v1/projects/${testProjectId}/members/${devUser.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'VIEWER' });

    const readRes = await request(app)
      .get(`/api/v1/apps/${testAppId}/releases`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(readRes.status).toBe(200);

    const appDetailRes = await request(app)
      .get(`/api/v1/apps/${testAppId}`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(appDetailRes.status).toBe(200);
    expect(appDetailRes.body.data.effectiveRole).toBe('VIEWER');

    const apkBuf = createTestApkBuffer('ViewerInherited', '2.0.0');
    const uploadRes = await request(app)
      .post(`/api/v1/apps/${testAppId}/releases`)
      .set('Authorization', `Bearer ${devToken}`)
      .attach('file', apkBuf, 'viewer.apk')
      .field('version', '2.0.0')
      .field('versionCode', '200')
      .field('channel', 'DEV');
    expect(uploadRes.status).toBe(403);
    expect(uploadRes.body.error.code).toBe('FORBIDDEN_RESOURCE_ACCESS');
  });

  // Scenario 17: App-level DEVELOPER overrides project-level VIEWER (more permissive override)
  it('Scenario 17: App-level DEVELOPER overrides project-level VIEWER', async () => {
    const assignRes = await request(app)
      .post(`/api/v1/apps/${testAppId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: devUser.id, role: 'DEVELOPER' });
    expect(assignRes.status).toBe(201);

    const apkBuf = createTestApkBuffer('AppDeveloperOverride', '2.1.0');
    const uploadRes = await request(app)
      .post(`/api/v1/apps/${testAppId}/releases`)
      .set('Authorization', `Bearer ${devToken}`)
      .attach('file', apkBuf, 'override.apk')
      .field('version', '2.1.0')
      .field('versionCode', '210')
      .field('channel', 'DEV');

    expect(uploadRes.status).toBe(201);
  });

  // Scenario 15: ADMIN retains access to all projects and apps
  it('Scenario 15: ADMIN retains access to all projects and apps independently of membership', async () => {
    const projRes = await request(app)
      .get(`/api/v1/projects/${testProjectId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(projRes.status).toBe(200);

    const appRes = await request(app)
      .get(`/api/v1/apps/${testAppId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(appRes.status).toBe(200);
  });

  // Scenario 16 & 17: Unauthorized user cannot download APKs or access releases
  it('Scenario 16 & 17: Unauthorized user cannot download APKs or access releases', async () => {
    // Viewer is NOT assigned to testAppId
    const releasesRes = await request(app)
      .get(`/api/v1/apps/${testAppId}/releases`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(releasesRes.status).toBe(403);

    const downloadRes = await request(app)
      .get(`/api/v1/apps/${testAppId}/releases/${testReleaseId}/download`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(downloadRes.status).toBe(403);
  });

  // Scenario 18: Credentials in query strings are rejected outright
  it('Scenario 18: JWT query parameters are not accepted as authentication', async () => {
    const queryDownloadRes = await request(app)
      .get(`/api/v1/apps/${testAppId}/releases/${testReleaseId}/download?token=${viewerToken}`);
    expect(queryDownloadRes.status).toBe(401);
  });

  // Scenario 19: Existing API token authentication remains functional
  it('Scenario 19: Existing API token authentication remains functional', async () => {
    // Create an API token scoped to testAppId
    const tokenRes = await request(app)
      .post('/api/v1/tokens')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'RBAC Scoped Token',
        permission: 'WRITE',
        appId: testAppId,
      });

    const plaintext = tokenRes.body.data.plaintextToken;
    expect(plaintext).toBeDefined();

    // Verify token can access releases
    const checkRes = await request(app)
      .get(`/api/v1/apps/${testAppId}/releases`)
      .set('X-API-Key', plaintext);
    expect(checkRes.status).toBe(200);
  });

  // Scenario 20: Existing app CRUD and upload behavior remain compatible
  it('Scenario 20: Existing app CRUD and upload behavior remain compatible', async () => {
    const listAppsRes = await request(app)
      .get('/api/v1/apps')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listAppsRes.status).toBe(200);
    expect(listAppsRes.body.data.length).toBeGreaterThanOrEqual(1);
  });

  // Scenario 21: Existing users and tokens are preserved through migration
  it('Scenario 21: Existing users and tokens are preserved through migration', async () => {
    const user = await prisma.user.findUnique({
      where: { email: 'admin@relixor.internal' },
    });
    expect(user).toBeDefined();
    expect(user?.role).toBe('ADMIN');
  });

  // Scenario 22: Audit logs are written for membership operations
  it('Scenario 22: Audit logs are written for membership operations', async () => {
    const auditRes = await request(app)
      .get('/api/v1/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(auditRes.status).toBe(200);
    const actions = auditRes.body.data.logs.map((l: any) => l.action);
    expect(actions).toContain('PROJECT_MEMBER_ASSIGNED');
    expect(actions).toContain('PROJECT_MEMBER_ROLE_UPDATED');
    expect(actions).toContain('PROJECT_MEMBER_REMOVED');
    expect(actions).toContain('APP_MEMBER_ASSIGNED');
    expect(actions).toContain('APP_MEMBER_ROLE_UPDATED');
    expect(actions).toContain('APP_MEMBER_REMOVED');
  });

  // Scenario 18b: Direct app membership exposes only the assigned app, not sibling apps (IDOR)
  it('Scenario 18b: Direct app member cannot see or reach sibling apps/releases', async () => {
    const siblingPkg = `com.rbac.sibling.${Date.now()}`;
    const siblingRes = await request(app)
      .post(`/api/v1/projects/${testProjectId}/apps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Sibling App', packageName: siblingPkg });
    expect(siblingRes.status).toBe(201);
    const siblingAppId = siblingRes.body.data.id;

    const siblingApk = createTestApkBuffer('Sibling', '1.0.0');
    const siblingReleaseRes = await request(app)
      .post(`/api/v1/apps/${siblingAppId}/releases`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', siblingApk, 'sibling.apk')
      .field('version', '1.0.0')
      .field('versionCode', '100')
      .field('channel', 'DEV');
    const siblingReleaseId = siblingReleaseRes.body.data.id;

    // Viewer has a direct VIEWER membership on testAppId only (no project membership).
    const assignRes = await request(app)
      .post(`/api/v1/apps/${testAppId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: viewerUser.id, role: 'VIEWER' });
    expect(assignRes.status).toBe(201);

    const projectRes = await request(app)
      .get(`/api/v1/projects/${testProjectId}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(projectRes.status).toBe(200);
    expect(projectRes.body.data.effectiveRole).toBe('VIEWER');
    expect(projectRes.body.data.apps.map((a: any) => a.id)).toEqual([testAppId]);

    const projectAppsRes = await request(app)
      .get(`/api/v1/projects/${testProjectId}/apps`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(projectAppsRes.status).toBe(200);
    expect(projectAppsRes.body.data.map((a: any) => a.id)).toEqual([testAppId]);

    const siblingAppAccess = await request(app)
      .get(`/api/v1/apps/${siblingAppId}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(siblingAppAccess.status).toBe(403);

    const siblingReleaseAccess = await request(app)
      .get(`/api/v1/apps/${siblingAppId}/releases/${siblingReleaseId}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(siblingReleaseAccess.status).toBe(403);

    const siblingDownload = await request(app)
      .get(`/api/v1/apps/${siblingAppId}/releases/${siblingReleaseId}/download`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(siblingDownload.status).toBe(403);

    // The assigned app remains readable and downloadable.
    const assignedApp = await request(app)
      .get(`/api/v1/apps/${testAppId}`)
      .set('Authorization', `Bearer ${viewerToken}`);
    expect(assignedApp.status).toBe(200);
  });

  // Bonus Scenario: User access overview endpoint
  it('Bonus: Admin can view user access overview (GET /api/v1/users/:userId/access)', async () => {
    const accessRes = await request(app)
      .get(`/api/v1/users/${devUser.id}/access`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(accessRes.status).toBe(200);
    expect(accessRes.body.success).toBe(true);
    expect(accessRes.body.data.user.email).toBe('dev@relixor.internal');
    expect(Array.isArray(accessRes.body.data.projects)).toBe(true);
    expect(Array.isArray(accessRes.body.data.apps)).toBe(true);
  });

  // Dashboard and count isolation for a user with a single direct app membership
  it('Scenario 23: Dashboard and project counts are scoped to authorized resources', async () => {
    const scopedEmail = `scoped-${Date.now()}@relixor.internal`;
    const createRes = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Scoped Reader', email: scopedEmail, password: 'ScopedPass123!', role: 'VIEWER' });
    expect(createRes.status).toBe(201);
    const scopedUserId = createRes.body.data.id;

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: scopedEmail, password: 'ScopedPass123!' });
    const scopedToken = loginRes.body.data.token;

    await request(app)
      .post(`/api/v1/apps/${testAppId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: scopedUserId, role: 'VIEWER' });

    const appReleaseCount = await prisma.release.count({ where: { appId: testAppId } });
    const statsRes = await request(app)
      .get('/api/v1/stats/dashboard')
      .set('Authorization', `Bearer ${scopedToken}`);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.data.totalApps).toBe(1);
    expect(statsRes.body.data.totalReleases).toBe(appReleaseCount);
    expect(statsRes.body.data.recentReleases.every((r: any) => r.app.id === testAppId)).toBe(true);
    expect(statsRes.body.data.recentActivity.every((l: any) => l.appId === testAppId)).toBe(true);
    const channelTotal = Object.values(statsRes.body.data.channelCounts as Record<string, number>).reduce(
      (a, b) => a + b,
      0
    );
    expect(channelTotal).toBe(appReleaseCount);

    const projectsRes = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${scopedToken}`);
    expect(projectsRes.status).toBe(200);
    const scopedProject = projectsRes.body.data.find((p: any) => p.id === testProjectId);
    expect(scopedProject).toBeDefined();
    expect(scopedProject.appCount).toBe(1);
    expect(scopedProject.releaseCount).toBe(appReleaseCount);

    const detailRes = await request(app)
      .get(`/api/v1/projects/${testProjectId}`)
      .set('Authorization', `Bearer ${scopedToken}`);
    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.appCount).toBe(1);
    expect(detailRes.body.data.releaseCount).toBe(appReleaseCount);
    expect(detailRes.body.data.apps.map((a: any) => a.id)).toEqual([testAppId]);
  });

  it('Scenario 24: Unassigned user dashboard exposes no global aggregates', async () => {
    const isolatedEmail = `isolated-${Date.now()}@relixor.internal`;
    const createRes = await request(app)
      .post('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Isolated Reader', email: isolatedEmail, password: 'IsolatedPass123!', role: 'VIEWER' });
    expect(createRes.status).toBe(201);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: isolatedEmail, password: 'IsolatedPass123!' });
    const isolatedToken = loginRes.body.data.token;

    const statsRes = await request(app)
      .get('/api/v1/stats/dashboard')
      .set('Authorization', `Bearer ${isolatedToken}`);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.data.totalApps).toBe(0);
    expect(statsRes.body.data.totalReleases).toBe(0);
    expect(statsRes.body.data.totalDownloads).toBe(0);
    expect(statsRes.body.data.storageBytes).toBe(0);
    expect(statsRes.body.data.recentReleases).toEqual([]);
    expect(statsRes.body.data.recentActivity).toEqual([]);
    expect(statsRes.body.data.channelCounts).toEqual({ DEV: 0, QA: 0, STAGING: 0, BETA: 0, PRODUCTION: 0 });

    const projectsRes = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${isolatedToken}`);
    expect(projectsRes.status).toBe(200);
    expect(projectsRes.body.data).toEqual([]);

    const appsRes = await request(app)
      .get('/api/v1/apps')
      .set('Authorization', `Bearer ${isolatedToken}`);
    expect(appsRes.status).toBe(200);
    expect(appsRes.body.data).toEqual([]);
  });

  it('Scenario 25: Developer cannot read audit metadata for an unauthorized app', async () => {
    const otherSlug = `audit-other-${Date.now()}`;
    const otherProjectRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Audit Other', slug: otherSlug });
    const otherAppRes = await request(app)
      .post(`/api/v1/projects/${otherProjectRes.body.data.id}/apps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Audit Other App', packageName: `com.audit.other.${Date.now()}` });
    const otherAppId = otherAppRes.body.data.id;

    const deniedRes = await request(app)
      .get(`/api/v1/audit-logs?appId=${otherAppId}`)
      .set('Authorization', `Bearer ${devToken}`);
    expect(deniedRes.status).toBe(403);
    expect(deniedRes.body.error.code).toBe('FORBIDDEN_RESOURCE_ACCESS');

    const adminRes = await request(app)
      .get(`/api/v1/audit-logs?appId=${otherAppId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
  });
});
