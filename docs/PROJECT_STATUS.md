# Project Status

Status reflects executed runtime evidence from the isolated UAT environment (`relixor-uat`) recorded in [docs/UAT_REPORT.md](UAT_REPORT.md) and tracked in [docs/AGENT_HANDOVER.md](AGENT_HANDOVER.md).

| Module | Status | Evidence / Blocker |
|---|---|---|
| Backend auth and security | **VERIFIED** | 4/4 auth tests passed; 6/6 security tests passed; strict CORS normalization verified; production configuration fail-closed guards verified. E2E browser and API role isolation tests verified. |
| Applications and releases | **VERIFIED** | App CRUD, APK file upload, ZIP header validation (`PK\x03\x04`), server-side SHA-256 calculation, duplicate version rejection, artifact streaming download, and deletion verified via Jest (5/5) and E2E Playwright suite. |
| Identity, tokens, and audit | **VERIFIED** | Complete RBAC matrix (27/27 Jest tests passed); scoped API token generation and privilege escalation defense verified; audit logging and role-gated access verified; single-tenant schema noted. |
| Frontend administration | **VERIFIED** | React 18 / Vite SPA production build passed; 26/26 Playwright E2E browser scenarios passed covering landing page, login, dashboard metrics, app creation, release upload, QR install modal, role affordances, and APK downloads across ADMIN, DEVELOPER, and VIEWER roles. |
| Persistence and artifact storage | **VERIFIED** | Prisma schema and migrations verified in PostgreSQL 17; atomic local storage operations verified across container recreation; data persistence verified across PostgreSQL container restart; S3 provider remains unbuilt. |
| Deployment and operations | **VERIFIED** | Multi-service Docker Compose deployment (`relixor-uat`) healthy; host port isolation verified (port 5434 used, existing PostgreSQL on port 5432 untouched); `./scripts/test-backup-restore.sh` passed with full SQL dump, artifact tarball, checksum, and corruption rejection; encrypted export is BLOCKED by missing `age`/`age-keygen`. |

---

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
