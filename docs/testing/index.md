# Testing Guide

## What exists

- **Backend integration tests:** Jest + Supertest, 13 suites, 155 tests at v1.0, run against a real disposable PostgreSQL database.
- **Frontend:** TypeScript + Vite production build. **No frontend unit tests.**
- **E2E:** Playwright is installed as a root dev dependency, but **no Playwright specs or execution evidence exist** in this repository. Browser E2E is **NOT TESTED**.

## Test suites

| Suite | Focus |
|---|---|
| `auth.test.ts` | Login, JWT, auth failures |
| `permissions.test.ts` | Role and token permission boundaries |
| `rbac.test.ts` | Project/app membership, inheritance, IDOR |
| `projects.test.ts` | Project/app CRUD constraints |
| `releases.test.ts` | Upload/download baseline |
| `releaseLifecycle.test.ts` | Workflow, approval, publish, promote, rollback, compare, catalog |
| `dashboard.test.ts` | Role-scoped aggregates |
| `publicPortal.test.ts` | Public visibility, tickets, update checks |
| `ciIntegration.test.ts` | Checksums, duplicate/retry, token scope |
| `qaReports.test.ts` | QA records, CSV/PDF, audit |
| `retention.test.ts` | Policies, protection, dry-run/execute |
| `accountSecurity.test.ts` | Profile, sessions, reset, deactivation |
| `security.test.ts` | Query credentials, hardening regressions |

## Disposable database

Never point tests at production.

```bash
docker run -d --name relixor-test-db \
  -e POSTGRES_USER=relixor \
  -e POSTGRES_PASSWORD=relixor_test_pw \
  -e POSTGRES_DB=relixor_test \
  -p 55432:5432 postgres:17-alpine

export DATABASE_URL='postgresql://relixor:relixor_test_pw@localhost:55432/relixor_test?schema=public'
export STORAGE_LOCAL_DIR=/tmp/relixor-test-storage
export NODE_ENV=test
cd backend
npx prisma migrate deploy
npx prisma generate
npm run build                 # compiles the seed used by the test fixtures
node dist/prisma/seed.js
npx jest --runInBand --forceExit
```

Expected final lines:

```
Test Suites: 13 passed, 13 total
Tests:       155 passed, 155 total
```

Test storage is isolated at `/tmp/relixor-test-storage`. Remove it after runs if desired; do not point it at real APK storage.

## Targeted runs

```bash
npx jest tests/releaseLifecycle.test.ts --runInBand --forceExit
npx jest -t "publishes" --runInBand --forceExit
```

`--runInBand` avoids cross-suite database interference. Tests create their own users/apps; shared state is cleaned or uniquely named.

## Reading failures

- **Connection errors** → database not running, wrong DSN, migrations not applied.
- **401 instead of expected 403** → token missing/expired; check auth helper.
- **Intermittent isolation failures** → suite ordering/state leakage; reset the specific fixture rather than skipping.
- **Unique constraint** → a prior failed run left data; reset the disposable DB (`migrate reset` is acceptable **only** on the disposable test DB).

Do not weaken assertions or delete failing tests to get green.

## Build checks

```bash
npm --prefix backend run build
npm --prefix frontend run build
git diff --check
```

## Coverage and gaps

No coverage threshold is enforced. Known untested areas:

- Browser UI flows, responsive layout, accessibility.
- Actual Docker Compose image build and fresh-VM install (documentation pass did not execute it).
- Real SMTP/email (not implemented).
- S3 storage (not implemented).
- APK malware/signature validation (not implemented).
- Long-running scheduler under production load.

## Documentation validation

A link checker is available at `scripts/check-docs.mjs`; it verifies local Markdown targets and manifest coverage. Run:

```bash
node scripts/check-docs.mjs
```

## Related

- [Development](/docs/development/index)
- [Project status](/docs/PROJECT-STATUS)
- [Known limitations](/docs/KNOWN-LIMITATIONS)
