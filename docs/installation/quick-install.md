# Installation on Ubuntu (Docker Compose)

**Purpose:** install Relixor on a fresh Ubuntu 22.04/24.04 machine using the repository's Docker Compose stack.
**Prerequisites:** root or sudo access, outbound HTTPS, a DNS name (optional for first boot), 2 GB RAM minimum.
**Verified:** the Compose definition, Dockerfiles, nginx configuration and `/health` endpoint are part of the repository and were exercised locally. A full fresh-VM Compose build is **NOT TESTED** in this documentation pass.

## 1. Prepare the host

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg git ufw
```

Set the timezone and confirm resources:

```bash
timedatectl set-timezone UTC
nproc && free -h && df -h /
```

Expected: at least 2 CPUs, 2 GB RAM and enough free space for APKs.

## 2. Install Docker Engine and Compose

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Verify:

```bash
docker --version
docker compose version
```

Expected: Docker 24+ and Compose v2. If `docker compose` is unknown, install `docker-compose-plugin`; do not use the legacy `docker-compose` binary.

Optional non-root access:

```bash
sudo usermod -aG docker "$USER"
# log out and back in
```

## 3. Clone the repository

```bash
sudo mkdir -p /opt/relixor
sudo chown "$USER":"$USER" /opt/relixor
git clone <your-repository-url> /opt/relixor
cd /opt/relixor
```

Expected: `docker-compose.yml`, `backend/`, `frontend/`, `nginx/`, `docs/`.

## 4. Create the environment file

```bash
cp .env.example .env
chmod 600 .env
```

Generate independent secrets:

```bash
openssl rand -base64 32   # JWT_SECRET
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -base64 24   # ADMIN_DEFAULT_PASSWORD
```

Edit `.env` and set at minimum:

```dotenv
NODE_ENV=production
APP_URL=http://203.0.113.10:8080
HTTP_PORT=8080
POSTGRES_USER=relixor
POSTGRES_PASSWORD=<generated-postgres-password>
POSTGRES_DB=relixor
POSTGRES_PORT=5434
DATABASE_URL=postgresql://relixor:<generated-postgres-password>@postgres:5432/relixor?schema=public
JWT_SECRET=<generated-jwt-secret>
JWT_EXPIRES_IN=7d
CORS_ORIGIN=http://203.0.113.10:8080
STORAGE_PROVIDER=local
STORAGE_LOCAL_DIR=/app/storage/apks
MAX_FILE_SIZE_MB=500
ADMIN_DEFAULT_EMAIL=admin@example.com
ADMIN_DEFAULT_PASSWORD=<generated-admin-password>
ADMIN_DEFAULT_NAME=System Administrator
SEED_DEMO_DATA=false
```

> **Important:** Compose injects `DATABASE_URL`, `STORAGE_LOCAL_DIR` and `CORS_ORIGIN` explicitly. `DATABASE_URL` in `.env` is used by host-side Prisma commands; inside the backend container the hostname is `postgres`, not `localhost`. `APP_URL` is documentation-only; the backend does not consume it.

`CORS_ORIGIN` must be the exact browser origin, including scheme, host and non-default port. A trailing slash will not match. Never use `*` in production; the backend refuses to start.

Production startup also validates `JWT_SECRET` (≥32 chars) and `ADMIN_DEFAULT_PASSWORD` (≥16 chars), so weak values fail fast.

## 5. Build images

```bash
docker compose build
```

Expected: backend, frontend images built; nginx and postgres pulled.

Common failures:

- `npm ci` cannot reach the registry → configure a proxy or mirror.
- `tsc` errors → you are on modified source; run `npm --prefix backend run build` and `npm --prefix frontend run build` on the host to see details.
- ARM host pulls wrong architecture → use a multi-arch capable host or build natively.

## 6. Start the stack

```bash
docker compose up -d
docker compose ps
```

Expected services: `relixor-postgres` (healthy), `relixor-backend`, `relixor-frontend`, `relixor-nginx`. The backend command runs `npx prisma migrate deploy` before starting Node, so migrations are applied automatically. Check logs:

```bash
docker compose logs -f backend
```

Look for `Database connected`/`Server running` and no migration errors. Press Ctrl+C to stop following logs.

## 7. Create the first administrator

The backend image does **not** run the seed automatically. Run it once:

```bash
docker compose exec backend node dist/prisma/seed.js
```

Expected output includes `Created Administrator user: admin@example.com`. Re-running the seed is safe for the admin account; with `SEED_DEMO_DATA=false` in production it does not create demo apps.

> The seed reads `ADMIN_DEFAULT_PASSWORD` from the container environment, which Compose passes from `.env`. If you change `.env` after the stack is up, recreate the backend container (`docker compose up -d --force-recreate backend`) before seeding.

## 8. Verify

```bash
curl -fsS http://localhost:8080/health | jq .
```

Expected HTTP 200:

```json
{"status":"ok","uptimeSeconds":12,"timestamp":"...","checks":{"database":"connected","storage":"ready"}}
```

A 503 means the database or storage check failed; see [Troubleshooting](/docs/troubleshooting/index).

Verify the SPA and API:

```bash
curl -I http://localhost:8080/
curl -fsS http://localhost:8080/api/v1/health
```

## 9. Log in

Open `http://<server-ip>:8080`, sign in with `ADMIN_DEFAULT_EMAIL` / `ADMIN_DEFAULT_PASSWORD`, then immediately change the password under **Profile**. Changing the password revokes existing sessions.

## 10. Post-install hardening

1. Firewall: allow 22, 80 and 443 only. Do **not** expose `POSTGRES_PORT` (5434) publicly.
2. Put TLS in front of port 8080 — see [Production Deployment](/docs/deployment/production).
3. Set `CORS_ORIGIN` to the final HTTPS origin.
4. Take a database and storage backup before uploading real artifacts.
5. Create non-admin users; do not share the admin account.

## Verification checklist

- [ ] `docker compose ps` shows all services running; postgres healthy.
- [ ] `/health` returns 200 with database and storage ready.
- [ ] Login succeeds and the dashboard loads.
- [ ] A test APK uploads and its SHA-256 is displayed.
- [ ] Logout/login works and the session appears in Profile.
- [ ] `docker compose restart` preserves data and artifacts.

## Related

- [Environment variables](/docs/configuration/environment-variables)
- [Production deployment](/docs/deployment/production)
- [Backup & restore](/docs/administration/backup-restore)
