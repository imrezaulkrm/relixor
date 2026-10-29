# Relixor project map

This map is based on source inspection of the repository at 2026-10-25. “Verified” means visible in current source; runtime behavior is not implied.

## Runtime shape

Nginx serves the frontend and proxies `/api/*` and `/health` to the Express API. The API uses Prisma against PostgreSQL and a storage provider for APK bytes. Compose supplies PostgreSQL, backend, frontend, and Nginx with named database/storage volumes. The frontend calls `/api/v1` from `frontend/src/api/client.ts`.

| Boundary | Important files | Responsibility and interfaces |
|---|---|---|
| API composition | `backend/src/app.ts`, `backend/src/server.ts` | Helmet, CORS, body limits, rate limits, routes, errors, listener and graceful shutdown. |
| Auth/security | `backend/src/middleware/auth.ts`, `rbac.ts`, `routes/auth.routes.ts`, `controllers/auth.controller.ts`, `utils/token.ts`, `config/index.ts` | JWT and API-token authentication, role/permission checks, production configuration gates. |
| Apps/releases | `backend/src/routes/app.routes.ts`, `release.routes.ts`, matching controllers, `middleware/upload.ts`, `utils/apkValidator.ts`, `checksum.ts` | App CRUD, APK upload/list/download/delete, version uniqueness and checksum/header validation. |
| Identity/audit | `user.routes.ts`, `token.routes.ts`, `audit.routes.ts`, corresponding controllers, `services/auditService.ts` | User administration, scoped token lifecycle, audit queries and event writes. |
| Persistence | `backend/prisma/schema.prisma`, `backend/prisma/migrations/`, `services/prisma.ts` | Global User/App/Release/ApiToken/AuditLog relational model and Prisma client. |
| Artifact storage | `backend/src/storage/StorageProvider.ts`, `LocalStorageProvider.ts`, `storage/index.ts` | Storage abstraction and path-contained local files; no S3 provider exists in source. |
| Frontend | `frontend/src/App.tsx`, `context/AuthContext.tsx`, `api/client.ts`, `pages/`, `components/` | Authenticated SPA screens for dashboard, apps/releases, users, tokens, audit logs, and CI/CD guidance. |
| Operations | `docker-compose.yml`, `nginx/`, `scripts/`, `ci-cd/` | Container topology, proxy, backup/restore/export/scheduler scripts and pipeline examples. |

## Data model and storage boundaries

`User` owns releases, tokens, and audit entries. `App` owns releases, tokens, and audit entries. `Release` references an app and optionally its uploader, and is unique by `(appId, version, versionCode)`. `ApiToken` stores a hash and optional app scope; plaintext is generated for creation response by the token controller. `AuditLog` optionally references a user and app. The schema has no organization/tenant boundary. APK bytes are addressed through `storageKey`; local storage resolves paths beneath its configured root.

## Tests and evidence locations

Backend API/security tests are in `backend/tests/{auth,permissions,releases,security}.test.ts`; shared setup is `backend/tests/helpers.ts`. Script syntax and operational checks are in `scripts/`. The latest available readiness report is [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md); it records backend listener tests and Docker/age-dependent tests as blocked in its evidence section. No frontend test suite is present in the manifests or tree inspected.

## Module documents

- [Backend auth and security](modules/backend-auth-security.md)
- [Applications and releases](modules/applications-releases.md)
- [Identity, tokens, and audit](modules/identity-tokens-audit.md)
- [Frontend administration](modules/frontend.md)
- [Persistence and artifact storage](modules/persistence-storage.md)
- [Deployment and operations](modules/deployment-operations.md)
