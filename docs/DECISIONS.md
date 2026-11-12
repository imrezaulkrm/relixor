# Decisions and durable constraints

- Keep the backend/frontend split and `/api/v1` route boundary; the frontend client centralizes the API base path and bearer header.
- Use Prisma/PostgreSQL for relational metadata and a `StorageProvider` interface for APK bytes. Local storage is the only implemented provider.
- Treat release identity as `(appId, version, versionCode)` and retain server-side SHA-256 plus APK ZIP-header validation.
- Store API-token hashes, reveal plaintext only at creation, and prevent API-token authentication from managing users/tokens.
- Require explicit production secrets/configuration; never place secrets, keys, token values, or credentials in repository documentation.
- Backups must be validated before restore and restore scripts require an explicitly disposable target. Encryption and remote storage need environment-backed tests before certification.
- The current schema is global, not multi-tenant. Do not add tenant schema changes without a data ownership, backfill, and compatibility decision.
- Documentation status is evidence-based: source inspection is not runtime verification, and blocked prerequisites remain visible.
- Resource authorization layers on top of the global roles rather than replacing them. A direct app membership always overrides project inheritance, in either direction; project membership must never bypass an explicit app-level restriction.
- Membership migrations are additive and never backfill broad access. Existing users keep only their global-role behavior until an ADMIN assigns resource memberships.

## Module 03–12 durable decisions (2026-11-12)

- **Explicit release approval gates publication.** Uploading an APK creates `UPLOADED`; only `APPROVED` releases can be published. Publishing a PRODUCTION release deprecates the previous one, and promotion to PRODUCTION resets approval. Self-approval by the uploading developer is denied unless `ALLOW_SELF_APPROVAL=true`.
- **Downloads never authenticate from query parameters.** JWTs and API tokens in URLs are rejected. Public/QR downloads use database-backed, short-lived, single-use tickets (`download_tickets`); internal downloads use `Authorization`/`X-API-Key` headers.
- **Public exposure is an explicit, layered rule.** An app must be `isPublic` with a valid `publicSlug`, and a release must be PRODUCTION, PUBLISHED, approved and published-time set. Only ADMIN may change publication settings.
- **Retention deletes files, not history.** Cleanup removes APK bytes and marks the release `ARCHIVED`, preserving metadata and audit records. PRODUCTION, pinned and active-workflow releases are always protected. Execution is disabled by default and requires `RETENTION_ALLOW_DELETE=true`; dry-run is the default mode.
- **Sessions are revocable.** JWTs carry a session id and `tokenVersion`. Password changes, deactivation and administrative revocation invalidate previous tokens while leaving unrelated users untouched. Legacy tokens without those claims remain accepted for compatibility.
- **Password reset tokens are admin-issued, hashed, expiring and consumed atomically.** No email provider is configured; the plaintext token is returned once to the administrator and never logged.
- **Role dashboards are derived from resource access, not UI filtering.** Every aggregate is computed from accessible project/app IDs; administrators alone receive global user counts and security events.
