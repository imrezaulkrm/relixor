#!/usr/bin/env bash
set -euo pipefail

# Relixor Initial Admin Seed Script
# Usage: ./scripts/seed-admin.sh [ADMIN_EMAIL] [ADMIN_PASSWORD] [ADMIN_NAME]

EMAIL="${1:-admin@relixor.internal}"
PASSWORD="${2:-AdminPassword123!}"
NAME="${3:-System Administrator}"

echo "=========================================================="
echo "Relixor Administrator Setup"
echo "Email: $EMAIL"
echo "Name : $NAME"
echo "=========================================================="

export ADMIN_DEFAULT_EMAIL="$EMAIL"
export ADMIN_DEFAULT_PASSWORD="$PASSWORD"
export ADMIN_DEFAULT_NAME="$NAME"

cd "$(dirname "$0")/../backend"
if [ -f dist/prisma/seed.js ]; then
  node dist/prisma/seed.js
else
  npx ts-node prisma/seed.ts
fi

echo "✅ Administrator account verified / created successfully."
