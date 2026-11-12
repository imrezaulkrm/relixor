# Disaster Recovery

## Objectives

Set explicit targets with stakeholders. Suggested starting points for a single-node deployment:

- **RPO:** ≤ 24 hours (daily backups); ≤ 1 hour if WAL archiving is added (not implemented by Relixor).
- **RTO:** 2–4 hours for a prepared rebuild.

Relixor does not provide built-in replication, HA, or PITR. These are infrastructure responsibilities.

## Scenarios

| Scenario | Response |
|---|---|
| Host loss | Rebuild VM, install Docker, restore code + `.env`, restore DB and APK volume |
| Database corruption | Stop services, restore latest verified dump, replay migrations |
| Accidental app deletion | Restore DB + APKs from a backup taken before deletion |
| Ransomware | Isolate host, use immutable/offline backups, rebuild clean, rotate all secrets |
| Storage volume loss | Restore APK archive; DB metadata alone is insufficient |
| Cert compromise | Revoke/reissue, rotate secrets, review access logs |

## Recovery procedure

1. Declare incident, assign owner, stop writes (stop nginx/backend).
2. Provision clean host; install Docker/Compose; clone the recorded version.
3. Restore encrypted `.env` from the secret store (or recreate values).
4. Restore PostgreSQL dump into a fresh database.
5. Restore APK storage volume.
6. `docker compose up -d`; migrations run; check logs.
7. Verify `/health`, login, release list, one download checksum, public portal.
8. Rotate credentials if compromise is suspected.
9. Monitor; document timeline and data-loss window.

## Evidence to preserve

Container logs, host auth logs, proxy logs, audit export, database snapshot, current release/version. Do not destroy the damaged environment before capture when legally/operationally required.

## Test cadence

Quarterly isolated restore, at minimum. Record date, backup used, duration, failures, and fixes. An untested backup is a hope, not a recovery plan.

## Related

- [Backup & restore](/docs/administration/backup-restore)
- [Upgrade & rollback](/docs/administration/upgrade-rollback)
- [Troubleshooting](/docs/troubleshooting/index)
