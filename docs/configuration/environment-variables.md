# Environment Variables Reference

Relixor reads configuration from the process environment. Docker Compose loads `.env` from the repository root; the backend additionally loads `backend/.env` in local development. **Never commit `.env`.** Template: [`.env.example`](/docs/configuration/environment-variables) in the repository root (safe placeholders only).

> Restart requirement: values are read once at process start. Changes require `docker compose up -d --force-recreate backend` (or a full `docker compose up -d --build`).

## Application and network

| Variable | Required | Default | Used by | Notes |
|---|---|---|---|---|
| `NODE_ENV` | yes | `development` (code) | backend | Compose sets `production`. Enables strict secret validation and hides internal errors. |
| `PORT` | no | `5000` | backend | Container-internal listen port. Compose hard-codes `5000`; change both Compose and nginx if you alter it. |
| `HTTP_PORT` | no | `8080` | compose | Host port published by nginx. |
| `APP_URL` | no | `http://localhost:8080` | documentation/ops | **Not consumed by backend or frontend code.** Used in examples and reverse-proxy config. |
| `POSTGRES_PORT` | no | `5434` | compose | Host port mapped to container 5432. Firewall this port; it is not needed by the app. |
| `CORS_ORIGIN` | yes in production | `http://localhost:3000,http://localhost` (code) | backend | Comma-separated exact browser origins. `*` is rejected in production. Trailing slash breaks matching. |
| `JWT_EXPIRES_IN` | no | `7d` | backend | JWT lifetime (jsonwebtoken duration string). Existing sessions remain listed until expiry/revocation. |

## Database

| Variable | Required | Default | Notes |
|---|---|---|---|
| `POSTGRES_USER` | yes | — | Compose fails to start without it. Used by postgres and the generated DSN. |
| `POSTGRES_PASSWORD` | yes | — | Use 24+ random characters. Must be URL-encoded if it contains `@ : / ? #`. |
| `POSTGRES_DB` | yes | — | Database name. |
| `DATABASE_URL` | yes (backend) | — | Prisma DSN. Compose constructs `postgresql://user:pass@postgres:5432/db?schema=public`; do not point the container at `localhost`. |

The named volume `relixor_pgdata` holds PostgreSQL data. The database is not initialised by hand: Prisma migrations run on backend start.

## Authentication and seeding

| Variable | Required | Default | Sensitivity | Notes |
|---|---|---|---|---|
| `JWT_SECRET` | yes in production | insecure development constant | **Critical** | Must be ≥32 characters in production; startup aborts otherwise. Rotating it invalidates all JWTs. |
| `ADMIN_DEFAULT_EMAIL` | yes | `admin@relixor.internal` | Low | Seed account email. |
| `ADMIN_DEFAULT_PASSWORD` | yes in production | none | **Critical** | ≥16 chars in production; seed refuses weak/default values for new admins. |
| `ADMIN_DEFAULT_NAME` | yes (Compose) | `System Administrator` | Low | Display name for the seed admin. |
| `SEED_DEMO_DATA` | no | `false` | Low | Compose passes it. In production the seed only creates demo users/apps when explicitly `true`. |
| `ALLOW_SELF_APPROVAL` | no | `false` | Medium | When `true`, a DEVELOPER may approve their own release. Admins can always approve. |
| `RETENTION_ALLOW_DELETE` | no | `false` | **High** | Enables real APK deletion. Keep `false` until backup + dry-run review. |
| `RETENTION_SCHEDULE_ENABLED` | no | `false` | High | Enables the periodic cleanup scheduler. |
| `RETENTION_INTERVAL_MINUTES` | no | `1440` | Medium | Scheduler interval; clamped to a minimum of 60 minutes. |

`JWT_EXPIRES_IN`, `ALLOW_SELF_APPROVAL` and the `RETENTION_*` variables are **not passed by the shipped `docker-compose.yml`**. Add them under `services.backend.environment` to use them in Docker; they work automatically in local development.

## Storage and uploads

| Variable | Required | Default | Notes |
|---|---|---|---|
| `STORAGE_PROVIDER` | no | `local` | Only `local` is implemented. `s3` is reserved and not functional. |
| `STORAGE_LOCAL_DIR` | no | `<cwd>/../storage/apks` (local), `/app/storage/apks` (Compose) | Must be writable by the backend. Backed by volume `relixor_storage`. |
| `MAX_FILE_SIZE_MB` | no | `500` | Multer upload limit. Nginx also allows 500 MB (`client_max_body_size 500M`); if you raise one, raise both. |

> The Compose backend explicitly sets `STORAGE_LOCAL_DIR=/app/storage/apks`; changing `.env` alone does not change the container path.

## S3 placeholders (NOT IMPLEMENTED)

`.env.example` lists `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`. **The backend does not read these and no S3 provider is implemented.** Do not plan a deployment around them.

## Frontend

The frontend has **no build-time environment variables**. `frontend/src/api/client.ts` always calls same-origin `/api/v1`. The dev server proxies `/api` to `http://localhost:5000` (see `frontend/vite.config.ts`). In production nginx routes `/api/` to the backend. There is no `VITE_API_URL` and setting one has no effect.

## Docker Compose-only variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `HTTP_PORT` | no | `8080` | Published nginx port |
| `POSTGRES_PORT` | no | `5434` | Published postgres port |
| `POSTGRES_USER/PASSWORD/DB` | yes | — | Both database init and backend DSN |

## Nginx

The shipped `nginx/default.conf` is static: upstreams `backend:5000` and `frontend:80`, 500 MB body limit, 300s proxy timeouts, gzip, `/api/` and `/health` proxied, `/` to the SPA. No environment substitution is used. Relay TLS and domain configuration live in a **host** proxy (see [Production Deployment](/docs/deployment/production)).

## Changing configuration safely

1. Back up `.env` to a password manager — never to Git.
2. Edit `.env` with `chmod 600`.
3. Recreate affected containers: `docker compose up -d --force-recreate backend`.
4. Verify `/health` and log in.
5. Changing `JWT_SECRET` logs everyone out. Changing database credentials requires updating both the Postgres role and the DSN.

## Secret hygiene

- Generate with `openssl rand -base64 32`; avoid characters that break DSN parsing for the Postgres password.
- Never paste real secrets into documentation, tickets, screenshots, CI YAML or chat.
- Rotate `JWT_SECRET`, API tokens and the admin password after any suspected exposure.
- `ADMIN_DEFAULT_PASSWORD` is only used when creating a new admin; it does not reset an existing account.

## Related

- [Installation](/docs/installation/quick-install)
- [Security](/docs/security/index)
- [Troubleshooting](/docs/troubleshooting/index)
