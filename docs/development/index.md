# Development Guide

## Prerequisites

- Node.js 20+, npm 10+
- Docker (for a disposable PostgreSQL 17)
- Git
- Optional: Android build tooling if you produce test APKs

## Local setup

```bash
git clone <your-repository-url> relixor
cd relixor
npm install --prefix backend
npm install --prefix frontend
```

Start PostgreSQL (any local instance; example):

```bash
docker run -d --name relixor-dev-db \
  -e POSTGRES_USER=relixor -e POSTGRES_PASSWORD=devpassword \
  -e POSTGRES_DB=relixor_dev -p 55432:5432 postgres:17-alpine
```

Create `backend/.env` (not committed):

```dotenv
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://relixor:devpassword@localhost:55432/relixor_dev?schema=public
JWT_SECRET=development-only-secret-change-me
CORS_ORIGIN=http://localhost:3000
STORAGE_LOCAL_DIR=./storage/apks
ADMIN_DEFAULT_EMAIL=admin@relixor.local
ADMIN_DEFAULT_PASSWORD=AdminPassword123!
```

Apply schema and seed:

```bash
cd backend
npx prisma migrate deploy
npx prisma generate
npm run build
node dist/prisma/seed.js
```

Run (two terminals):

```bash
npm --prefix backend run dev     # nodemon + ts-node on :5000
npm --prefix frontend run dev    # Vite on :3000, /api proxied
```

Open `http://localhost:3000`.

## Repository structure

```
backend/src/routes        Express route definitions + guards
backend/src/controllers   Request/response handling
backend/src/services      Domain logic (release, rbac, retention, sessions, ...)
backend/src/middleware    auth, rbac, resourceRbac, upload, error handling
backend/src/storage       StorageProvider + local implementation
backend/prisma            schema, migrations, seed
backend/tests             Jest + Supertest integration tests
frontend/src/pages        Route/tab screens (including Docs.tsx)
frontend/src/components   Reusable UI
frontend/src/api          Typed-ish fetch client
frontend/src/types        Shared UI types
docs/                     Markdown documentation (bundled into /docs)
```

## Conventions

- TypeScript strict mode; no `any` unless isolating third-party shapes.
- Zod validation at controller boundaries.
- Authorization middleware before controllers; never trust the UI.
- Controllers stay thin; multi-step domain rules live in services.
- Errors use `{success:false,error:{message,code}}` with meaningful codes.
- Do not log secrets, tokens, password hashes or full DSNs.
- API responses are additive; avoid breaking existing fields.
- Migrations are additive and reviewed; never edit an applied migration.
- Frontend uses Tailwind utility classes and existing slate/indigo visual language.

## Add an API endpoint

1. Add/extend a service for domain logic.
2. Add a controller with Zod validation and audit logging where relevant.
3. Register the route with `authenticate`, `requirePermission`, `requireRole`, `requireAppAccess`/`requireProjectAccess` as appropriate.
4. Add integration tests covering success, unauthenticated, wrong role and cross-resource access.
5. Update `docs/api/reference.md` and the module doc.
6. Build and run the full suite.

## Add a frontend page

1. Create `frontend/src/pages/YourPage.tsx`.
2. Use `apiRequest`/`apiRequestWithMeta`; handle loading/error/empty states.
3. Add it to `App.tsx` and the sidebar/tab union if it is an app tab.
4. Keep destructive actions behind confirmation and ADMIN checks (UI only; server enforces).
5. Run `npm --prefix frontend run build` (tsc + Vite).

## Add documentation

Pages live under `docs/` as Markdown and are bundled by `frontend/src/pages/Docs.tsx` via `import.meta.glob`. To add a page:

1. Create the `.md` file with a single `# H1`.
2. Register it in `frontend/src/docs/manifest.ts` (path, title, group, description).
3. Use absolute `/docs/...` links; internal links are resolved in-app.
4. Do not include secrets; placeholders only.

## Prisma changes

```bash
cd backend
npx prisma migrate dev --name add_something
npx prisma generate
npm test
```

Review SQL; split enum additions from data changes when PostgreSQL requires it. See [Database](/docs/administration/database).

## Build and type checks

```bash
npm --prefix backend run build     # tsc + seed compile
npm --prefix frontend run build    # tsc + Vite
```

Both must exit 0. The frontend build also bundles documentation.

## Tests

See [Testing](/docs/testing/index). Minimum before a PR: backend suite (or targeted tests for the changed module), both builds, and `git diff --check`.

## Safe Git workflow

- Do not reset/clean/stash other people's work.
- Branch per change; keep commits focused.
- Never commit `.env`, dumps, tokens, APKs, `node_modules`, `dist`.
- Review `git diff` before committing; do not push without authorization.
- Update docs and `PROJECT_STATUS` when behaviour/interfaces change.

## Common problems

| Problem | Fix |
|---|---|
| Prisma client out of date | `npx prisma generate` |
| Tests hit the wrong DB | Ensure `DATABASE_URL` is exported for the test shell |
| Vite cannot read `docs/` | `server.fs.allow` must include `..` (already configured) |
| 401 loop in UI | Clear `relixor_auth_token`, sign in again |
| Port 5000 busy | Change `PORT` and Vite proxy target |

## Related

- [Testing](/docs/testing/index)
- [Architecture](/docs/architecture/overview)
- [Database](/docs/administration/database)
