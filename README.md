# Relixor — Private APK Store & CI/CD Release Platform

**Production-ready, self-hosted private APK artifact repository and release management platform with native CI/CD integration.**

Relixor allows engineering and mobile DevOps teams to securely store, version, inspect, and distribute Android APK builds across **Dev**, **QA**, **Staging**, and **Production** release channels. It features real-time checksum calculation, role-based access control, cryptographic API tokens, atomic uploads, and first-class integration with GitLab CI/CD, GitHub Actions, and Jenkins.

---

## 📑 Table of Contents

1. [Features](#features)
2. [Tech Stack & Architecture](#tech-stack--architecture)
3. [Quick Start with Docker Compose](#quick-start-with-docker-compose)
4. [Local Development Setup](#local-development-setup)
5. [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
6. [CI/CD Integration Guide](#cicd-integration-guide)
   - [GitLab CI/CD](#gitlab-cicd)
   - [GitHub Actions](#github-actions)
   - [Jenkins Pipeline](#jenkins-pipeline)
   - [Direct cURL CLI](#direct-curl-cli)
7. [API Reference](#api-reference)
8. [Database & Storage Backup / Restore](#database--storage-backup--restore)
9. [Production Security Hardening](#production-security-hardening)
10. [Troubleshooting](#troubleshooting)
11. [Verification & Test Commands](#verification--test-commands)

---

## ✨ Features

- 📊 **Dashboard:** Real-time visibility into total applications, published releases, cumulative downloads, persistent storage footprint, channel distributions, and live audit activity.
- 📱 **Application Management:** Register applications with unique package names (`com.company.app`), view metadata, search by title or namespace, edit properties, and safely delete app repositories.
- 📦 **APK Releases & Channels:** Track version strings, integer version codes, release notes, exact file size, uploader details, and download counters across four distinct channels:
  - `DEV` — Daily engineering and feature branch builds.
  - `QA` — Quality assurance and automated test execution builds.
  - `STAGING` — Pre-production validation and client acceptance builds.
  - `PRODUCTION` — Field-ready stable customer releases.
- 🔒 **Integrity & Validation:** Server-side APK header validation (`PK\x03\x04` ZIP archive magic bytes) and automatic **SHA-256** checksum generation. Prevents corrupt files and accidental duplicate versions (`version` + `versionCode`).
- 📲 **Direct Mobile Install via QR Code:** Interactive QR code generator for any release. Testers and developers can scan the QR code with their Android device's camera to trigger an immediate, authenticated download.
- 🔑 **Cryptographic API Tokens:** Generate scoped API tokens for CI/CD runners (`relixor_live_...`). Plaintext tokens are displayed **only once** upon creation; database stores only SHA-256 hashes. Supports app-specific scoping, permission levels (`READ`, `WRITE`, `ADMIN`), and expiration dates.
- 👥 **User Management & RBAC:** Multi-tenant access controls for `ADMIN`, `DEVELOPER`, and `VIEWER` roles.
- 📜 **Full Audit Logging:** Timestamped audit trail tracking logins, application creations, release uploads, downloads, deletions, and token revocations.
- 💾 **Storage Abstraction:** Pluggable `StorageProvider` interface with persistent atomic local disk storage and forward compatibility for S3/MinIO.

---

## 🛠 Tech Stack & Architecture

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons, QR Code SVG |
| **Backend** | Node.js (v20+), Express, TypeScript, Zod, Multer, Helmet, Rate Limiter |
| **Database** | PostgreSQL 17, Prisma ORM (with migrations) |
| **Storage Engine** | Atomic local filesystem storage (`StorageProvider` abstraction) |
| **Reverse Proxy** | Nginx (with 500MB client max body size, SPA routing, gzip) |
| **Containers** | Docker, Docker Compose (multi-stage builds) |

```
                +-------------------------------------------------+
                |                  Nginx Reverse Proxy            |
                |               (Port 80 / Port 8080)             |
                +-----------------------+-------------------------+
                                        |
                   +--------------------+--------------------+
                   |                                         |
            /api/* | /health                          /*     |
                   v                                         v
        +----------------------+                  +--------------------+
        |  Backend API Server  |                  |   Frontend (SPA)   |
        |  (Node.js / Express) |                  |  (React / Vite)    |
        +----------+-----------+                  +--------------------+
                   |
         +---------+---------+
         |                   |
         v                   v
+------------------+  +--------------------------------+
|  PostgreSQL 17   |  | Local Persistent APK Storage   |
|   (Prisma ORM)   |  |   (/app/storage/apks volume)   |
+------------------+  +--------------------------------+
```

---

## 🚀 Quick Start with Docker Compose

Deploy the complete stack (PostgreSQL, Backend API, Frontend SPA, and Nginx) with a single command:

### 1. Clone & Configure Environment

```bash
git clone https://github.com/your-org/relixor.git
cd relixor

# Create production environment file from template
cp .env.example .env
```

Review `.env` and configure your credentials. Defaults:
- Database: `POSTGRES_USER=relixor`, `POSTGRES_DB=relixor`
- Initial Admin: `admin@relixor.internal` / `AdminPassword123!`
- HTTP Port: `8080` (or `80`)

### 2. Start the Stack

```bash
docker compose up -d --build
```

### 3. Initialize Database & Demo Seed Data

```bash
docker compose exec backend npm run prisma:seed
```

### 4. Access Relixor

- Web Dashboard: [http://localhost:8080](http://localhost:8080) (or configured port)
- Health Check: [http://localhost:8080/health](http://localhost:8080/health)
- Default Admin Login:
  - **Email:** `admin@relixor.internal`
  - **Password:** `AdminPassword123!`

---

## 💻 Local Development Setup

### Prerequisites

- Node.js `v20.x` or higher
- npm `v10.x` or higher
- PostgreSQL running locally on port `5432`

### 1. Configure Backend

```bash
cd backend
cp .env.example .env # or update DATABASE_URL in backend/.env
npm install
npx prisma generate
npx prisma db push
npm run prisma:seed
```

### 2. Start Backend Development Server

```bash
npm run dev
# Backend API runs at http://localhost:5000
```

### 3. Configure and Start Frontend

In a separate terminal:

```bash
cd frontend
npm install
npm run dev
# Frontend dev server runs at http://localhost:3000
```

---

## 🔐 Role-Based Access Control (RBAC)

Relixor enforces strict role-based authorization both at the API middleware layer and on the web UI:

| Capability | ADMIN | DEVELOPER | VIEWER |
|---|:---:|:---:|:---:|
| View Dashboard & Metrics | ✅ | ✅ | ✅ |
| Browse & Search Applications | ✅ | ✅ | ✅ |
| Download APK Binaries | ✅ | ✅ | ✅ |
| View SHA-256 Checksums & Notes | ✅ | ✅ | ✅ |
| Create / Edit Applications | ✅ | ✅ | ❌ |
| Publish New APK Releases | ✅ | ✅ | ❌ |
| Delete APK Releases | ✅ | ✅ | ❌ |
| Create API Tokens (for self) | ✅ | ✅ | ❌ |
| Create ADMIN-scoped Tokens | ✅ | ❌ | ❌ |
| Delete Application Repositories | ✅ | ❌ | ❌ |
| Create / Edit / Deactivate Users | ✅ | ❌ | ❌ |
| View System Audit Logs | ✅ | ✅ (Apps) | ❌ |

---

## 🔄 CI/CD Integration Guide

Relixor is built from the ground up for automated releases from continuous integration pipelines.

### GitLab CI/CD

Add this job to your Android project's `.gitlab-ci.yml`.

#### 1. Setup GitLab CI Variables
In your GitLab Project, navigate to **Settings > CI/CD > Variables** and add:
- `APK_STORE_URL`: `https://apk.yourcompany.com` (Protected)
- `APK_STORE_TOKEN`: `relixor_live_...` (Masked, Protected)
- `APK_STORE_APP_ID`: `UUID-OF-YOUR-APP` (from the Relixor app page)
- `APP_VERSION`: e.g. `1.2.0` (or leave empty to use git tag)
- `APP_VERSION_CODE`: e.g. `120` (or leave empty to use `$CI_PIPELINE_IID`)

#### 2. Pipeline Configuration

```yaml
# .gitlab-ci.yml
stages:
  - build
  - publish

build_android_apk:
  stage: build
  image: eclipse-temurin:17-jdk-jammy
  script:
    - chmod +x ./gradlew
    - ./gradlew assembleRelease --no-daemon
  artifacts:
    paths:
      - app/build/outputs/apk/release/*.apk
    expire_in: 2 days

publish_to_relixor:
  stage: publish
  image: curlimages/curl:latest
  dependencies:
    - build_android_apk
  variables:
    RELEASE_CHANNEL: "STAGING" # DEV, QA, STAGING, or PRODUCTION
  script:
    - |
      set -euo pipefail
      APK_FILE=$(ls -1 app/build/outputs/apk/release/*.apk | head -n 1)
      VERSION="${APP_VERSION:-${CI_COMMIT_TAG:-1.0.${CI_PIPELINE_IID}}}"
      VERSION_CODE="${APP_VERSION_CODE:-${CI_PIPELINE_IID}}"

      echo "Publishing ${APK_FILE} (v${VERSION} #${VERSION_CODE}) to Relixor..."

      curl --fail-with-body \
        --show-error \
        --location \
        --request POST \
        --header "Authorization: Bearer ${APK_STORE_TOKEN}" \
        --form "file=@${APK_FILE}" \
        --form "version=${VERSION}" \
        --form "versionCode=${VERSION_CODE}" \
        --form "channel=${RELEASE_CHANNEL}" \
        --form "notes=Automated release from commit ${CI_COMMIT_SHORT_SHA} by ${GITLAB_USER_NAME}" \
        "${APK_STORE_URL}/api/v1/apps/${APK_STORE_APP_ID}/releases"

      echo "Release published successfully!"
  rules:
    - if: '$CI_COMMIT_BRANCH == "main"'
    - if: '$CI_COMMIT_TAG'
```

---

### GitHub Actions

Save in `.github/workflows/publish-release.yml`:

```yaml
name: Publish APK to Relixor

on:
  push:
    tags:
      - 'v*'

jobs:
  build-and-publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Java JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Build Android Release APK
        run: |
          chmod +x ./gradlew
          ./gradlew assembleRelease --no-daemon

      - name: Publish to Relixor
        env:
          APK_STORE_URL: ${{ secrets.APK_STORE_URL }}
          APK_STORE_TOKEN: ${{ secrets.APK_STORE_TOKEN }}
          APK_STORE_APP_ID: ${{ secrets.APK_STORE_APP_ID }}
        run: |
          APK_PATH=$(find app/build/outputs/apk/release -name "*.apk" | head -n 1)
          VERSION="${GITHUB_REF_NAME#v}"

          curl --fail-with-body --show-error --location \
            --request POST \
            --header "Authorization: Bearer ${APK_STORE_TOKEN}" \
            --form "file=@${APK_PATH}" \
            --form "version=${VERSION}" \
            --form "versionCode=${GITHUB_RUN_NUMBER}" \
            --form "channel=PRODUCTION" \
            --form "notes=Automated release via GitHub Actions run #${GITHUB_RUN_ID}" \
            "${APK_STORE_URL}/api/v1/apps/${APK_STORE_APP_ID}/releases"
```

---

### Jenkins Pipeline

Save in `Jenkinsfile`:

```groovy
pipeline {
    agent any
    environment {
        APK_STORE_URL    = credentials('relixor-url')
        APK_STORE_TOKEN  = credentials('relixor-api-token')
        APK_STORE_APP_ID = credentials('relixor-app-id')
        APP_VERSION      = "1.2.0"
    }
    stages {
        stage('Build') {
            steps {
                sh './gradlew assembleRelease --no-daemon'
            }
        }
        stage('Publish') {
            steps {
                sh '''
                    APK_FILE=$(find app/build/outputs/apk/release -name "*.apk" | head -n 1)
                    curl --fail-with-body --show-error --location \
                      --request POST \
                      --header "Authorization: Bearer ${APK_STORE_TOKEN}" \
                      --form "file=@${APK_FILE}" \
                      --form "version=${APP_VERSION}" \
                      --form "versionCode=${BUILD_NUMBER}" \
                      --form "channel=STAGING" \
                      --form "notes=Automated release from Jenkins build #${BUILD_NUMBER}" \
                      "${APK_STORE_URL}/api/v1/apps/${APK_STORE_APP_ID}/releases"
                '''
            }
        }
    }
}
```

---

### Direct cURL CLI

Publish directly from terminal or bash scripts:

```bash
curl --fail-with-body --show-error --location \
  --request POST \
  --header "Authorization: Bearer relixor_live_your_token_here" \
  --form "file=@./app-release.apk" \
  --form "version=1.0.0" \
  --form "versionCode=100" \
  --form "channel=PRODUCTION" \
  --form "notes=Initial stable release" \
  "http://localhost:8080/api/v1/apps/YOUR_APP_ID/releases"
```

---

## 📡 API Reference

All requests accept `Authorization: Bearer <TOKEN>` (either JWT session token or `relixor_live_...` API key) or `X-API-Key: relixor_live_...`.

### Applications

- `GET /api/v1/apps` — List authorized apps (supports `?search=term`)
- `POST /api/v1/apps` — Create app repository (`name`, `packageName`, `description`)
- `GET /api/v1/apps/:appId` — Retrieve app details and release counts
- `PUT /api/v1/apps/:appId` — Update app metadata
- `DELETE /api/v1/apps/:appId` — Delete app and all associated APK binaries

### Releases

- `POST /api/v1/apps/:appId/releases` — Upload a new APK release (`multipart/form-data`)
  - Form field `file`: APK file binary
  - Form field `version`: Version string (e.g. `1.2.0`)
  - Form field `versionCode`: Integer build code (e.g. `120`)
  - Form field `channel`: `DEV` | `QA` | `STAGING` | `PRODUCTION`
  - Form field `notes`: Markdown changelog
- `GET /api/v1/apps/:appId/releases` — List releases for app (supports `?channel=QA`)
- `GET /api/v1/apps/:appId/releases/:releaseId` — Get release metadata & SHA-256
- `GET /api/v1/apps/:appId/releases/:releaseId/download` — Authorized APK stream
- `DELETE /api/v1/apps/:appId/releases/:releaseId` — Delete release and binary

### API Tokens

- `GET /api/v1/tokens` — List tokens (Admin sees all; Developer sees own)
- `POST /api/v1/tokens` — Create scoped API token (`name`, `permission`, `appId`, `expiresInDays`)
- `PUT /api/v1/tokens/:tokenId/revoke` — Revoke token immediately
- `DELETE /api/v1/tokens/:tokenId` — Delete token record

### Users (Admin Only)

- `GET /api/v1/users` — List users
- `POST /api/v1/users` — Create user account (`email`, `name`, `password`, `role`)
- `PUT /api/v1/users/:userId` — Update user role, active status, or reset password
- `DELETE /api/v1/users/:userId` — Delete user account

### Statistics & Health

- `GET /api/v1/stats/dashboard` — Platform overview metrics
- `GET /api/v1/audit-logs` — Paginated audit records
- `GET /health` or `GET /api/v1/health` — Liveness & readiness health check

---

## 💾 Database & Storage Backup / Restore

Relixor stores structured metadata in PostgreSQL and APK binaries in persistent storage. Both are backed up atomically with checksum validation.

### Backup

Run the automated backup script:

```bash
./scripts/backup.sh
```

This creates a timestamped folder under `./backups/relixor_backup_YYYYMMDD_HHMMSS/` containing:
- `database.sql` — PostgreSQL database dump
- `artifacts.tar.gz` — Tarball of all stored APK binaries
- `SHA256SUMS` — Cryptographic checksum manifest

### Restore

To restore from a backup:

```bash
./scripts/restore.sh ./backups/relixor_backup_20261013_161237
```

The restore script:
1. Validates all files against `SHA256SUMS`.
2. Restores the database schema and records.
3. Unpacks APK binaries back into `./storage/apks`.

---

## 🛡 Production Security Hardening

When deploying Relixor in production environments:

1. **HTTPS & TLS Termination:** Always terminate HTTPS using Let's Encrypt / certbot or an enterprise reverse proxy (Traefik, Cloudflare, AWS ALB) in front of the Nginx container.
2. **Secret Keys:** Generate a cryptographically random `JWT_SECRET` with at least 32 characters:
   ```bash
   openssl rand -base64 32
   ```
3. **Never Store Plaintext Tokens:** Relixor stores only SHA-256 hashes of generated API tokens.
4. **Rate Limiting:** General API requests are limited to 1,000 req/15min; login attempts are restricted to 30 attempts/15min to prevent brute-force attacks.
5. **Private Artifact Downloads:** Downloading an APK requires valid authentication (Bearer token or temporary download query token). Unauthenticated requests are rejected with 401 Unauthorized.
6. **Isolated Docker Network:** PostgreSQL is only accessible inside the private `relixor_net` bridge network and not exposed to the public internet.

---

## 🔍 Troubleshooting

| Issue | Cause | Resolution |
|---|---|---|
| `413 Request Entity Too Large` | Nginx body limit exceeded | Ensure `client_max_body_size 500M;` is configured in `nginx/default.conf`. |
| `409 DUPLICATE_RELEASE` | A release with the same version and versionCode exists | Bump either `version` or `versionCode` in your build script before publishing. |
| `401 INVALID_TOKEN` | Token is invalid or has been revoked | Generate a new API token in the **API Tokens** tab and update your CI/CD variable. |
| `403 FORBIDDEN_APP_SCOPE` | Token is scoped to another app | Check that your token's app scope matches the target `appId` in the URL. |
| `400 INVALID_APK` | Uploaded file is not a valid ZIP/APK | Ensure the APK was built properly with Gradle and is not empty or corrupted. |

---

## 🧪 Verification & Test Commands

Run automated backend tests (covers authentication, role-based access control, token scoping, duplicate prevention, and APK binary publishing):

```bash
npm test
```

Build and test both frontend and backend bundles:

```bash
npm run build
```

Seed initial administrator and sample data:

```bash
./scripts/seed-admin.sh "admin@relixor.internal" "AdminPassword123!" "System Administrator"
```