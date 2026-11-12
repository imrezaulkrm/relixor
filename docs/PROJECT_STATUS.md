# Project Status

Status reflects executed runtime evidence from the isolated UAT environment (`relixor-uat`) recorded in [docs/UAT_REPORT.md](UAT_REPORT.md) and tracked in [docs/AGENT_HANDOVER.md](AGENT_HANDOVER.md).

| Module | Status | Evidence / Blocker |
|---|---|---|
| Backend auth and security | **VERIFIED** | 4/4 auth tests passed; 6/6 security tests passed; strict CORS normalization verified; production configuration fail-closed guards verified. E2E browser and API role isolation tests verified. |
| Applications and releases | **VERIFIED** | App CRUD, APK file upload, ZIP header validation (`PK\x03\x04`), server-side SHA-256 calculation, duplicate version rejection, artifact streaming download, and deletion verified via Jest (5/5) and E2E Playwright suite. |
| Identity, tokens, and audit | **VERIFIED** | Complete RBAC matrix (27/27 Jest tests passed); scoped API token generation and privilege escalation defense verified; audit logging and role-gated access verified; single-tenant schema noted. |
| Frontend administration | **VERIFIED** | React 18 / Vite SPA production build passed; 26/26 Playwright E2E browser scenarios passed covering landing page, login, dashboard metrics, app creation, release upload, QR install modal, role affordances, and APK downloads across ADMIN, DEVELOPER, and VIEWER roles. |
| Persistence and artifact storage | **VERIFIED** | Prisma schema and migrations verified in PostgreSQL 17; atomic local storage operations verified across container recreation; data persistence verified across PostgreSQL container restart; S3 provider remains unbuilt. |
| Projects and granular RBAC (Modules 01–02) | **VERIFIED** | 6 Jest suites / 83 tests passed against a disposable PostgreSQL 17 database, including 27 membership/RBAC tests. Project and app memberships, effective-role precedence, sibling-app/IDOR denial, dashboard and project-count isolation, unauthorized audit-metadata denial, transactional membership audit writes, and API-token CI upload compatibility verified. Additive migrations replayed on a pre-module dataset preserved all rows, IDs, token hashes, and storage keys with zero membership backfill. Backend and frontend production builds passed. |
| Deployment and operations | **VERIFIED** | Multi-service Docker Compose deployment (`relixor-uat`) healthy; host port isolation verified (port 5434 used, existing PostgreSQL on port 5432 untouched); `./scripts/test-backup-restore.sh` passed with full SQL dump, artifact tarball, checksum, and corruption rejection; encrypted export is BLOCKED by missing `age`/`age-keygen`. |

---

## Module 02 verification (2026-11-12)

- **PASS — Backend tests:** `npx jest --runInBand --forceExit` against a disposable PostgreSQL 17 container (host port 55432, no existing volumes touched): 6 suites, 83 tests passed (`auth` 4, `permissions` 27, `projects` 13, `rbac` 27, `releases` 5, `security` 6).
- **PASS — Final hardening:** dashboard/recent-activity/storage aggregates are scoped to accessible apps; project list and detail counts exclude unauthorized apps; membership mutations and their audit records are transactional; developers cannot read audit metadata for an unauthorized app.
- **NOT RUN — Browser E2E:** the existing Playwright harness targets a full Compose stack and includes no Module 02 membership scenarios; no disposable UI stack was started, so no browser test is claimed.
- **PASS — Migration safety:** init-only database seeded with pre-module users/apps/releases/API token/audit rows, then both new migrations applied manually. Counts, IDs, token hash, and APK `storageKey` unchanged; both legacy apps backfilled to `default-project`; zero memberships created.
- **PASS — Builds:** `npm --prefix backend run build`; `npm --prefix frontend run build`.
- **PASS — Authorization precedence:** direct `AppMembership` overrides `ProjectMembership` in both directions; project `VIEWER` is read-only; direct app members cannot list or reach sibling apps/releases.
- **Production deployment:** migrations were **not** applied to production, and no commit, push, deploy, container restart, or data mutation was performed outside disposable test resources.

## Verified Evidence Summary (2026-10-29)

- **PASS — Level A (Static Checks & Builds):** `npm run build:backend`, `npm run build:frontend`, `bash -n scripts/*.sh`, `git diff --check`, `docker compose -p relixor-uat config`.
- **PASS — Level B (Unit & Integration Tests):** `npm test` against disposable database `relixor_test` (4 test suites, 43 tests passed in 4.13s).
- **PASS — Disaster Recovery:** `./scripts/test-backup-restore.sh` passed all disposable backup, checksum, restore, corruption rejection, and confirmation checks.
- **PASS — Level C (Browser E2E):** `node scripts/e2e-uat-runner.mjs` (26 / 26 Playwright browser and API scenarios passed).
- **PASS — Level D (Persistence & Restart):** APK download verified after backend container recreation; all database records and health checks verified after PostgreSQL container restart.
- **PASS — Level E (Security & Isolation):** Port 5432 host container (`postgres-prod-copy`) completely untouched; zero secret leakage in logs; backend API authorization enforces 403 on restricted actions.
- **BLOCKED — Encrypted Backup:** `scripts/test-encrypted-backup.sh` blocked (exit code 77) due to missing `age` and `age-keygen` tools on host.
- **NOT IMPLEMENTED:** S3-compatible remote storage provider (only `LocalStorageProvider` implemented in source).

---

## Detailed References

- Primary Handover: [docs/AGENT_HANDOVER.md](AGENT_HANDOVER.md)
- Detailed UAT Report: [docs/UAT_REPORT.md](UAT_REPORT.md)
- Architectural Decisions: [docs/DECISIONS.md](DECISIONS.md)
- Architecture & Boundaries: [docs/PROJECT_MAP.md](PROJECT_MAP.md)

## Fresh-environment audit (2026-11-11)

Fresh Compose project `relixor-e2e-fresh` passed image builds, migrations, seed/bootstrap, health checks, direct API authentication/RBAC, structural APK upload/download with matching SHA-256, backup/restore, and backend/PostgreSQL restart persistence. PostgreSQL was internal-only; Nginx used loopback Docker-assigned port `32769`. The existing Playwright harness did not complete because current assertions/credential assumptions did not match the fresh run; Jest against the fresh database was not tested because the production image omits dev dependencies and the disposable database was not host-published. Encrypted backup is blocked by missing `age`/`age-keygen`. Verdict: **READY FOR INTERNAL DEMO** only.

---

## Modules 03–12 implementation checkpoint (2026-11-12)

Environment: disposable PostgreSQL 17 container (`relixor-mod-test`, host port 55432), storage `/tmp/relixor-test-storage`, `NODE_ENV=test`. No production database, credential, container or artifact was touched.

| Module | Status | Executed evidence |
|---|---|---|
| 03 Release lifecycle | **VERIFIED (backend)** | `releaseLifecycle.test.ts` 18/18: upload states, approval required before publish, self-approval denial, reject/resubmit, publish supersession, rollback, promotion resets approval, compare, catalog filters/pagination, release IDOR, audit events. |
| 04 Role dashboards | **VERIFIED (backend API)** | `dashboard.test.ts` 5/5: unassigned user sees zeros, developer/viewer scoping, admin-only users/security data, scoped API-token boundary. UI dashboard consumes `/stats/overview`. |
| 05 Android updates | **VERIFIED (backend)** | `publicPortal.test.ts`: authenticated update check/latest, mandatory flag, unauthorized denial, 401 without auth. Integration guide in `docs/ANDROID_UPDATE_API.md`. |
| 06 Public portal | **VERIFIED (backend)** | Public catalog/detail expose only PRODUCTION+PUBLISHED+approved releases of public apps; internal channel leakage, private app, disabled publication, ticket replay, tampered ticket and JWT-in-query cases tested (13/13 `publicPortal.test.ts`). |
| 07 GitLab CI/CD | **VERIFIED** | `ciIntegration.test.ts` 5/5: checksum mismatch rejected, metadata persisted, retry conflict, READ-only token denial, cross-app token denial. Example pipeline and guide added. |
| 08 QA reports/exports | **VERIFIED (backend)** | `qaReports.test.ts` 9/9: reviewer-scoped verification, no invented results, unassigned user leakage, CSV escaping/formula neutralisation, valid PDF (`%PDF`…`%%EOF`), invalid format, export audit, API-token denial. |
| 09 Retention/cleanup | **VERIFIED** | `retention.test.ts` 9/9: default policies, production deletion refusal, eligible-only preview, dry-run safety, execution disabled by default, direct execution archives metadata and preserves pinned/approved/production files, history/storage stats, non-admin denial. |
| 10 Profile/account security | **VERIFIED** | `accountSecurity.test.ts` 13/13: profile field restrictions, current-password verification, tokenVersion/session invalidation, individual/all-session revocation, login/failed/logout history, deactivation, hashed single-use reset token with atomic consumption, API-token denial, secret-free audit. Frontend profile page and admin session/reset controls added. |
| 11 Security hardening | **VERIFIED (backend)** | Query-string credentials rejected; download rate limiter; production error redaction; min-supported-version validation; audit filters by entity; public/ticket/QR boundary tests; full suite 155/155. |
| 12 Enterprise UI | **PARTIAL — build verified, browser E2E NOT TESTED** | Added Releases, QA Dashboard/Reports, Retention, Public Portal, Profile, admin session/reset UI, dashboard role overview, publication settings, BETA support. `npm --prefix frontend run build` passed. No Playwright/browser scenarios were executed for the new pages. |

### Checks actually run

- **PASS** — `npx jest --runInBand --forceExit` (disposable PostgreSQL 17): 13 suites, **155 tests passed**.
- **PASS** — `npm --prefix backend run build` (tsc + seed build).
- **PASS** — `npm --prefix frontend run build` (tsc + Vite production bundle).
- **PASS** — Fresh-database migration replay: 7/7 migrations applied to `relixor_replay`; `prisma migrate status` reports schema up to date.
- **PASS** — Seed on the replayed database created admin/demo users, app and releases.
- **PASS** — Health endpoint: `GET /health` → HTTP 200 with `database: connected`, `storage: ready`.
- **PASS** — Browser/Playwright E2E validation: `RELIXOR_BASE_URL=http://localhost:18081 ADMIN_DEFAULT_EMAIL=admin.e2e@relixor.internal ADMIN_DEFAULT_PASSWORD=RelixorE2eAdmin_2026_Only node scripts/e2e-uat-runner.mjs` → **26/26 Playwright scenarios passed**.
- **NOT TESTED** — Docker Compose image rebuild/deployment (not requested; no production action taken).
- **NOT TESTED** — Real deletion against production storage (intentionally blocked; `RETENTION_ALLOW_DELETE=false`).

### Known limitations / required configuration

- Password reset tokens are issued by an administrator and displayed once; there is no email delivery provider.
- Retention execution is disabled by default; enable only with `RETENTION_ALLOW_DELETE=true`. Scheduler is opt-in via `RETENTION_SCHEDULE_ENABLED=true`.
- PDF export is a dependency-free minimal layout (Helvetica table, page numbers), not a branded template.
- S3/compatible storage remains unimplemented; only local storage is active.
- Public portal UI is served at `/portal`; the SPA requires the existing Nginx history fallback for deep links.
- No commit, push, deploy or production migration was performed.

---

## Documentation portal checkpoint (2026-11-12)

- **IMPLEMENTED:** `/docs` React portal with grouped navigation, search, TOC, copy, print, prev/next and responsive layout; Markdown content in `docs/`; manifest at `frontend/src/docs/manifest.ts`; docs lazy-loaded.
- **PASS:** frontend build (docs split chunk ~440 KB, main ~418 KB).
- **PASS:** `node scripts/check-docs.mjs` — 56 Markdown files, 40 navigated pages, links/manifest/secret scan.
- **PASS:** Playwright smoke against `vite preview` at 1440×900 and 390×844 — home, search, sidebar navigation, route H1, no page errors.
- **PASS:** backend suite 13/13 suites, 155/155 tests after `migrate deploy` + seed on disposable PostgreSQL 17.
- **NOT TESTED:** application-page browser E2E, authenticated UI flows, clean-VM Compose deployment.
- No deployment, production migration or destructive operation was performed.
