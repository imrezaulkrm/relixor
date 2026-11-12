# Retention & Cleanup

Retention frees APK storage **without destroying release history**. When a release is cleaned up, its APK file is deleted and the metadata row is marked `ARCHIVED`; audit/status/QA records remain.

## Defaults and safety

- Policies exist per channel; BETA defaults to 90 days (seeded). Adjust per environment.
- **PRODUCTION is protected** and cannot be configured for deletion (`PRODUCTION_RETENTION_FORBIDDEN`).
- Pinned releases, the current production release, and releases in active workflow states are excluded from candidates.
- Execution is **disabled by default**: `RETENTION_ALLOW_DELETE=false`.
- The scheduler is **off by default**: `RETENTION_SCHEDULE_ENABLED=false`.
- `DRY_RUN` is the safe preview; `EXECUTE` is irreversible for file bytes.

## Why archive instead of delete rows

Deleting rows would break audit history, QA traceability and status history. Archiving preserves the release record and its evidence while reclaiming the large binary. Archived releases cannot be downloaded.

## Configure a policy (ADMIN)

1. **Retention** page (or `PUT /api/v1/retention/policies/:channel`).
2. Set `retentionDays` (integer 0–3650) and `enabled`.
3. Save. The change is audited.
4. Review the policy table: channel, days, enabled, last update.

`retentionDays=0` is accepted by validation but interpret it deliberately; preview tells you exactly what would match.

## Preview (dry run)

`GET /api/v1/retention/candidates` returns the releases eligible under current policies, with app/version/channel/size/reason. `POST /api/v1/retention/cleanup` with `{"mode":"DRY_RUN"}` records a dry-run execution and returns the same candidate set without touching files.

Always preview after policy changes and after bulk uploads.

## Execute deletion

Prerequisites:

1. A verified database **and** storage backup.
2. A reviewed dry-run whose candidate list is expected.
3. Explicit operational approval.
4. `RETENTION_ALLOW_DELETE=true` in the backend environment, container recreated.

Then `POST /api/v1/retention/cleanup` with `{"mode":"EXECUTE"}`.

Behaviour:

- If deletion is disabled, returns 403 `RETENTION_EXECUTION_DISABLED` — nothing is deleted.
- For each candidate: delete APK via storage provider, then mark `ARCHIVED`.
- Failures are recorded; the run is audited (`RETENTION_CLEANUP_EXECUTE`).
- Storage stats/history update.

## Scheduler

Set `RETENTION_SCHEDULE_ENABLED=true` and optionally `RETENTION_INTERVAL_MINUTES` (minimum 60, default 1440). The scheduler runs inside the API process; it is not a separate worker and will restart with the container. Keep it disabled until manual runs are trusted.

## History and storage

- `GET /api/v1/retention/history` — runs, mode, counts, timestamps.
- `GET /api/v1/retention/storage` — storage footprint and per-channel statistics.

## Recovery

Once bytes are deleted, recovery is only from your APK backup. Archived metadata remains, so you know what was lost and when. If a rollback target was cleaned, it cannot be restored by Relixor.

## Recommended policy shape

| Channel | Example | Rationale |
|---|---|---|
| DEV | 14–30 days | High churn |
| QA | 30–60 days | Test evidence window |
| STAGING | 60–90 days | Pre-production validation |
| BETA | 90 days | External beta support |
| PRODUCTION | never | Required for rollback/download |

Pin releases that support long-lived customer versions.

## Do not

- Do not enable deletion and the scheduler in the same change; do one at a time.
- Do not run `docker compose down -v` or delete volumes to “clean up”.
- Do not delete audit rows to save space.
- Do not set PRODUCTION retention; the API refuses it.

## Related

- [Backup & restore](/docs/administration/backup-restore)
- [Database](/docs/administration/database)
- [Maintenance checklist](/docs/maintenance/maintenance-checklist)
