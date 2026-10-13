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

mkdir -p "${BACKUP_DIR}"

echo "=========================================================="
echo "Relixor Backup: ${TIMESTAMP}"
echo "Destination: ${BACKUP_DIR}"
echo "=========================================================="

# 1. Database Backup
echo "📦 Backing up PostgreSQL database..."
if docker ps | grep -q "relixor-postgres"; then
  docker exec relixor-postgres pg_dump -U "${POSTGRES_USER:-relixor}" "${POSTGRES_DB:-relixor}" > "${BACKUP_DIR}/database.sql"
elif [ -n "${DATABASE_URL:-}" ]; then
  CLEAN_DB_URL="${DATABASE_URL%%\?*}"
  pg_dump "${CLEAN_DB_URL}" > "${BACKUP_DIR}/database.sql"
elif command -v pg_dump >/dev/null 2>&1; then
  pg_dump -U "${POSTGRES_USER:-relixor}" -d "${POSTGRES_DB:-relixor}" > "${BACKUP_DIR}/database.sql"
else
  echo "⚠️ Warning: Could not locate pg_dump. Skipping SQL dump."
fi

# 2. APK Artifacts Storage Backup
echo "📦 Archiving APK binary files..."
if [ -d "${STORAGE_DIR}" ]; then
  tar -czf "${BACKUP_DIR}/artifacts.tar.gz" -C "$(dirname "${STORAGE_DIR}")" "$(basename "${STORAGE_DIR}")"
else
  echo "⚠️ Storage directory ${STORAGE_DIR} does not exist yet. Creating empty archive."
  tar -czf "${BACKUP_DIR}/artifacts.tar.gz" --files-from /dev/null
fi

# 3. Create SHA-256 Manifest
echo "🔒 Generating backup checksum manifest..."
cd "${BACKUP_DIR}"
sha256sum * > SHA256SUMS
cd - >/dev/null

echo "=========================================================="
echo "✅ Backup completed successfully!"
echo "Files created:"
ls -lh "${BACKUP_DIR}"
echo "=========================================================="
