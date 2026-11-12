# Applications and releases

## Purpose and scope

Manage application records and APK release lifecycle: upload, validation, metadata, download, deletion, channels, and CI/CD API use.

## Key files

`app.routes.ts`/`app.controller.ts` provide app CRUD. `release.routes.ts`/`release.controller.ts` provide release operations. `middleware/upload.ts` handles temporary multipart files; `utils/apkValidator.ts` checks APK header; `checksum.ts` computes SHA-256. Prisma models are in `backend/prisma/schema.prisma`.

## Flow and interfaces

Authenticated clients call `/api/v1/apps` and `/api/v1/apps/:appId/releases`. Uploads pass multipart limits and validation, compute checksum, enforce duplicate version prevention, and persist metadata plus a storage key. Downloads stream stored bytes and expose checksum headers. The frontend uses `Apps.tsx` and `AppDetails.tsx`.

## Security and validation

Preserve app/release containment, path-safe version/storage inputs, APK header and size checks, role/token permission checks, and immutable duplicate identity. Do not infer Android correctness beyond the implemented header validation.

Module 02 adds resource-level checks on top of the global roles: app details/update, release list/detail/upload/delete/download, and project app creation now require an effective `VIEWER` or `DEVELOPER` role from a direct app membership or the parent project membership. Release access is always authorized through its parent app, never by release ID or storage key alone. See [projects-rbac.md](projects-rbac.md).

## Tests and evidence

- **Status:** **VERIFIED**
- `backend/tests/releases.test.ts` (5 passed), `permissions.test.ts` (27 passed), and `security.test.ts` (6 passed) all executed and passed in the isolated UAT test database environment.
- E2E browser and API test suite (`scripts/e2e-uat-runner.mjs`) verified:
  - App creation and listing (`E2E-06`).
  - Server-side invalid APK magic byte rejection (`E2E-07`).
  - Valid APK upload and publishing (`E2E-08`).
  - Duplicate release prevention (`E2E-09`).
  - UI artifact download and SHA-256 bit-for-bit checksum match (`E2E-10`).
  - VIEWER role artifact download verified (`E2E-20`).
  - VIEWER forbidden from upload/delete (`E2E-19`, `E2E-21`).
  - Unauthorized direct download blocked with 401 (`E2E-22`).
- Persistence across application container recreation verified (`Level D-01`).

## Acceptance and maintenance

Acceptance criteria fully met with recorded test runs in [docs/UAT_REPORT.md](../UAT_REPORT.md). Update this document when endpoints, release identity, validation, or frontend release flows change.

## Module 03 release lifecycle (2026-11-12)

`releaseService.ts` defines the lifecycle metadata, status-history writer, version comparison, current-production lookup, and self-approval policy. `release.routes.ts` now exposes:

- `GET /apps/:appId/releases/current`, `/compare`
- `POST /apps/:appId/releases/rollback`
- `POST /apps/:appId/releases/:releaseId/{submit,approve,reject,publish,deprecate,promote}`
- `PUT /apps/:appId/releases/:releaseId`
- `GET|POST /apps/:appId/releases/:releaseId/qa-verifications`, `GET .../qa-summary`
- `GET /apps/:appId/releases/:releaseId/download-ticket`
- scoped global catalog `GET /releases`

Publication requires `APPROVED`; publishing a PRODUCTION release deprecates the previous one. Uploads never publish implicitly. A developer cannot approve their own upload unless `ALLOW_SELF_APPROVAL=true`; administrators are allowed. Promotion to PRODUCTION resets approval. Production releases, pinned releases and releases in active workflow states are protected from deletion/cleanup. Rejection requires a reason. App publication requires ADMIN (`isPublic`, `publicSlug`).

Downloads are authorized through the parent application. Short-lived download tickets are single-use and stored in `download_tickets`; JWT/API-token query authentication is no longer accepted. QR codes now use tickets and are only issued for publicly downloadable releases.

Evidence: `backend/tests/releaseLifecycle.test.ts` (18), `ciIntegration.test.ts` (5), `publicPortal.test.ts` (13), `qaReports.test.ts` (9), `retention.test.ts` (9), plus the full suite (155/155). See [ANDROID_UPDATE_API.md](../ANDROID_UPDATE_API.md) and [ci-cd-gitlab.md](ci-cd-gitlab.md).
