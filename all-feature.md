# Relixor — Complete Project Audit and Feature Documentation

> Audit scope: repository state inspected on 2026-10-15. This report describes verified source evidence. It does not reproduce secrets or environment values.

## Contents

- [Executive summary](#executive-summary)
- [Architecture](#architecture)
- [Feature inventory](#feature-inventory)
- [APK storage lifecycle](#apk-storage-lifecycle)
- [Backup and restore](#backup-and-restore)
- [Docker and deployment](#docker-and-deployment)
- [Environment reference](#environment-reference)
- [Database](#database)
- [API inventory](#api-inventory)
- [Security audit](#security-audit)
- [Monitoring and troubleshooting](#monitoring-and-troubleshooting)
- [Testing and QA](#testing-and-qa)
- [Roadmap](#roadmap)
- [Final summary](#final-summary)

## Executive summary

Relixor is a self-hosted private APK artifact repository and release-management platform for engineering and mobile DevOps teams. It stores release metadata in PostgreSQL and APK binaries in local persistent storage, exposes authenticated REST APIs for people and CI/CD systems, and provides a React/Tailwind administration interface.

| Area | Implementation | Status |
|---|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind, Lucide, QR Code SVG | Implemented; production build previously passed |
| Backend | Node.js 20+, Express, TypeScript, Prisma, Zod, Multer | Implemented |
| Database | PostgreSQL 17 and Prisma | Implemented; one initial migration |
| Artifact storage | LocalStorageProvider and Docker named volume | Implemented; S3 not implemented |
| Edge | Nginx reverse proxy | Implemented; repository config is HTTP-only |
| Auth | bcrypt passwords, JWT sessions, hashed API tokens | Implemented |
| Operations | Health endpoint, structured logs, Compose health checks | Basic implementation |
| Backup | SQL dump, APK tar, metadata/checksums | Scripts exist; end-to-end evidence is environment-dependent |
| Multi-tenancy | No organizations or memberships | Missing |

Main risks are single-tenant data ownership, host-exposed PostgreSQL, HTTP-only Nginx, local-only artifact storage, uncoordinated database/file backups, and incomplete alerting.

## Architecture

~~~mermaid
flowchart LR
 B[Browser or CI runner] --> N[Nginx :80]
 N --> F[Frontend Nginx :80]
 N --> A[Backend Express API :5000]
 A --> P[(PostgreSQL 17)]
 A --> S[/LocalStorageProvider /app/storage/apks/]
 P --- PV[(relixor_pgdata)]
 S --- SV[(relixor_storage)]
~~~

Compose services use bridge network relixor_net. Internal DNS names are postgres, backend, and frontend. Nginx is the public entry point. PostgreSQL is also mapped to a host port, which should be removed or firewall-restricted in production.

### Login and authorization

~~~mermaid
sequenceDiagram
 participant C as Client
 participant A as Express API
 participant D as PostgreSQL
 C->>A: POST /api/v1/auth/login
 A->>D: Find active user by normalized email
 A->>A: bcrypt compare and sign JWT
 A->>D: AUTH_LOGIN audit record
 A-->>C: JWT and user profile
 C->>A: Bearer JWT, X-API-Key, or download query token
 A->>A: authenticate plus role/permission middleware
 A->>D: Authorized query
~~~

API tokens are SHA-256 hashed and plaintext is returned only when created. Query-string tokens support QR downloads but can leak through browser history, logs, or referrers.

### Application and release flow

~~~mermaid
flowchart TD
 U[Admin or developer] --> APP[POST /api/v1/apps]
 APP --> V[Zod validation and packageName uniqueness]
 V --> DB[(App row)]
 CI[CI/CD or UI] --> UP[POST /api/v1/apps/:appId/releases]
 UP --> TMP[Multer temporary file]
 TMP --> CHECK[Extension, size, ZIP header, version, duplicate checks]
 CHECK --> FS[Copy to storage key]
 FS --> REL[(Release metadata and SHA-256)]
 REL --> AUD[AuditLog]
~~~

### Backup flow

~~~mermaid
flowchart LR
 B[scripts/backup.sh] --> D[pg_dump database.sql]
 B --> T[tar artifacts.tar.gz]
 B --> M[metadata.json and SHA256SUMS]
 M --> C[Atomic completed directory]
 C --> E[Optional age export]
 C --> R[scripts/restore.sh]
 R --> V[Manifest validation]
 V --> DBR[Explicit disposable database]
 V --> SR[Explicit restore storage]
~~~

## Feature inventory

| Feature | Frontend | Backend/API | Models | Status and limitation |
|---|---|---|---|---|
| Login | Login.tsx, AuthContext.tsx | POST /api/v1/auth/login | User, AuditLog | Implemented. JWT is stored in localStorage; no refresh token. |
| Logout | AuthContext logout | None | None | Client-side token removal; JWT is not server-revoked. |
| Current user | AuthContext | GET /api/v1/auth/me | User | Implemented. |
| Dashboard | Dashboard.tsx | GET /api/v1/stats/dashboard | App, Release, AuditLog | Implemented; no tenant boundary. |
| App management | Apps.tsx, AppDetails.tsx | /api/v1/apps | App | Implemented; reverse-domain package validation and uniqueness. |
| APK upload | AppDetails.tsx and CI docs | POST /api/v1/apps/:appId/releases | Release, App, User | Implemented with Multer, bounds, extension/ZIP checks, duplicate constraint, SHA-256. APK signing/package semantics are not checked. |
| APK download | App details and QR modal | GET .../download | Release | Authenticated stream with checksum header and download count. |
| Release channels | ChannelBadge and forms | Upload/list APIs | ReleaseChannel | DEV, QA, STAGING, PRODUCTION. Invalid upload channel falls back to DEV. |
| User administration | Users.tsx | /api/v1/users | User, AuditLog | Admin-only; self-protection checks exist. |
| API tokens | Tokens.tsx | /api/v1/tokens | ApiToken, App, User | Interactive admin/developer only; scope, permission, expiry, revoke/delete. |
| RBAC | Sidebar/page guards | requireRole and requirePermission | Role, TokenPermission | Backend is authoritative. |
| Audit logs | AuditLogs.tsx | GET /api/v1/audit-logs | AuditLog | Admin system scope, developer app scope; writes are best-effort. |
| Health | Public endpoints | /health and /api/v1/health | DB/storage checks | DB SELECT 1 and storage size check; no disk threshold alert. |
| Local storage | Dashboard usage | LocalStorageProvider | Release.storageKey | Implemented. Unsupported provider values fall back to local with warning. |
| Migrations | None | prisma migrate deploy in image | Prisma migration | Implemented; rollback is manual. |
| Backup/restore | No UI | Shell scripts | SQL/files | Implemented scripts; operational restore needs suitable infrastructure. |

## APK storage lifecycle

Compose mounts named volume relixor_storage at backend path /app/storage/apks. Outside Compose, the backend uses STORAGE_LOCAL_DIR or a path based on ../storage/apks. PostgreSQL stores release metadata and a relative storage key, not binary APK contents.

Upload lifecycle:

1. Multer writes a bounded temporary file under the OS temporary directory relixor-uploads.
2. The controller checks app existence, version, positive version code, channel, duplicate release key, and APK ZIP signature.
3. SHA-256 is computed.
4. LocalStorageProvider creates the destination directory, copies the file, removes the temporary file, and returns size/key.
5. Release stores appId, storageKey, filename, size, checksum, channel, and uploader.

Storage key format:

~~~text
apks/<appId>/<channel>_v<version>_vc<versionCode>_<sha256-prefix>.apk
~~~

| Layer | Meaning | Persistence |
|---|---|---|
| Container filesystem | Temporary uploads and runtime files | Ephemeral |
| Docker named volume | relixor_storage:/app/storage/apks | Persists while volume remains |
| Host filesystem | Docker driver mountpoint | Driver-dependent; do not guess |
| PostgreSQL | Users, apps, releases, tokens, audits | relixor_pgdata volume |
| Object storage | No runtime implementation | Not available |

Inspect the actual location:

~~~bash
docker volume ls
docker volume inspect relixor_storage
docker inspect relixor-backend
~~~

Read Mountpoint, Source, and Destination. Rootless/custom Docker data roots may differ. Removing relixor_storage loses APK files while database references may remain; no orphan reconciliation exists.

## Backup and restore

Database and APK files are separate responsibilities. backup.sh creates database.sql, artifacts.tar.gz, metadata.json, and SHA256SUMS in a temporary directory, publishing only after required files exist. It can use a running relixor-postgres container, DATABASE_URL, or local pg_dump. BACKUP_RETENTION_COUNT is optional.

### Current backup procedure

Use protected secret injection; never put passwords in history:

~~~bash
BACKUP_DIR=/srv/relixor-backups/relixor_backup_YYYYMMDD_HHMMSS \
STORAGE_DIR=/path/to/verified/storage-copy \
DATABASE_URL='postgresql://user@host/database' \
./scripts/backup.sh
~~~

There is no maintenance mode or coordinated upload lock. Pause CI publishing and release changes for a high-confidence backup, then validate both results.

### Read-only APK volume archive

~~~bash
mkdir -p /srv/relixor-backups/apk-volume
docker volume inspect relixor_storage
docker run --rm \
  -v relixor_storage:/source:ro \
  -v /srv/relixor-backups/apk-volume:/backup \
  alpine:3.20 sh -c 'tar -czf /backup/relixor_storage_YYYYMMDD_HHMMSS.tar.gz -C /source .'
sha256sum /srv/relixor-backups/apk-volume/relixor_storage_YYYYMMDD_HHMMSS.tar.gz
tar -tzf /srv/relixor-backups/apk-volume/relixor_storage_YYYYMMDD_HHMMSS.tar.gz | head
~~~

The archive is outside the source volume. Preserve ownership/modes appropriate to the restore host.

### PostgreSQL logical backup

~~~bash
mkdir -p /srv/relixor-backups/postgres
docker exec relixor-postgres pg_dump -Fc \
  -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  > /srv/relixor-backups/postgres/relixor_YYYYMMDD_HHMMSS.dump
pg_restore --list /srv/relixor-backups/postgres/relixor_YYYYMMDD_HHMMSS.dump | head
sha256sum /srv/relixor-backups/postgres/relixor_YYYYMMDD_HHMMSS.dump
~~~

Use .pgpass or secret injection; do not expose a password in command arguments. A logical dump is not a live data-directory copy.

### Restore safety

restore.sh requires database.sql, artifacts.tar.gz, metadata.json, and SHA256SUMS. It validates sha256sum before database restoration, requires CONFIRM_RESTORE=YES, requires explicit RESTORE_DATABASE_URL or RESTORE_CONTAINER, requires RESTORE_TARGET=DISPOSABLE, and requires RESTORE_STORAGE_DEST. It never implicitly uses the application database URL or default storage.

~~~bash
CONFIRM_RESTORE=YES \
RESTORE_TARGET=DISPOSABLE \
RESTORE_DATABASE_URL='postgresql://restore-target' \
RESTORE_STORAGE_DEST=/srv/relixor-restore/storage \
./scripts/restore.sh /srv/relixor-backups/relixor_backup_YYYYMMDD_HHMMSS
~~~

Safe recovery:

1. Create a fresh disposable database/container and empty storage directory.
2. Validate manifest and archive listing.
3. Restore database and artifacts to explicit disposable targets.
4. Query representative App/Release rows.
5. Confirm every Release.storageKey exists and compare file SHA-256 to Release.sha256.
6. Start a disposable backend and test health, metadata lookup, and download.
7. Only then design a separately approved production restoration procedure.

Do not use docker compose down -v; it removes named volumes. Container recreation is recoverable while volumes remain. Volume loss requires valid backups. The disposable harness also tests corrupted database content, missing files, invalid manifests, wrong target designation, and missing confirmation, but requires Docker.

### Encryption and retention

export-encrypted-backup.sh validates a completed local backup and uses authenticated age encryption with an external recipient file. The private identity is not included in the archive or manifest. Optional AWS CLI upload can target an S3-compatible URI. This was not operationally verified in the restricted audit environment.

Generate age keys outside the repository with age-keygen. Store the private identity in a secrets manager/offline protected copy and provide only the recipient file to export jobs. Losing the identity makes backups unrecoverable. Recommended, not current automation: 14 daily, 8 weekly, 12 monthly, encrypted off-host copies, and monthly restore drills.

## Docker and deployment

| Service | Purpose | Persistence/health |
|---|---|---|
| postgres | PostgreSQL 17 | relixor_pgdata; pg_isready |
| backend | Express/Prisma API | relixor_storage; /health; waits for healthy postgres |
| frontend | React static build | Internal port 80 |
| nginx | Public reverse proxy | Host HTTP port to 80 |

Compose uses relixor_net. Backend startup runs prisma migrate deploy before Node. Nginx sends /api/ and /health to backend and all other paths to frontend. Nginx allows 500M uploads and 300-second timeouts. Frontend Nginx uses SPA fallback.

~~~bash
docker compose config --quiet
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 nginx
docker compose up -d --build
~~~

For production, remove or firewall PostgreSQL host publishing, terminate HTTPS at a trusted edge, and review image/dependency pinning. Compose config validation should use non-secret fixture values.

## Environment reference

No values are reproduced. An .env.example was not present in the inspected file list.

| Variable | Consumer | Required/default | Secret | Notes |
|---|---|---|---|---|
| POSTGRES_USER, POSTGRES_DB | Compose/PostgreSQL/scripts | Required by Compose | No | Database identity. |
| POSTGRES_PASSWORD | Compose/PostgreSQL | Required | Yes | Never log or commit. |
| POSTGRES_PORT | Compose | Optional host mapping | No | Restrict/remove in production. |
| DATABASE_URL | Prisma/backup | Required for Prisma | May contain secret | Compose constructs it. |
| NODE_ENV | Backend/seed/logger | Production in Compose | No | Enables production checks. |
| PORT | Backend | Code default 5000 | No | API port. |
| JWT_SECRET | Backend | Required production, >=32 chars | Yes | Unique external secret. |
| JWT_EXPIRES_IN | Backend | Default 7d | No | JWT lifetime. |
| CORS_ORIGIN | Backend | Required production | No | Trusted comma-separated origins. |
| ADMIN_DEFAULT_EMAIL/NAME | Backend/seed | Required Compose; code fallback | No | Bootstrap identity. |
| ADMIN_DEFAULT_PASSWORD | Backend/seed | Required production | Yes | External secret. |
| STORAGE_PROVIDER | Backend | Default local | No | Unsupported values fall back local. |
| STORAGE_LOCAL_DIR | Backend/seed | Compose /app/storage/apks | No | Local root. |
| MAX_FILE_SIZE_MB | Upload | Default/Compose 500 | No | Align with Nginx limit. |
| DEBUG, SEED_DEMO_DATA | Logger/seed | Optional | No | Review before production. |
| BACKUP_DIR, STORAGE_DIR, BACKUP_RETENTION_COUNT | Backup | Optional | No | Paths/retention. |
| CONFIRM_RESTORE, RESTORE_TARGET, RESTORE_DATABASE_URL, RESTORE_CONTAINER, RESTORE_STORAGE_DEST | Restore | Explicit safety inputs | URL may contain secret | Target must be disposable. |
| BACKUP_AGE_RECIPIENT_FILE, REMOTE_BACKUP_DIR, S3_BACKUP_URI | Export | Required export/optional S3 | Key path sensitive | Private identity stays separate. |
| BACKUP_STATE_DIR | Scheduler | Optional | No | Lock/status directory. |

## Database

~~~mermaid
erDiagram
 USER ||--o{ RELEASE : uploads
 USER ||--o{ API_TOKEN : owns
 USER ||--o{ AUDIT_LOG : causes
 APP ||--o{ RELEASE : contains
 APP ||--o{ API_TOKEN : scopes
 APP ||--o{ AUDIT_LOG : references
 USER { string id PK; string email UK; enum role; boolean isActive }
 APP { string id PK; string packageName UK; string name }
 RELEASE { string id PK; string appId FK; string storageKey; string sha256; int versionCode; enum channel }
 API_TOKEN { string id PK; string tokenHash UK; string userId FK; string appId FK; enum permission; boolean revoked }
 AUDIT_LOG { string id PK; string userId FK; string appId FK; string action; datetime createdAt }
~~~

Models are User, App, Release, ApiToken, and AuditLog. Enums are Role, ReleaseChannel, and TokenPermission.

Important constraints: unique user email, app packageName, tokenHash; unique release appId/version/versionCode; indexes on appId, channel, tokenHash, userId, action, entityType, createdAt. App deletion cascades releases and app-scoped tokens; controller attempts file deletion first. User deletion cascades tokens and nulls uploader/audit user references. App deletion nulls audit app references. No organization, membership, invitation, quota, or tenant IDs exist.

The migration is backend/prisma/migrations/20261013155100_init/migration.sql. Production uses prisma migrate deploy. README local setup mentions db push, which must not be used against production.

## API inventory

Base prefix is /api/v1. Health is also /health.

| Method/path | Auth/permission | Behavior |
|---|---|---|
| POST /auth/login | Public, rate limited | Zod email/password, bcrypt, JWT, AUTH_LOGIN audit. |
| GET /auth/me | Authenticated | Current profile. |
| POST /auth/change-password | Interactive JWT | Current/new password; API tokens rejected. |
| GET /apps | READ | Search/list apps and latest release; token scope applied. |
| GET /apps/:appId | READ | App and recent releases; scope checked. |
| POST /apps | ADMIN/DEVELOPER + WRITE | Validates name/package/metadata. |
| PUT /apps/:appId | ADMIN/DEVELOPER + WRITE | Updates metadata. |
| DELETE /apps/:appId | ADMIN + ADMIN | Deletes rows and best-effort files. |
| GET /apps/:appId/releases | READ | Lists releases and valid channel filter. |
| GET /apps/:appId/releases/:releaseId | READ | Requires matching app/release IDs. |
| POST /apps/:appId/releases | ADMIN/DEVELOPER + WRITE | Multipart APK, version, positive code, channel, notes. |
| GET /apps/:appId/releases/:releaseId/download | READ | Authenticated stream and side effects. |
| DELETE /apps/:appId/releases/:releaseId | ADMIN/DEVELOPER + WRITE | Deletes artifact best-effort and row. |
| GET/POST/PUT/DELETE /users... | Interactive ADMIN | User administration. |
| GET/POST/PUT/DELETE /tokens... | Interactive ADMIN/DEVELOPER | Token lifecycle. |
| GET /stats/dashboard | Authenticated | Metrics, storage, releases, activity. |
| GET /audit-logs | Admin system; developer app scope | Pagination/action/app filters. |
| GET /health and /api/v1/health | Public | DB/storage checks; 200 or 503. |

## Security audit

| Severity | Finding | Evidence/impact | Recommendation |
|---|---|---|---|
| High | Single-tenant namespace | Schema has no organization boundary | Design ownership/backfill/rollback before tenant work. Verified. |
| High | PostgreSQL host mapping | Compose publishes database port | Remove or firewall in production. Verified. |
| High | HTTP-only edge | Nginx listens on port 80 | Terminate and enforce HTTPS. Verified. |
| Medium | Unsupported storage fallback | Non-local provider falls back local | Fail closed or implement/test provider. Verified. |
| Medium | Query-string download token | Middleware accepts query token | Prefer short-lived signed grants and limit leakage. Verified. |
| Medium | Shallow APK validation | ZIP magic/header, not signing/package semantics | Add APK parser/signature checks if required. Verified. |
| Medium | Best-effort audit writes | Audit failures do not fail operation | Alert or define durable audit policy. Verified. |
| Medium | No request IDs/disk alerts | Logs have UTC timestamps only | Add correlation and capacity monitoring. Verified. |
| Low | Generic errors mapped to 400 | Unexpected Error becomes BAD_REQUEST | Return safe 500 responses for unexpected failures. Verified. |
| Informational | JWT localStorage | Browser token is localStorage data | Evaluate secure cookie/session architecture. Verified. |

Positive controls include bcrypt, production JWT/CORS checks, Helmet, rate limiting, API-token hashing, app-scoped permissions, path containment, upload limits, checksums, atomic copy, and graceful shutdown. They are not a security certification.

## Monitoring and troubleshooting

Safe diagnostics:

~~~bash
docker compose ps
docker compose logs --tail=100 backend
docker compose logs --tail=100 nginx
docker compose exec postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
curl -i http://localhost:8080/health
~~~

| Symptom | Likely causes/checks | Safe response |
|---|---|---|
| 502 Bad Gateway | Service unavailable, migration failure, wrong Nginx DNS | Inspect Compose and logs; do not expose backend as permanent fix. |
| Backend unhealthy | DB/storage error | Call /health, inspect logs, use pg_isready; do not production db push. |
| DB auth error | Required variables mismatch | Inspect redacted config/logs; never print passwords. |
| Migration error | Drift, failed migration, DB unavailable | Back up and review state; do not delete volumes/history. |
| Failed login | Invalid/inactive user, rate limit, API outage | Check response, health, audit and admin reset path. |
| Invalid package | Regex or unique constraint | Use valid reverse-domain name. |
| Upload failure | Size, extension, ZIP header, duplicate, missing app | Check API code/logs; do not copy arbitrary files. |
| Missing APK | Lost volume, orphan row, permissions, wrong key | Compare Release.storageKey to storage; use disposable restore. |
| Disk exhaustion | Artifacts/logs/Docker layers | Measure and apply reviewed retention; never delete data volume casually. |
| Corrupt backup | Interrupted copy/checksum mismatch | Reject and use previous known-good backup. |
| Restore failure | Target/confirmation/manifest/compatibility | Use fresh disposable targets first. |

## Testing and QA

Backend tests are auth.test.ts, permissions.test.ts, security.test.ts, and releases.test.ts. They cover login, RBAC, token restrictions, traversal, upload/download behavior, duplicate releases, and checksum headers. Frontend has a build script but no lint/unit-test script. Disposable backup and encryption harnesses exist.

The restricted audit environment previously had Docker CLI without a reachable daemon and lacked age/age-keygen; those tests were BLOCKED, not passed. Backend Jest listener tests were blocked by sandbox EPERM binding 127.0.0.1. A suitable CI host should run:

~~~bash
bash -n scripts/*.sh
npm run build
npm test -- --runInBand
./scripts/test-backup-restore.sh
./scripts/test-encrypted-backup.sh
~~~

Missing high-value tests include file/database reconciliation after restore, wrong-key/interrupted encryption, S3 upload failure/retry, low-disk behavior, HTTPS proxy headers, and tenant-negative authorization after tenant design.

## Roadmap

| Priority | Item | Value | Dependency | Complexity |
|---|---|---|---|---|
| P0 | Execute disposable backup/restore evidence | Prove recovery | Docker/PostgreSQL CI | Medium |
| P0 | Restrict PostgreSQL and deploy HTTPS | Reduce exposure | Network/edge ownership | Low/Medium |
| P0 | Fail closed for unsupported storage | Prevent silent misconfiguration | Storage decision | Low |
| P1 | Storage reconciliation/orphan cleanup | Repair partial operations | Scanner policy | Medium |
| P1 | Request IDs, disk/backup alerts | Incident response | Alert destination | Medium |
| P1 | Bootstrap account lifecycle review | Reduce account risk | Provisioning policy | Medium |
| P2 | Verified age/S3 export and restore drill | Off-site recovery | Key custody/test service | Medium/High |
| P2 | Dependency/image scanning | Supply-chain visibility | CI provider | Low/Medium |
| P3 | Tested S3 runtime provider | Scale artifacts | Storage design | High |
| P3 | Organizations/memberships/quotas | Tenant isolation | Backfill/rollback plan | High |
| P3 | OpenAPI contract | Integration usability | Route/schema inventory | Medium |

## Final summary

### What exists

A React/Express/Prisma/PostgreSQL private APK release platform with JWT/API-token auth, RBAC, app/release management, APK validation and streaming, SHA-256 metadata, dashboard metrics, audit logs, health checks, Docker deployment, local persistent storage, CI/CD examples, and backup/restore utilities.

### Confirmed by source inspection

Compose volume names/mount; Prisma models and migration; routes/middleware; upload temporary path and key format; checksum/download headers; backup files and restore gates.

### Unverified or incomplete

- Docker-based disposable restore and database/file consistency.
- age encryption/decryption and S3 upload.
- Production HTTPS and actual host volume mount.
- Transactionally coordinated DB/APK snapshots.
- External alerts, disk monitoring, request IDs, orphan reconciliation.
- Multi-organization isolation.

### Production checklist

- [x] Auth/RBAC/upload/path/volume/migration review
- [x] DB and APK storage locations documented
- [x] Explicit disposable restore gates
- [ ] Execute disposable restore and retain evidence
- [ ] Execute age round trip/tamper test
- [ ] Restrict PostgreSQL and deploy HTTPS
- [ ] Add request IDs, disk/backup alerts, reconciliation
- [ ] Approve tenant ownership/backfill architecture

### If I Need to Back Up Relixor Today, What Exactly Should I Do?

1. Run docker volume inspect relixor_storage; do not guess the host path.
2. Pause CI publishing and release changes because no coordinated snapshot lock exists.
3. Archive relixor_storage read-only to a host directory outside the volume.
4. Run a logical pg_dump from relixor-postgres using protected secret injection.
5. Hash both archives and store them outside the source volume.
6. Copy to an off-host protected destination; use age export only after installing/testing key custody.
7. Record timestamps, Compose/migration revision, volume names, and checksums without secrets.
8. Periodically restore both into fresh disposable targets, compare Release.storageKey and SHA-256, and test a download.

Never run docker compose down -v, put an archive inside the source volume, restore over live targets as a first test, or treat a copied PostgreSQL data directory as a logical backup.

