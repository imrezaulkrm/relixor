# Applications and releases

## Purpose and scope

Manage application records and APK release lifecycle: upload, validation, metadata, download, deletion, channels, and CI/CD API use.

## Key files

`app.routes.ts`/`app.controller.ts` provide app CRUD. `release.routes.ts`/`release.controller.ts` provide release operations. `middleware/upload.ts` handles temporary multipart files; `utils/apkValidator.ts` checks APK header; `checksum.ts` computes SHA-256. Prisma models are in `backend/prisma/schema.prisma`.

## Flow and interfaces

Authenticated clients call `/api/v1/apps` and `/api/v1/apps/:appId/releases`. Uploads pass multipart limits and validation, compute checksum, enforce duplicate version prevention, and persist metadata plus a storage key. Downloads stream stored bytes and expose checksum headers. The frontend uses `Apps.tsx` and `AppDetails.tsx`.

## Security and validation

Preserve app/release containment, path-safe version/storage inputs, APK header and size checks, role/token permission checks, and immutable duplicate identity. Do not infer Android correctness beyond the implemented header validation.

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
