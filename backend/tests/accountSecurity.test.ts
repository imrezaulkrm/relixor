import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/services/prisma';

const app = createApp();

async function createUser(adminToken: string, role: 'DEVELOPER' | 'VIEWER' = 'DEVELOPER') {
  const email = `account-${Date.now()}-${Math.random().toString(16).slice(2)}@relixor.internal`;
  const password = 'InitialPass123!';
  const created = await request(app)
    .post('/api/v1/users')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ name: 'Account Test User', email, password, role });
  expect(created.status).toBe(201);
  return { id: created.body.data.id as string, email, password };
}

async function login(email: string, password: string) {
  return request(app).post('/api/v1/auth/login').send({ email, password });
}

describe('User profile and account security (Module 10)', () => {
  let adminToken: string;
  let alice: { id: string; email: string; password: string };
  let bob: { id: string; email: string; password: string };
  let aliceToken: string;

  beforeAll(async () => {
    const admin = await login('admin@relixor.internal', 'AdminPassword123!');
    adminToken = admin.body.data.token;

    alice = await createUser(adminToken);
    bob = await createUser(adminToken);

    const aliceLogin = await login(alice.email, alice.password);
    aliceToken = aliceLogin.body.data.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('returns the caller profile with assignments and never exposes password hashes', async () => {
    const res = await request(app)
      .get('/api/v1/profile')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(alice.email);
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
    expect(Array.isArray(res.body.data.projects)).toBe(true);
    expect(Array.isArray(res.body.data.apps)).toBe(true);
  });

  it('allows only permitted profile fields to change', async () => {
    const res = await request(app)
      .put('/api/v1/profile')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ name: 'Alice Updated', role: 'ADMIN', isActive: false });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Alice Updated');
    expect(res.body.data.role).toBe('DEVELOPER');
    expect(res.body.data.isActive).toBe(true);
  });

  it('requires the current password to change password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ currentPassword: 'WrongPassword123!', newPassword: 'NewAlicePass123!' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_CURRENT_PASSWORD');
  });

  it('changes password, revokes previous JWTs and keeps unrelated users signed in', async () => {
    // Establish a second session and an unrelated user's session.
    const secondSession = await login(alice.email, alice.password);
    const secondToken = secondSession.body.data.token;
    const bobLogin = await login(bob.email, bob.password);
    const bobToken = bobLogin.body.data.token;

    const res = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ currentPassword: alice.password, newPassword: 'NewAlicePass123!' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();

    const newToken = res.body.data.token;
    alice.password = 'NewAlicePass123!';

    const oldAccess = await request(app).get('/api/v1/profile').set('Authorization', `Bearer ${aliceToken}`);
    expect(oldAccess.status).toBe(401);
    expect(oldAccess.body.error.code).toBe('SESSION_REVOKED');

    const secondAccess = await request(app).get('/api/v1/profile').set('Authorization', `Bearer ${secondToken}`);
    expect(secondAccess.status).toBe(401);

    const newAccess = await request(app).get('/api/v1/profile').set('Authorization', `Bearer ${newToken}`);
    expect(newAccess.status).toBe(200);

    const bobAccess = await request(app).get('/api/v1/profile').set('Authorization', `Bearer ${bobToken}`);
    expect(bobAccess.status).toBe(200);

    aliceToken = newToken;
  });

  it('lists only the caller sessions and supports individual revocation', async () => {
    const secondLogin = await login(alice.email, alice.password);
    const secondToken = secondLogin.body.data.token;

    const list = await request(app)
      .get('/api/v1/profile/sessions')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThanOrEqual(2);
    const other = list.body.data.find((s: any) => !s.current && s.active);
    expect(other).toBeDefined();

    const revoke = await request(app)
      .delete(`/api/v1/profile/sessions/${other.id}`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(revoke.status).toBe(200);

    const revokedAccess = await request(app).get('/api/v1/profile').set('Authorization', `Bearer ${secondToken}`);
    expect(revokedAccess.status).toBe(401);
  });

  it('records own login activity including failed attempts, and logs out', async () => {
    await login(alice.email, 'WrongPassword123!');

    const activity = await request(app)
      .get('/api/v1/profile/activity')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(activity.status).toBe(200);
    const actions = activity.body.data.loginEvents.map((e: any) => e.action);
    expect(actions).toContain('LOGIN');
    expect(actions).toContain('FAILED_LOGIN');

    const logout = await request(app)
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(logout.status).toBe(200);

    const after = await request(app).get('/api/v1/profile').set('Authorization', `Bearer ${aliceToken}`);
    expect(after.status).toBe(401);

    const relogin = await login(alice.email, alice.password);
    expect(relogin.status).toBe(200);
    aliceToken = relogin.body.data.token;
  });

  it('prevents non-admins from inspecting or revoking other users sessions', async () => {
    const list = await request(app)
      .get(`/api/v1/users/${bob.id}/sessions`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(list.status).toBe(403);

    const revoke = await request(app)
      .delete(`/api/v1/users/${bob.id}/sessions`)
      .set('Authorization', `Bearer ${aliceToken}`);
    expect(revoke.status).toBe(403);
  });

  it('allows admins to inspect activity and revoke all sessions of a user', async () => {
    const bobLogin = await login(bob.email, bob.password);
    const bobToken = bobLogin.body.data.token;

    const sessions = await request(app)
      .get(`/api/v1/users/${bob.id}/sessions`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(sessions.status).toBe(200);
    expect(sessions.body.data.some((s: any) => s.active)).toBe(true);

    const revoke = await request(app)
      .delete(`/api/v1/users/${bob.id}/sessions`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(revoke.status).toBe(200);

    const bobAccess = await request(app).get('/api/v1/profile').set('Authorization', `Bearer ${bobToken}`);
    expect(bobAccess.status).toBe(401);

    const activity = await request(app)
      .get(`/api/v1/users/${bob.id}/activity`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(activity.status).toBe(200);
    expect(activity.body.data.loginEvents.length).toBeGreaterThan(0);
  });

  it('deactivation immediately invalidates access and blocks login', async () => {
    const carol = await createUser(adminToken);
    const carolLogin = await login(carol.email, carol.password);
    const carolToken = carolLogin.body.data.token;

    const deactivate = await request(app)
      .put(`/api/v1/users/${carol.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isActive: false });
    expect(deactivate.status).toBe(200);

    const access = await request(app).get('/api/v1/profile').set('Authorization', `Bearer ${carolToken}`);
    expect(access.status).toBe(401);

    const relogin = await login(carol.email, carol.password);
    expect(relogin.status).toBe(401);
  });

  it('issues hashed, expiring single-use reset tokens that revoke old sessions', async () => {
    const dave = await createUser(adminToken);
    const daveLogin = await login(dave.email, dave.password);
    const oldToken = daveLogin.body.data.token;

    const issued = await request(app)
      .post(`/api/v1/users/${dave.id}/password-reset`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(issued.status).toBe(201);
    const resetToken = issued.body.data.resetToken;
    expect(resetToken).toHaveLength(64);

    const stored = await prisma.passwordResetToken.findFirst({
      where: { userId: dave.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(stored).not.toBeNull();
    expect(stored?.tokenHash).not.toBe(resetToken);
    expect(stored?.tokenHash).toHaveLength(64);
    expect(stored?.usedAt).toBeNull();

    // Token is not usable before consumption and can only be consumed once.
    const reset = await request(app)
      .post('/api/v1/auth/password-reset')
      .send({ token: resetToken, newPassword: 'DaveNewPass123!' });
    expect(reset.status).toBe(200);

    const replay = await request(app)
      .post('/api/v1/auth/password-reset')
      .send({ token: resetToken, newPassword: 'AnotherPass123!' });
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe('INVALID_RESET_TOKEN');

    const oldAccess = await request(app).get('/api/v1/profile').set('Authorization', `Bearer ${oldToken}`);
    expect(oldAccess.status).toBe(401);

    const oldLogin = await login(dave.email, dave.password);
    expect(oldLogin.status).toBe(401);
    const newLogin = await login(dave.email, 'DaveNewPass123!');
    expect(newLogin.status).toBe(200);
  });

  it('rejects arbitrary reset tokens', async () => {
    const res = await request(app)
      .post('/api/v1/auth/password-reset')
      .send({ token: 'a'.repeat(64), newPassword: 'WhateverPass123!' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_RESET_TOKEN');
  });

  it('does not treat API tokens as interactive sessions', async () => {
    const tokenRes = await request(app)
      .post('/api/v1/tokens')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Account Security Probe', permission: 'ADMIN' });
    const apiToken = tokenRes.body.data.plaintextToken;

    const profileUpdate = await request(app)
      .put('/api/v1/profile')
      .set('X-API-Key', apiToken)
      .send({ name: 'Token Name' });
    expect(profileUpdate.status).toBe(403);

    const passwordChange = await request(app)
      .post('/api/v1/auth/change-password')
      .set('X-API-Key', apiToken)
      .send({ currentPassword: 'x', newPassword: 'WhateverPass123!' });
    expect(passwordChange.status).toBe(403);

    const resetIssue = await request(app)
      .post(`/api/v1/users/${bob.id}/password-reset`)
      .set('X-API-Key', apiToken);
    expect(resetIssue.status).toBe(403);
  });

  it('writes security audit events without secret material', async () => {
    const actions = await prisma.auditLog.findMany({
      where: {
        action: {
          in: [
            'USER_PASSWORD_CHANGE',
            'USER_PASSWORD_RESET',
            'USER_PASSWORD_RESET_ISSUED',
            'SESSION_REVOKED',
            'AUTH_LOGOUT',
          ],
        },
      },
      select: { action: true, details: true },
    });
    const unique = new Set(actions.map((entry) => entry.action));
    expect(unique.has('USER_PASSWORD_CHANGE')).toBe(true);
    expect(unique.has('USER_PASSWORD_RESET')).toBe(true);
    expect(unique.has('USER_PASSWORD_RESET_ISSUED')).toBe(true);
    expect(unique.has('SESSION_REVOKED')).toBe(true);
    expect(unique.has('AUTH_LOGOUT')).toBe(true);
    for (const entry of actions) {
      expect(entry.details || '').not.toMatch(/[a-f0-9]{64}/);
    }
  });
});
