# Production readiness checklist

Audit baseline: 2026-10-15. Statuses reflect repository evidence; an item is not `DONE` merely because code exists without a successful operational test.

## Stage A — security and data safety

- DONE — JWT/API-token authentication, role checks, token app scope, release `appId + releaseId` containment, and local storage path containment are implemented and covered by tests.
- DONE — API tokens are hashed and plaintext is returned only at creation; token/user management rejects API-token authentication.
- PARTIAL — Audit-log authorization is role-aware, but the schema has no organization boundary and there is no request correlation ID.
- DONE — Production configuration now fails closed for missing/weak JWT, admin password, and CORS configuration.
- DONE — `.env`, keys, backups, and APK storage are ignored by Git, and root/backend Docker build contexts have checked-in `.dockerignore` files.

## Stage B — backup and restore

- PARTIAL — `scripts/backup.sh` now writes to a temporary directory, atomically publishes only complete PostgreSQL/APK archives, records metadata, and supports opt-in retention; encryption, remote destination, and a successful operational test remain.
- PARTIAL — Restore validates required files/checksums and requires `CONFIRM_RESTORE=YES`, `RESTORE_TARGET=DISPOSABLE`, an explicit database target, and an explicit artifact destination; the repeatable harness is `scripts/test-backup-restore.sh`, but execution is BLOCKED here because the Docker daemon is unavailable.
- PARTIAL — Optional `scripts/export-encrypted-backup.sh` uses authenticated `age` encryption with an external recipient file and can upload via AWS CLI to S3-compatible storage; it is not operationally tested here and does not yet provide remote restore automation.
- PARTIAL — `scripts/run-scheduled-backup.sh` provides non-overlap locking and JSON status with size/timestamps/failure code; host/container scheduling and alert delivery remain deployment responsibilities.

## Stage C — deployment and database reliability

- PARTIAL — PostgreSQL/storage volumes and health checks exist; Compose now requires credentials instead of insecure defaults.
- PARTIAL — Backend startup runs reviewed `prisma migrate deploy`; safe upgrade/rollback runbook and Compose validation CI are still missing.
- PARTIAL — Nginx proxies API and health endpoints, but TLS is deployment responsibility and internal services should not be published directly in production.

## Stage D — monitoring and operations

- DONE — Health endpoint checks database and storage, timestamps are UTC ISO strings, logs are structured in production, and graceful shutdown exists.
- PARTIAL — General/auth rate limits exist; request IDs, disk-capacity thresholds, durable alerts, and bounded upstream retries are missing. Scheduled backup failures are surfaced through a status file and stderr alert message.

## Stage E — multi-organization readiness

- MISSING — Current Prisma schema has one global user/app/release/token/audit namespace and no organizations or memberships.
- BLOCKED — Tenant migration requires a data ownership/backfill decision and compatibility plan before schema changes are safe. Independent hardening is prioritized first.

## Stage F — release and storage reliability

- PARTIAL — APK extension/header validation, size limits, server SHA-256, immutable unique release versions, atomic local storage, and streamed downloads exist.
- PARTIAL — Storage interface exists, but only local storage is implemented; S3 requires configuration, error handling, and tests before introduction.
- MISSING — Systematic orphan cleanup/reconciliation and immutable release policy at the database/API level beyond duplicate prevention.

## Stage G — frontend administration

- PARTIAL — Existing UI covers dashboard, users, tokens, apps, releases, and audit logs using real API calls.
- MISSING — Backup/restore operations, health/storage detail, token lifecycle audit visibility, and operational alerts UI.

## Required evidence before declaring production-ready

1. Run backend tests against an isolated PostgreSQL instance and execute a full backup → checksum validation → disposable restore → application verification cycle.
2. Validate Compose with `docker compose config` using a non-secret CI environment fixture; never print production `.env` values.
3. Add tenant design/backfill review before changing the Prisma schema.
4. Provide a key-management and S3-compatible test environment before certifying encrypted off-site export.

### Recovery and key handling

- Generate an age key outside the repository, for example with `age-keygen`; keep the private identity in a secrets manager or offline protected backup and provide only its public recipient file to export jobs.
- Rotate by adding a new recipient, testing a new export, and retaining the old identity until all backups encrypted to it reach retention expiry.
- Loss of the age identity makes encrypted backups unrecoverable; maintain a separately protected recovery copy and test decryption in a disposable environment.
- Restore is intentionally gated to `RESTORE_TARGET=DISPOSABLE` and requires `RESTORE_STORAGE_DEST`; production restore is not supported by this script.

## Evidence from latest verification

- PASS — `bash -n` for backup, restore, integration, encrypted-export, and scheduler scripts.
- PASS — `git diff --check`.
- PASS — `docker compose config --quiet` with non-secret fixture variables.
- PASS — Backend TypeScript build (`npm run build`).
- BLOCKED — `scripts/test-backup-restore.sh` returned exit 77 because Docker daemon access is unavailable; no restore claim is made.
- BLOCKED — `scripts/test-encrypted-backup.sh` requires `age`/`age-keygen`, which are not available in this environment; no encryption claim is made.

## Latest verification evidence

- PASS — Docker CLI detected: `/usr/bin/docker`, Docker 29.9.0.
- BLOCKED — Docker daemon: `docker info` exit 1; system service inspection is also unavailable in this restricted environment.
- BLOCKED — `age` and `age-keygen`: both absent.
- PASS — Shell syntax checks for all backup, restore, scheduler, export, and test scripts.
- PASS — `git diff --check`.
- PASS — `docker compose config --quiet` with non-secret fixture values.
- FAIL/BLOCKED — `npm test -- --runInBand`: all 43 tests failed at listener setup with `listen EPERM: operation not permitted 127.0.0.1`; this is an environment restriction, not evidence of application behavior.
- BLOCKED — Disposable restore and encryption round-trip tests were not executed because prerequisites were unavailable.

### Environment enablement commands (Ubuntu 26.04)

Run only on a development/CI host, never against the production stack:

```bash
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
newgrp docker
sudo apt-get update
sudo apt-get install -y age
```

Then verify with `docker info`, `age --version`, and `age-keygen --version`, and rerun the two disposable test scripts. The current sandbox cannot perform the Docker service change or install packages.
