import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/services/prisma';

const app = createApp();

describe('Role-Based Permissions API', () => {
  let adminToken: string;
  let devToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    // Login as Admin
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@relixor.internal', password: 'AdminPassword123!' });
    adminToken = adminRes.body.data.token;

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
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('allows Admin to list users', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('forbids Developer from accessing users management', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', `Bearer ${devToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
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
});
