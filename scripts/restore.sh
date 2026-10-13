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

BACKUP_DIR="$1"
STORAGE_DEST="${STORAGE_DEST:-./storage/apks}"

if [ ! -d "${BACKUP_DIR}" ]; then
  echo "ERROR: Backup directory not found: ${BACKUP_DIR}"
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
if [ -f "${BACKUP_DIR}/database.sql" ]; then
  echo "📦 Restoring database from SQL dump..."
  if docker ps | grep -q "relixor-postgres"; then
    cat "${BACKUP_DIR}/database.sql" | docker exec -i relixor-postgres psql -U "${POSTGRES_USER:-relixor}" -d "${POSTGRES_DB:-relixor}"
  elif [ -n "${DATABASE_URL:-}" ]; then
    CLEAN_DB_URL="${DATABASE_URL%%\?*}"
    psql "${CLEAN_DB_URL}" < "${BACKUP_DIR}/database.sql"
  elif command -v psql >/dev/null 2>&1; then
    psql -U "${POSTGRES_USER:-relixor}" -d "${POSTGRES_DB:-relixor}" < "${BACKUP_DIR}/database.sql"
  fi
fi

# 3. Restore Storage Artifacts
if [ -f "${BACKUP_DIR}/artifacts.tar.gz" ]; then
  echo "📦 Restoring APK artifacts to ${STORAGE_DEST}..."
  mkdir -p "$(dirname "${STORAGE_DEST}")"
  tar -xzf "${BACKUP_DIR}/artifacts.tar.gz" -C "$(dirname "${STORAGE_DEST}")"
fi

echo "=========================================================="
echo "✅ Relixor restore completed successfully!"
echo "=========================================================="
