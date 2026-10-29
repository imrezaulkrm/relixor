# Relixor Agent Handover

This document is the primary persistent handover record for the Relixor project. Any AI agent or engineer resuming work must read this file first.

---

## 📍 Current Checkpoint

- **Last Completed Step:** UAT Verification Complete. Verified Level A (static checks/builds), Level B (43/43 Jest tests on isolated DB), Disaster Recovery (automated backup/restore script), Level C (26/26 Playwright E2E browser scenarios), Level D (persistence across container recreation and PostgreSQL restart), and Level E (host isolation and security verification). Fixed 3 defects (frontend download URL resolver, backup script environment prioritization, `.env` syntax formatting). Synchronized all module and project status documents.
- **Last Successful Command:** `node scripts/e2e-uat-runner.mjs` (26 passed, 0 failed).
- **Current Known Environment State:**
  - `postgres-prod-copy` container running on host port `5432` (**untouched, active**).
  - Isolated UAT stack `relixor-uat` running and healthy:
    - `relixor-postgres`: Up (healthy), published on `127.0.0.1:5434`.
    - `relixor-backend`: Up (healthy), listening on port 5000 internally.
    - `relixor-frontend`: Up, serving React SPA on port 80 internally.
    - `relixor-nginx`: Up, published on `0.0.0.0:8080->80/tcp`.
  - Storage volume `relixor-uat_relixor_storage` and DB volume `relixor-uat_relixor_pgdata` active.
  - Test database `relixor_test` initialized on `127.0.0.1:5434`.
- **Current Unresolved Issues / Blockers:**
  - Encrypted backup export (`scripts/test-encrypted-backup.sh`) is **BLOCKED** by missing `age` / `age-keygen` utilities on the host.
  - S3-compatible remote storage provider is **NOT IMPLEMENTED** (only `LocalStorageProvider` exists in source).
  - Query-string token in mobile QR code modal should be refactored to short-lived tickets before public production.
- **Exact Next Action:** Optional: install `age` if encrypted export testing is required; proceed with production TLS/domain reverse proxy configuration when ready for deployment.

---

## 🔁 Mandatory Resume Procedure for a Future Agent

When resuming this work:
1. Read [AGENTS.md](../AGENTS.md) and this file ([docs/AGENT_HANDOVER.md](AGENT_HANDOVER.md)).
2. Inspect `git status --short` and `docker compose -p relixor-uat ps`.
3. **DO NOT** rescan the repository or rerun passing test suites unless code or environment configuration has changed.
4. To rerun all E2E browser tests:
   ```bash
   node scripts/e2e-uat-runner.mjs
   ```
5. To rerun backend Jest integration tests against the isolated test database:
   ```bash
   NODE_ENV=test DATABASE_URL="postgresql://relixor:relixor_local_db_2026@127.0.0.1:5434/relixor_test?schema=public" npm test
   ```
6. To rerun disposable backup/restore integration test:
   ```bash
   ./scripts/test-backup-restore.sh
   ```
7. To safely start or stop the UAT environment without destroying volumes:
   ```bash
   # Stop containers safely (preserving all data)
   docker compose -p relixor-uat stop
   # Restart containers
   docker compose -p relixor-uat start
   # View container logs
   docker compose -p relixor-uat logs -f backend
   ```

---

## 🏷️ Project Identity & Architecture

- **Project:** Relixor — Self-hosted private Android APK repository and release-management UI.
- **Branch / Commit:** `main` @ `b2fda61`.
- **Stack:** React 18, Vite, Tailwind CSS, Node.js 20+, Express, Prisma 5, PostgreSQL 17, Nginx Alpine.
- **Reverse Proxy Routing:**
  - `http://localhost:8080/` -> Frontend React SPA
  - `http://localhost:8080/api/*` -> Backend Express API (`/api/v1/*`)
  - `http://localhost:8080/health` -> Backend Health Check endpoint

### Key Documentation Links
- [README.md](../README.md): Operational setup guide and user documentation.
- [docs/UAT_REPORT.md](UAT_REPORT.md): Complete, evidence-based verification report.
- [docs/PROJECT_STATUS.md](PROJECT_STATUS.md): Synchronized module status and blockers.
- [docs/PROJECT_MAP.md](PROJECT_MAP.md): Architectural boundaries and key files.
- [docs/DECISIONS.md](DECISIONS.md): Durable design decisions.
- [docs/modules/](modules/): Specific module documentation.

---

## 🛡️ Database & Host Isolation Strategy

- **Critical Constraint:** An existing PostgreSQL container named `postgres-prod-copy` is active on host port `5432`.
- **Guaranteed Isolation Implementation:**
  - Compose project name: `relixor-uat`.
  - UAT PostgreSQL host port: `5434` (mapped to internal `5432`).
  - UAT Web port: `8080` (mapped to Nginx `80`).
  - Dedicated Docker network: `relixor-uat_relixor_net`.
  - Dedicated isolated volumes: `relixor-uat_relixor_pgdata`, `relixor-uat_relixor_storage`.
  - The `postgres-prod-copy` container and its volumes were **never touched, stopped, or queried**.
  - Destructive volume commands (`docker compose down -v`, volume pruning) are strictly prohibited.

---

## 🔐 Environment Variables (No Secret Values Documented)

Configured in `.env`:
- `NODE_ENV=production`
- `PORT=5000`
- `HTTP_PORT=8080`
- `POSTGRES_PORT=5434`
- `POSTGRES_USER=relixor`
- `POSTGRES_DB=relixor`
- `POSTGRES_PASSWORD=<configured-password>`
- `DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}?schema=public`
- `JWT_SECRET=<configured-62-char-random-secret>`
- `JWT_EXPIRES_IN=7d`
- `CORS_ORIGIN=http://localhost:8080`
- `ADMIN_DEFAULT_EMAIL=admin@relixor.internal`
- `ADMIN_DEFAULT_PASSWORD=<configured-strong-admin-password>`
- `ADMIN_DEFAULT_NAME="Relixor Local Administrator"`
- `STORAGE_PROVIDER=local`
- `STORAGE_LOCAL_DIR=/app/storage/apks`
- `MAX_FILE_SIZE_MB=500`
- `SEED_DEMO_DATA=true`

---

## 🧪 Tests Executed & Evidence Summary

| Test Level | Command | Scope | Result | Evidence Location |
|---|---|---|:---:|---|
| Level A | `bash -n scripts/*.sh && git diff --check` | Syntax & formatting | **PASS** | Terminal execution |
| Level A | `npm run build:backend` | Backend TypeScript build | **PASS** | `dist/` |
| Level A | `npm run build:frontend` | Frontend production bundle | **PASS** | `dist/assets/` |
| Level B | `npm test` against `relixor_test` | 4 test suites, 43 unit/integration tests | **PASS** | [docs/UAT_REPORT.md](UAT_REPORT.md#level-b--backend-unit--integration-tests) |
| Disaster Recovery | `./scripts/test-backup-restore.sh` | Disposable backup, checksum, restore, corruption rejection | **PASS** | [docs/UAT_REPORT.md](UAT_REPORT.md#operational--disaster-recovery-tests) |
| Level C | `node scripts/e2e-uat-runner.mjs` | 26 Playwright browser scenarios (Admin, Dev, Viewer, APK upload/download) | **PASS** | [docs/UAT_REPORT.md](UAT_REPORT.md#level-c--end-to-end-browser--api-scenarios) |
| Level D | Backend recreate & Postgres restart | Persistent storage and database recovery | **PASS** | [docs/UAT_REPORT.md](UAT_REPORT.md#level-d--persistence--recovery-verification) |
| Level E | Host inspection & container log audit | 5432 isolation & zero leaked secrets in logs | **PASS** | [docs/UAT_REPORT.md](UAT_REPORT.md#level-e--security--isolation-checks) |
| Encrypted Export | `./scripts/test-encrypted-backup.sh` | Age encryption round-trip | **BLOCKED** | Exit code 77 (`age` not installed) |

---

## 🐛 Defects Found, Root Causes & Fixes Applied

1. **Frontend Download URL Missing API Base Prefix:**
   - *File:* `frontend/src/api/client.ts`
   - *Root Cause:* `downloadFile(url, filename)` did not prepend `API_BASE` (`/api/v1`) when given relative paths like `/apps/...`, resulting in Nginx serving SPA `index.html` instead of the APK binary. Additionally, `window.URL.revokeObjectURL` was called immediately before Chromium could finish downloading.
   - *Fix:* Prepended `API_BASE` to relative endpoints and used a delayed timeout for `revokeObjectURL`.
   - *Regression Evidence:* `E2E-10` and `E2E-20` verified binary download with matching SHA-256 and valid PK header.

2. **Backup Script Overriding Explicit Environment & Ignoring `DATABASE_URL`:**
   - *File:* `scripts/backup.sh`
   - *Root Cause:* Sourcing `.env` overwrote caller-provided environment variables (such as `DATABASE_URL`), and `docker ps | grep -q "relixor-postgres"` took precedence over `DATABASE_URL`, causing backup scripts to dump the wrong database during disposable testing.
   - *Fix:* Preserved explicit caller variables and prioritized `DATABASE_URL` / `BACKUP_CONTAINER` over auto-detected containers.
   - *Regression Evidence:* `./scripts/test-backup-restore.sh` passed all verification steps.

3. **Bash Syntax Error in `.env`:**
   - *Files:* `.env`, `.env.example`
   - *Root Cause:* `ADMIN_DEFAULT_NAME=Relixor Local Administrator` lacked quotes, causing bash `source .env` to fail with `Local: command not found`.
   - *Fix:* Quoted strings with spaces and ensured correct newline formatting.

---

## 📁 Files Modified

| File | Reason |
|---|---|
| `backend/src/config/index.ts` | CORS origin whitespace trimming and empty filter normalization. |
| `frontend/src/api/client.ts` | Prepend `API_BASE` in `downloadFile` and safely defer `revokeObjectURL`. |
| `scripts/backup.sh` | Prioritize caller-provided `DATABASE_URL` / `BACKUP_CONTAINER` and preserve env before sourcing `.env`. |
| `docker-compose.yml` | Added `SEED_DEMO_DATA` environment interpolation. |
| `.env`, `.env.example` | Quoted string variables, added `HTTP_PORT=8080`, `POSTGRES_PORT=5434`, `SEED_DEMO_DATA`. |
| `scripts/e2e-uat-runner.mjs` | Automated 26-scenario Playwright E2E browser and API test runner. |
| `docs/UAT_REPORT.md` | Comprehensive UAT verification report with feature-by-feature results. |
| `docs/PROJECT_STATUS.md` | Synchronized status reflecting executed verification evidence. |
| `docs/modules/*.md` | Updated module documentation to VERIFIED status with evidence citations. |
| `README.md` | Updated user-facing operational documentation. |

---

## 🚫 Dangerous Operations (Do Not Repeat)

- **NEVER** run `docker compose down -v` or `docker volume prune`.
- **NEVER** touch container `postgres-prod-copy` or port `5432`.
- **NEVER** run `npx prisma migrate reset` against the application or UAT database.
- **NEVER** log, document, or commit secret keys, passwords, or tokens.

---

## 📋 Chronological Activity Log

| Timestamp | Phase | Action | Result / Evidence |
|---|---|---|---|
| 2026-10-29 16:08 | Inspection | Read `AGENTS.md`, `README.md`, `PROJECT_MAP.md`, `PROJECT_STATUS.md`, `DECISIONS.md`, and module docs. | Confirmed repo state and architecture. |
| 2026-10-29 16:09 | Isolation Check | Checked `docker ps` and `ss -tulpn`. | `postgres-prod-copy` active on 5432. 5434 and 8080 free. |
| 2026-10-29 16:13 | Compose Check | Validated Compose config with `-p relixor-uat`. | PASS: `docker compose config` succeeded. |
| 2026-10-29 16:17 | Container Deploy | Started isolated UAT stack `relixor-uat`. | PASS: Backend, Postgres, Frontend, Nginx all started and healthy. |
| 2026-10-29 16:18 | DB Migration & Seed | Deployed migration `20261013155100_init` and seeded Admin/Dev/Viewer/Demo apps. | PASS: Seed complete. |
| 2026-10-29 16:20 | Level A Checks | Shell syntax, git whitespace, backend and frontend builds. | PASS: All 4 static checks passed. |
| 2026-10-29 16:22 | Level B Tests | Ran 43 Jest tests on isolated `relixor_test` DB. | PASS: 4 suites, 43 tests passed in 4.13s. |
| 2026-10-29 16:23 | Defect Fix: Backup | Fixed `scripts/backup.sh` environment precedence. | PASS: Defect resolved. |
| 2026-10-29 16:23 | Disaster Recovery | Executed `./scripts/test-backup-restore.sh`. | PASS: Backup, restore, checksum, and corruption tests passed. |
| 2026-10-29 16:28 | Defect Fix: Frontend | Fixed `downloadFile` API prefix in `client.ts` and redeployed. | PASS: Defect resolved and rebuilt. |
| 2026-10-29 17:06 | Level C E2E Suite | Executed `node scripts/e2e-uat-runner.mjs`. | PASS: 26/26 browser & API scenarios passed. VIEWER APK download verified. |
| 2026-10-29 17:07 | Level D Persistence | Recreated backend container & restarted postgres container. | PASS: Artifacts and database records verified intact across restarts. |
| 2026-10-29 17:08 | Level E Security | Verified host container isolation and log cleanliness. | PASS: Port 5432 container untouched; no secrets leaked. |
