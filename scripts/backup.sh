#!/usr/bin/env bash
set -euo pipefail

# Relixor Full Backup Script
# Creates a snapshot of PostgreSQL database and stored APK artifacts.

# Load environment if present
if [ -f .env ]; then
  set -a; source .env; set +a
elif [ -f backend/.env ]; then
  set -a; source backend/.env; set +a
fi

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="${BACKUP_DIR:-./backups/relixor_backup_${TIMESTAMP}}"
STORAGE_DIR="${STORAGE_DIR:-./storage/apks}"
BACKUP_PARENT=$(dirname "${BACKUP_DIR}")
mkdir -p "${BACKUP_PARENT}"
TEMP_DIR=$(mktemp -d "${BACKUP_PARENT}/.relixor_backup_${TIMESTAMP}.XXXXXX")
cleanup() {
  rm -rf "${TEMP_DIR}"
}
trap cleanup EXIT

if [ -e "${BACKUP_DIR}" ]; then
  echo "ERROR: Backup destination already exists: ${BACKUP_DIR}" >&2
  exit 1
fi

echo "=========================================================="
echo "Relixor Backup: ${TIMESTAMP}"
echo "Destination: ${BACKUP_DIR}"
echo "=========================================================="

# 1. Database Backup
echo "📦 Backing up PostgreSQL database..."
if docker ps | grep -q "relixor-postgres"; then
  docker exec relixor-postgres pg_dump -U "${POSTGRES_USER:?POSTGRES_USER is required}" "${POSTGRES_DB:?POSTGRES_DB is required}" > "${TEMP_DIR}/database.sql"
elif [ -n "${DATABASE_URL:-}" ]; then
  CLEAN_DB_URL="${DATABASE_URL%%\?*}"
  pg_dump "${CLEAN_DB_URL}" > "${TEMP_DIR}/database.sql"
elif command -v pg_dump >/dev/null 2>&1; then
  pg_dump -U "${POSTGRES_USER:?POSTGRES_USER is required}" -d "${POSTGRES_DB:?POSTGRES_DB is required}" > "${TEMP_DIR}/database.sql"
else
  echo "ERROR: Could not locate pg_dump; refusing to create an incomplete backup." >&2
  exit 1
fi

# 2. APK Artifacts Storage Backup
echo "📦 Archiving APK binary files..."
if [ -d "${STORAGE_DIR}" ]; then
  tar -czf "${TEMP_DIR}/artifacts.tar.gz" -C "${STORAGE_DIR}" .
else
  echo "⚠️ Storage directory ${STORAGE_DIR} does not exist yet. Creating empty archive."
  tar -czf "${TEMP_DIR}/artifacts.tar.gz" --files-from /dev/null
fi

# 3. Create SHA-256 Manifest
echo "🔒 Generating backup checksum manifest..."
cat > "${TEMP_DIR}/metadata.json" <<EOF
{"formatVersion":1,"createdAt":"$(date -u +%Y-%m-%dT%H:%M:%SZ)","database":"postgresql","storage":"${STORAGE_DIR}","hostname":"$(hostname)"}
EOF
(cd "${TEMP_DIR}" && sha256sum artifacts.tar.gz database.sql metadata.json > SHA256SUMS)

test -s "${TEMP_DIR}/database.sql"
test -s "${TEMP_DIR}/artifacts.tar.gz"
test -s "${TEMP_DIR}/SHA256SUMS"
mv "${TEMP_DIR}" "${BACKUP_DIR}"
trap - EXIT

# Retain only completed backup directories, and never remove the only backup.
RETENTION_COUNT="${BACKUP_RETENTION_COUNT:-0}"
if [[ "${RETENTION_COUNT}" =~ ^[1-9][0-9]*$ ]]; then
  mapfile -t completed_backups < <(find "${BACKUP_PARENT}" -mindepth 2 -maxdepth 2 -type f -name SHA256SUMS -printf '%h\n' | sort -r)
  if [ "${#completed_backups[@]}" -gt "${RETENTION_COUNT}" ]; then
    for old_backup in "${completed_backups[@]:${RETENTION_COUNT}}"; do
      if [ "${#completed_backups[@]}" -gt 1 ]; then rm -rf -- "${old_backup}"; fi
    done
  fi
fi

echo "=========================================================="
echo "✅ Backup completed successfully!"
echo "Files created:"
ls -lh "${BACKUP_DIR}"
echo "=========================================================="
