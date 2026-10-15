#!/usr/bin/env bash
set -Eeuo pipefail

# Run from cron/systemd/container scheduler. The lock prevents overlap and
# status files make failures observable without introducing a service daemon.
STATE_DIR="${BACKUP_STATE_DIR:-./backups/.state}"
LOCK_FILE="${STATE_DIR}/backup.lock"
STATUS_FILE="${STATE_DIR}/last-status.json"
mkdir -p "${STATE_DIR}"
exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  echo "Backup already running; exiting without starting a duplicate job." >&2
  exit 2
fi

started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
backup_dir="${BACKUP_DIR:-./backups/relixor_backup_$(date +%Y%m%d_%H%M%S)}"
if BACKUP_DIR="${backup_dir}" ./scripts/backup.sh; then
  finished=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  size=$(du -sb "${backup_dir}" | awk '{print $1}')
  printf '{"status":"success","startedAt":"%s","completedAt":"%s","sizeBytes":%s}\n' "${started}" "${finished}" "${size}" > "${STATUS_FILE}"
else
  rc=$?
  finished=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  printf '{"status":"failed","startedAt":"%s","completedAt":"%s","exitCode":%s}\n' "${started}" "${finished}" "${rc}" > "${STATUS_FILE}"
  echo "Backup failed; alert on ${STATUS_FILE} status=failed" >&2
  exit "${rc}"
fi
