# Decisions and durable constraints

- Keep the backend/frontend split and `/api/v1` route boundary; the frontend client centralizes the API base path and bearer header.
- Use Prisma/PostgreSQL for relational metadata and a `StorageProvider` interface for APK bytes. Local storage is the only implemented provider.
- Treat release identity as `(appId, version, versionCode)` and retain server-side SHA-256 plus APK ZIP-header validation.
- Store API-token hashes, reveal plaintext only at creation, and prevent API-token authentication from managing users/tokens.
- Require explicit production secrets/configuration; never place secrets, keys, token values, or credentials in repository documentation.
- Backups must be validated before restore and restore scripts require an explicitly disposable target. Encryption and remote storage need environment-backed tests before certification.
- The current schema is global, not multi-tenant. Do not add tenant schema changes without a data ownership, backfill, and compatibility decision.
- Documentation status is evidence-based: source inspection is not runtime verification, and blocked prerequisites remain visible.
