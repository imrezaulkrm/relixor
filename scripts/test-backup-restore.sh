#!/usr/bin/env bash
set -Eeuo pipefail

# Disposable integration test. Exit 77 means Docker is unavailable.
if ! command -v docker >/dev/null 2>&1 || ! docker info >/dev/null 2>&1; then
  echo "BLOCKED: Docker daemon is unavailable; disposable restore test was not run." >&2
  exit 77
fi
for tool in sha256sum tar mktemp; do
  command -v "${tool}" >/dev/null 2>&1 || { echo "BLOCKED: missing ${tool}" >&2; exit 77; }
done

TEST_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/relixor-backup-test.XXXXXX")
CONTAINER="relixor-backup-test-${RANDOM}-${RANDOM}"
DB_USER=relixor_backup_test
DB_PASSWORD=relixor_backup_test_password
SOURCE_DB=relixor_backup_source
RESTORE_DB=relixor_backup_restore
BACKUP_DIR="${TEST_ROOT}/backup"
SOURCE_STORAGE="${TEST_ROOT}/source-storage"
RESTORED_STORAGE="${TEST_ROOT}/restored-storage"
cleanup() { docker rm -f "${CONTAINER}" >/dev/null 2>&1 || true; rm -rf "${TEST_ROOT}"; }
trap cleanup EXIT

docker run -d --name "${CONTAINER}" -e POSTGRES_USER="${DB_USER}" \
  -e POSTGRES_PASSWORD="${DB_PASSWORD}" -e POSTGRES_DB="${SOURCE_DB}" \
  -p 127.0.0.1::5432 \
  postgres:17-alpine >/dev/null
for _ in $(seq 1 60); do
  docker exec "${CONTAINER}" pg_isready -U "${DB_USER}" -d "${SOURCE_DB}" >/dev/null 2>&1 && break
  sleep 1
done
docker exec "${CONTAINER}" pg_isready -U "${DB_USER}" -d "${SOURCE_DB}" >/dev/null
docker exec -i "${CONTAINER}" psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${SOURCE_DB}" <<'SQL'
CREATE TABLE backup_probe (id integer PRIMARY KEY, label text NOT NULL);
INSERT INTO backup_probe VALUES (1, 'disposable-backup-test');
SQL

mkdir -p "${SOURCE_STORAGE}/apks/com.example.probe"
printf 'representative apk bytes\n' > "${SOURCE_STORAGE}/apks/com.example.probe/probe.apk"
printf 'metadata\n' > "${SOURCE_STORAGE}/apks/com.example.probe/metadata.txt"
PORT=$(docker port "${CONTAINER}" 5432/tcp | sed 's/.*://')
SOURCE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PORT}/${SOURCE_DB}"
DATABASE_URL="${SOURCE_URL}" BACKUP_DIR="${BACKUP_DIR}" STORAGE_DIR="${SOURCE_STORAGE}" ./scripts/backup.sh
(cd "${BACKUP_DIR}" && sha256sum -c SHA256SUMS)
test -s "${BACKUP_DIR}/metadata.json"
test "$(tar -xOzf "${BACKUP_DIR}/artifacts.tar.gz" ./apks/com.example.probe/probe.apk)" = "representative apk bytes"

docker exec -i "${CONTAINER}" psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d postgres -c "CREATE DATABASE ${RESTORE_DB};"
RESTORE_URL="postgresql://${DB_USER}:${DB_PASSWORD}@127.0.0.1:${PORT}/${RESTORE_DB}"
CONFIRM_RESTORE=YES RESTORE_TARGET=DISPOSABLE RESTORE_DATABASE_URL="${RESTORE_URL}" RESTORE_STORAGE_DEST="${RESTORED_STORAGE}" ./scripts/restore.sh "${BACKUP_DIR}"
docker exec -i "${CONTAINER}" psql -U "${DB_USER}" -d "${RESTORE_DB}" -tAc "SELECT label FROM backup_probe WHERE id=1" | grep -Fx disposable-backup-test
cmp "${SOURCE_STORAGE}/apks/com.example.probe/probe.apk" "${RESTORED_STORAGE}/apks/com.example.probe/probe.apk"
cmp "${SOURCE_STORAGE}/apks/com.example.probe/metadata.txt" "${RESTORED_STORAGE}/apks/com.example.probe/metadata.txt"

# Corruption and missing files must be rejected before a restore target is touched.
cp -a "${BACKUP_DIR}" "${TEST_ROOT}/corrupt"
printf 'corruption\n' >> "${TEST_ROOT}/corrupt/database.sql"
if CONFIRM_RESTORE=YES RESTORE_TARGET=DISPOSABLE RESTORE_DATABASE_URL="${RESTORE_URL}" RESTORE_STORAGE_DEST="${TEST_ROOT}/must-stay-empty" ./scripts/restore.sh "${TEST_ROOT}/corrupt" >/dev/null 2>&1; then exit 1; fi
test ! -e "${TEST_ROOT}/must-stay-empty"
rm -f "${TEST_ROOT}/corrupt/artifacts.tar.gz"
if CONFIRM_RESTORE=YES RESTORE_TARGET=DISPOSABLE RESTORE_DATABASE_URL="${RESTORE_URL}" RESTORE_STORAGE_DEST="${TEST_ROOT}/must-stay-empty" ./scripts/restore.sh "${TEST_ROOT}/corrupt" >/dev/null 2>&1; then exit 1; fi
test ! -e "${TEST_ROOT}/must-stay-empty"
if RESTORE_TARGET=DISPOSABLE RESTORE_DATABASE_URL="${RESTORE_URL}" RESTORE_STORAGE_DEST="${TEST_ROOT}/must-stay-empty" ./scripts/restore.sh "${BACKUP_DIR}" >/dev/null 2>&1; then exit 1; fi
if CONFIRM_RESTORE=YES RESTORE_TARGET=PRODUCTION RESTORE_DATABASE_URL="${RESTORE_URL}" RESTORE_STORAGE_DEST="${TEST_ROOT}/must-stay-empty" ./scripts/restore.sh "${BACKUP_DIR}" >/dev/null 2>&1; then exit 1; fi
cp -a "${BACKUP_DIR}" "${TEST_ROOT}/invalid-manifest"
printf 'not-a-manifest\n' > "${TEST_ROOT}/invalid-manifest/SHA256SUMS"
if CONFIRM_RESTORE=YES RESTORE_TARGET=DISPOSABLE RESTORE_DATABASE_URL="${RESTORE_URL}" RESTORE_STORAGE_DEST="${TEST_ROOT}/must-stay-empty" ./scripts/restore.sh "${TEST_ROOT}/invalid-manifest" >/dev/null 2>&1; then exit 1; fi
echo 'PASS: disposable backup, checksum, restore, corruption, missing-file, and confirmation checks passed.'
