#!/usr/bin/env bash
set -Eeuo pipefail

if ! command -v age >/dev/null 2>&1 || ! command -v age-keygen >/dev/null 2>&1; then
  echo "BLOCKED: age and age-keygen are required; encrypted export test was not run." >&2
  exit 77
fi
ROOT=$(mktemp -d "${TMPDIR:-/tmp}/relixor-age-test.XXXXXX")
trap 'rm -rf "${ROOT}"' EXIT
mkdir -p "${ROOT}/backup" "${ROOT}/remote"
printf 'database\n' > "${ROOT}/backup/database.sql"
printf 'artifacts\n' > "${ROOT}/backup/artifacts.tar.gz"
printf '{}\n' > "${ROOT}/backup/metadata.json"
(cd "${ROOT}/backup" && sha256sum artifacts.tar.gz database.sql metadata.json > SHA256SUMS)
age-keygen > "${ROOT}/identity.txt" 2>/dev/null
grep '^# public key:' "${ROOT}/identity.txt" | sed 's/^# public key: //' > "${ROOT}/recipient.txt"
BACKUP_DIR="${ROOT}/backup" BACKUP_AGE_RECIPIENT_FILE="${ROOT}/recipient.txt" REMOTE_BACKUP_DIR="${ROOT}/remote" ./scripts/export-encrypted-backup.sh
encrypted=$(find "${ROOT}/remote" -type f -name '*.enc' -print -quit)
test -n "${encrypted}"
age -d -i "${ROOT}/identity.txt" "${encrypted}" > "${ROOT}/decrypted.tar.gz"
tar -tzf "${ROOT}/decrypted.tar.gz" | grep -Fx 'backup/database.sql'
cp "${encrypted}" "${ROOT}/tampered.enc"
printf 'tamper' >> "${ROOT}/tampered.enc"
if age -d -i "${ROOT}/identity.txt" "${ROOT}/tampered.enc" >/dev/null 2>&1; then exit 1; fi
echo 'PASS: authenticated encrypted export, decryption, and tamper rejection passed.'
