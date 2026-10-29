# Persistence and artifact storage

## Scope

Prisma schema/migrations, database client, APK storage abstraction, local filesystem safety, and metadata/byte boundaries.

## Key files and flow

`prisma/schema.prisma` defines the global relational model; `services/prisma.ts` exposes the client; `storage/StorageProvider.ts` defines the interface; `LocalStorageProvider.ts` implements contained local paths; `storage/index.ts` selects the provider. Release controllers connect metadata writes to stored APK bytes.

## Rules and risks

Preserve path containment, atomic local writes, checksum metadata, and release uniqueness. Only local storage is implemented; S3-compatible upload is not source-verified. The schema has no tenant boundary. Do not modify migrations or run migration commands for documentation work.

## Evidence and acceptance

- **Status:** **VERIFIED**
- Path traversal defense verified in `backend/tests/security.test.ts`.
- Prisma migrations and schema verified against PostgreSQL 17 in both UAT container and test database.
- Persistence across application container recreation verified (`Level D-01`): uploaded artifact remained intact and bit-for-bit downloadable.
- Persistence across PostgreSQL restart verified (`Level D-02`): database schema and rows survived cleanly with connected health check.
- Disposable backup and restore cycle verified (`./scripts/test-backup-restore.sh` passed).
- S3 provider remains NOT IMPLEMENTED (only `LocalStorageProvider` exists in source).

Detailed results recorded in [docs/UAT_REPORT.md](../UAT_REPORT.md).
