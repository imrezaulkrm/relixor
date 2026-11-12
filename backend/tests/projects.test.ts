import request from 'supertest';
import { createApp } from '../src/app';
import { prisma } from '../src/services/prisma';

const app = createApp();

describe('Project Management API (Module 01)', () => {
  let adminToken: string;
  let devToken: string;
  let viewerToken: string;

  beforeAll(async () => {
    // 1. Authenticate Admin
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@relixor.internal', password: 'AdminPassword123!' });
    adminToken = adminRes.body.data.token;

    // 2. Authenticate Developer
    const devRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'dev@relixor.internal', password: 'DevPassword123!' });
    devToken = devRes.body.data.token;

    // 3. Authenticate Viewer
    const viewerRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'viewer@relixor.internal', password: 'ViewerPassword123!' });
    viewerToken = viewerRes.body.data.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('should list projects including Default Project', async () => {
    const res = await request(app)
      .get('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);

    const defaultProj = res.body.data.find((p: any) => p.slug === 'default-project');
    expect(defaultProj).toBeDefined();
    expect(defaultProj.name).toBe('Default Project');
  });

  it('should allow ADMIN to create a new project', async () => {
    const slug = `test-project-${Date.now()}`;
    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Logistics Mobile Suite',
        slug,
        description: 'Applications for delivery riders and hub dispatchers',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.name).toBe('Logistics Mobile Suite');
    expect(res.body.data.slug).toBe(slug);
  });

  it('should forbid DEVELOPER and VIEWER from creating projects', async () => {
    const devRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${devToken}`)
      .send({ name: 'Dev Project', slug: `dev-proj-${Date.now()}` });
    expect(devRes.status).toBe(403);

    const viewerRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${viewerToken}`)
      .send({ name: 'Viewer Project', slug: `viewer-proj-${Date.now()}` });
    expect(viewerRes.status).toBe(403);
  });

  it('should reject project creation with duplicate slug', async () => {
    const slug = `duplicate-slug-${Date.now()}`;
    await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'First Project', slug });

    const duplicateRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Second Project', slug });

    expect(duplicateRes.status).toBe(409);
    expect(duplicateRes.body.error.code).toBe('PROJECT_SLUG_EXISTS');
  });

  it('should reject invalid slug format', async () => {
    const res = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Bad Slug Project', slug: 'Invalid_Slug With Spaces!' });

    expect(res.status).toBe(400);
  });

  it('should fetch project details by ID and by slug', async () => {
    const slug = `detail-proj-${Date.now()}`;
    const createRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Detail Test Project', slug, description: 'Details inspection' });

    const projectId = createRes.body.data.id;

    // Fetch by ID
    const byIdRes = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(byIdRes.status).toBe(200);
    expect(byIdRes.body.data.slug).toBe(slug);

    // Fetch by Slug
    const bySlugRes = await request(app)
      .get(`/api/v1/projects/${slug}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(bySlugRes.status).toBe(200);
    expect(bySlugRes.body.data.id).toBe(projectId);
  });

  it('should allow ADMIN to update project details', async () => {
    const slug = `update-proj-${Date.now()}`;
    const createRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Original Name', slug });

    const projectId = createRes.body.data.id;

    const updateRes = await request(app)
      .put(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Updated Name', description: 'Updated description' });

    expect(updateRes.status).toBe(200);
    expect(updateRes.body.data.name).toBe('Updated Name');
    expect(updateRes.body.data.description).toBe('Updated description');
  });

  it('should forbid modifying the slug of Default Project', async () => {
    const res = await request(app)
      .put('/api/v1/projects/default-project')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ slug: 'renamed-default' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_MODIFY_DEFAULT_PROJECT_SLUG');
  });

  it('should preserve backward compatibility by assigning apps without projectId to Default Project', async () => {
    const packageName = `com.legacy.app.${Date.now()}`;
    const res = await request(app)
      .post('/api/v1/apps')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Legacy CI App',
        packageName,
        description: 'Uploaded by pipeline without project context',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.project).toBeDefined();
    expect(res.body.data.project.slug).toBe('default-project');
  });

  it('should allow creating an app directly attached to a specific project', async () => {
    const slug = `custom-proj-${Date.now()}`;
    const projRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Fleet Initiative', slug });

    const projectId = projRes.body.data.id;
    const packageName = `com.fleet.driver.${Date.now()}`;

    // Under Module 02, assign devToken as DEVELOPER on this project first
    const devUser = await prisma.user.findUnique({ where: { email: 'dev@relixor.internal' } });
    if (devUser) {
      await request(app)
        .post(`/api/v1/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ userId: devUser.id, role: 'DEVELOPER' });
    }

    const appRes = await request(app)
      .post(`/api/v1/projects/${projectId}/apps`)
      .set('Authorization', `Bearer ${devToken}`)
      .send({
        name: 'Driver Tablet Client',
        packageName,
        description: 'Fleet driver terminal',
      });

    expect(appRes.status).toBe(201);
    expect(appRes.body.data.project.slug).toBe(slug);

    // Verify list apps under project
    const listAppsRes = await request(app)
      .get(`/api/v1/projects/${slug}/apps`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listAppsRes.status).toBe(200);
    expect(listAppsRes.body.data.length).toBeGreaterThanOrEqual(1);
    expect(listAppsRes.body.data.some((a: any) => a.packageName === packageName)).toBe(true);
  });

  it('should forbid deleting the Default Project', async () => {
    const res = await request(app)
      .delete('/api/v1/projects/default-project')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('CANNOT_DELETE_DEFAULT_PROJECT');
  });

  it('should forbid deleting a project that contains applications', async () => {
    const slug = `non-empty-proj-${Date.now()}`;
    const projRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Non Empty Project', slug });

    const projectId = projRes.body.data.id;

    // Add an app to the project
    await request(app)
      .post(`/api/v1/projects/${projectId}/apps`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Embedded App',
        packageName: `com.embedded.${Date.now()}`,
      });

    // Attempt delete
    const deleteRes = await request(app)
      .delete(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(400);
    expect(deleteRes.body.error.code).toBe('PROJECT_NOT_EMPTY');
  });

  it('should successfully delete an empty custom project', async () => {
    const slug = `empty-proj-${Date.now()}`;
    const projRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Empty Project To Delete', slug });

    const projectId = projRes.body.data.id;

    const deleteRes = await request(app)
      .delete(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(deleteRes.status).toBe(200);
    expect(deleteRes.body.success).toBe(true);

    // Verify it is gone
    const fetchRes = await request(app)
      .get(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(fetchRes.status).toBe(404);
  });
});
