#!/usr/bin/env bash
set -euo pipefail

# Relixor Restore Script
# Usage: ./scripts/restore.sh <BACKUP_DIR>

if [ -f .env ]; then
  set -a; source .env; set +a
elif [ -f backend/.env ]; then
  set -a; source backend/.env; set +a
fi

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path_to_backup_directory>"
  exit 1
fi

if [ "${CONFIRM_RESTORE:-}" != "YES" ]; then
  echo "ERROR: Restore is destructive. Set CONFIRM_RESTORE=YES to continue."
  exit 1
fi

if [ -z "${RESTORE_DATABASE_URL:-}" ] && [ -z "${RESTORE_CONTAINER:-}" ]; then
  echo "ERROR: Set RESTORE_DATABASE_URL or RESTORE_CONTAINER explicitly; application DATABASE_URL is never used for restore." >&2
  exit 1
fi
if [ "${RESTORE_TARGET:-}" != "DISPOSABLE" ]; then
  echo "ERROR: RESTORE_TARGET=DISPOSABLE is required; production restore is refused." >&2
  exit 1
fi
if [ -z "${RESTORE_STORAGE_DEST:-}" ]; then
  echo "ERROR: RESTORE_STORAGE_DEST is required; implicit application storage is refused." >&2
  exit 1
fi

BACKUP_DIR="$1"
STORAGE_DEST="${RESTORE_STORAGE_DEST}"

if [ ! -d "${BACKUP_DIR}" ]; then
  echo "ERROR: Backup directory not found: ${BACKUP_DIR}"
  exit 1
fi

if [ ! -f "${BACKUP_DIR}/SHA256SUMS" ] || [ ! -f "${BACKUP_DIR}/database.sql" ] || [ ! -f "${BACKUP_DIR}/artifacts.tar.gz" ] || [ ! -f "${BACKUP_DIR}/metadata.json" ]; then
  echo "ERROR: Backup is incomplete; expected database.sql, artifacts.tar.gz, metadata.json, and SHA256SUMS."
  exit 1
fi

echo "=========================================================="
echo "Relixor Restore from: ${BACKUP_DIR}"
echo "=========================================================="

# 1. Verify Checksums
if [ -f "${BACKUP_DIR}/SHA256SUMS" ]; then
  echo "🔒 Verifying backup integrity..."
  (cd "${BACKUP_DIR}" && sha256sum -c SHA256SUMS)
fi

# 2. Restore PostgreSQL Database
echo "📦 Restoring database from SQL dump..."
if [ -n "${RESTORE_CONTAINER:-}" ]; then
  docker exec -i "${RESTORE_CONTAINER}" psql -U "${POSTGRES_USER:?POSTGRES_USER is required}" -d "${POSTGRES_DB:?POSTGRES_DB is required}" < "${BACKUP_DIR}/database.sql"
elif [ -n "${RESTORE_DATABASE_URL:-}" ]; then
  psql "${RESTORE_DATABASE_URL}" < "${BACKUP_DIR}/database.sql"
elif command -v psql >/dev/null 2>&1; then
  echo "ERROR: RESTORE_DATABASE_URL or RESTORE_CONTAINER must be set." >&2
  exit 1
else
  echo "ERROR: No PostgreSQL restore target is available." >&2
  exit 1
fi

# 3. Restore Storage Artifacts
if [ -f "${BACKUP_DIR}/artifacts.tar.gz" ]; then
  echo "📦 Restoring APK artifacts to ${STORAGE_DEST}..."
  mkdir -p "${STORAGE_DEST}"
  tar -xzf "${BACKUP_DIR}/artifacts.tar.gz" -C "${STORAGE_DEST}"
fi

echo "=========================================================="
echo "✅ Relixor restore completed successfully!"
echo "=========================================================="
