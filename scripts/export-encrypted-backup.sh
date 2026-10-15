#!/usr/bin/env bash
set -Eeuo pipefail

# Optional authenticated encrypted export using age. Local backup directories
# remain plaintext for local restore; this wrapper encrypts a completed backup
# archive before upload. Required: BACKUP_DIR, BACKUP_AGE_RECIPIENT_FILE,
# REMOTE_BACKUP_DIR.
# Optional: AWS CLI upload with S3_BACKUP_URI=s3://bucket/prefix.

: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${BACKUP_AGE_RECIPIENT_FILE:?BACKUP_AGE_RECIPIENT_FILE is required}"
if ! command -v age >/dev/null 2>&1; then
  echo "ERROR: age is required for authenticated encrypted export" >&2
  exit 1
fi
if [ ! -r "${BACKUP_AGE_RECIPIENT_FILE}" ]; then
  echo "ERROR: age recipient file is not readable" >&2
  exit 1
fi
if [ ! -f "${BACKUP_DIR}/SHA256SUMS" ]; then
  echo "ERROR: refusing to export an incomplete backup" >&2
  exit 1
fi

if ! (cd "${BACKUP_DIR}" && sha256sum -c SHA256SUMS >/dev/null); then
  echo "ERROR: backup checksum validation failed" >&2
  exit 1
fi

REMOTE_BACKUP_DIR="${REMOTE_BACKUP_DIR:?REMOTE_BACKUP_DIR is required}"
mkdir -p "${REMOTE_BACKUP_DIR}"
ARCHIVE="$(basename "${BACKUP_DIR}").tar.gz.enc"
TEMP_FILE=$(mktemp "${REMOTE_BACKUP_DIR}/.upload.XXXXXX")
cleanup() { rm -f "${TEMP_FILE}"; }
trap cleanup EXIT

tar -czf - -C "$(dirname "${BACKUP_DIR}")" "$(basename "${BACKUP_DIR}")" \
  | age -R "${BACKUP_AGE_RECIPIENT_FILE}" -o "${TEMP_FILE}"
mv "${TEMP_FILE}" "${REMOTE_BACKUP_DIR}/${ARCHIVE}"

if [ -n "${S3_BACKUP_URI:-}" ]; then
  command -v aws >/dev/null 2>&1 || { echo "ERROR: aws CLI is required for S3_BACKUP_URI" >&2; exit 1; }
  aws s3 cp "${REMOTE_BACKUP_DIR}/${ARCHIVE}" "${S3_BACKUP_URI%/}/${ARCHIVE}" --only-show-errors
fi
echo "Encrypted backup exported: ${REMOTE_BACKUP_DIR}/${ARCHIVE}"
