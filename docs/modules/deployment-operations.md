# Deployment and operations

## Scope

Compose topology, Nginx proxy, Docker build inputs, CI examples, backup/restore, encrypted export, and scheduling.

## Key files and flow

`docker-compose.yml` runs PostgreSQL, backend, frontend, and Nginx with named volumes and health checks. `nginx/default.conf` proxies API/health and serves the SPA. `scripts/backup.sh`, `restore.sh`, `export-encrypted-backup.sh`, and `run-scheduled-backup.sh` implement operational workflows; disposable harnesses are `test-backup-restore.sh` and `test-encrypted-backup.sh`.

## Safety rules

Never expose secrets in docs or commands. Treat restore as destructive and use only its explicit disposable-target safeguards. Do not claim encryption, S3-compatible upload, restore, or production readiness without an executed round trip in an appropriate isolated environment. TLS and service exposure remain deployment responsibilities.

## Evidence and acceptance

- **Status:** **VERIFIED** (Deployment, Isolation, Backup/Restore)
- Compose validation passed (`docker compose -p relixor-uat config`).
- Full container topology deployed and verified healthy under project `relixor-uat`:
  - PostgreSQL published on `127.0.0.1:5434` (host port 5432 with `postgres-prod-copy` container untouched).
  - Web interface published on `http://localhost:8080`.
- Backup defect in `scripts/backup.sh` fixed (explicit environment variables and `DATABASE_URL` prioritized).
- Disposable backup, integrity checksums, restore, corruption rejection, and confirmation guards verified via `./scripts/test-backup-restore.sh` (PASS).
- Container recreation and database restart resilience verified (`Level D`).
- Missing `age`/`age-keygen` tools block encrypted export test (`./scripts/test-encrypted-backup.sh` returns exit 77).
- S3-compatible remote upload is NOT IMPLEMENTED.

Detailed execution results recorded in [docs/UAT_REPORT.md](../UAT_REPORT.md).
