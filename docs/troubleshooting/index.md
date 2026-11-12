# Troubleshooting

Start with the three facts every diagnosis needs: container status, backend logs, and `/health`. Never paste `.env` contents, tokens or passwords into a ticket.

```bash
docker compose ps
docker compose logs --tail=200 backend
curl -i http://localhost:8080/health
```

## Containers and Compose

### Docker daemon not running

**Symptoms:** `Cannot connect to the Docker daemon`.
**Diagnose:** `systemctl status docker`; `docker info`.
**Fix:** `sudo systemctl enable --now docker`; check disk/inodes; inspect `journalctl -u docker`.
**Verify:** `docker run --rm hello-world`.

### Compose variable error

**Symptoms:** `POSTGRES_USER is required` / `JWT_SECRET is required`.
**Cause:** missing `.env` or running Compose outside the repo root.
**Fix:** `cp .env.example .env`, fill required values, run from the directory containing `docker-compose.yml`.
**Verify:** `docker compose config` (review without printing secrets to others).

### Port already in use

**Symptoms:** `bind: address already in use`.
**Diagnose:** `sudo ss -ltnp | grep -E ':8080|:5434'`.
**Fix:** stop the conflicting service or set `HTTP_PORT`/`POSTGRES_PORT` to free ports; update `CORS_ORIGIN` if the public port changes.

### Container restart loop

**Diagnose:** `docker compose ps`; `docker compose logs --tail=300 backend`.
Common causes: migration failure, invalid production env, unwritable storage, database unavailable.
**Do not** delete volumes. Fix the logged cause.

## Database

### Connection refused / P1001

**Diagnose:** `docker compose exec postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"`; `docker compose logs postgres`.
**Fix:** ensure postgres healthy, DSN host is `postgres` inside the network, password matches. If credentials changed, update the role and DSN.

### P1000 authentication failed

The DSN password likely contains unescaped special characters or no longer matches. Use a URL-safe password or percent-encode it. Verify inside the backend container:

```bash
docker compose exec backend printenv DATABASE_URL | sed 's#://[^:]*:[^@]*@#://***:***@#'
```

(Do not share the unredacted output.)

### Migration failure

Read the exact SQL and error. Do not retry repeatedly or run reset. If partially applied, restore the pre-upgrade backup in isolation, fix forward, and redeploy. Check `npx prisma migrate status`.

### Database disk full

**Diagnose:** `df -h`, `docker system df`.
Free space by archiving old backups or pruning unused images (not volumes), then retry. Do not delete `relixor_pgdata`.

## HTTP and proxy

### 502 Bad Gateway

**Cause:** nginx cannot reach backend/frontend.
**Diagnose:** `docker compose ps`; `docker compose logs nginx backend`; `docker compose exec nginx wget -qO- http://backend:5000/health`.
**Fix:** start unhealthy services; fix backend crash; ensure upstream names unchanged.

### Health 503

The payload names the failing check. Database error → DB section. Storage error → permissions/volume. If the backend is down, nginx returns 502, not 503.

### CORS error

**Symptom:** browser blocks API calls; backend logs origin rejected.
**Fix:** set `CORS_ORIGIN` to the exact scheme/host/port, comma-separate multiple, no wildcard in production, no trailing slash. Recreate backend. Test with `curl -H "Origin: https://your-origin" -i .../health`.

### SPA route 404 (/docs, /portal, /login)

The frontend nginx must use `try_files $uri $uri/ /index.html`. The shipped `frontend/nginx.conf` does. If you replaced it or front it with another proxy, add the fallback.

### HTTPS certificate issues

**Diagnose:** `sudo certbot certificates`; `curl -Iv https://host`; `sudo nginx -t`.
**Fix:** renew (`sudo certbot renew`), open port 80 for HTTP-01, correct DNS, reload nginx. Do not disable TLS verification as a “fix”.

## Authentication and access

### Login fails

- Confirm email case/typo; account active.
- Check `AUTH_LOGIN_FAILED` audit reason (`unknown_account`, `inactive`, `invalid_password`).
- If the admin password is unknown, another admin must issue a reset; if no admin exists, use the seed only if the account is absent (it does not reset existing users).
- Rate limited? Wait 15 minutes or use another IP.

### 401 immediately after login

Clock skew, expired JWT, revoked session, or `JWT_SECRET` changed. Sign in again; check backend logs and container time.

### 403 on a resource

Check global role, project/app membership, and token app scope/permission. VIEWER cannot write. Admin routes reject API tokens.

### Password reset token invalid

Expired (60 min), already used, or copied incorrectly. Issue a new one. There is no email resend.

## Uploads and downloads

### 413 Request Entity Too Large

Raise `MAX_FILE_SIZE_MB` (backend) **and** nginx `client_max_body_size`, then rebuild/recreate. Confirm proxy timeouts for slow uploads.

### `INVALID_APK_FILE`

The file is not a ZIP/APK or is truncated. Rebuild and verify locally with `unzip -l file.apk`.

### `CHECKSUM_MISMATCH`

The declared hash differs from the received bytes. Recompute with `sha256sum`; check transfer/proxy transforms. Never remove the checksum to “make it work”.

### Duplicate release

`(version, versionCode)` already exists for the app. Bump versionCode. Deleting the old release may be blocked if protected.

### Download 410 / ticket errors

Ticket expired or already used. Request a new one. Public downloads require a qualifying PRODUCTION/PUBLISHED release; internal channels return 409.

### QR download fails

QR only works for publicly downloadable production releases. Otherwise use the authenticated download.

### Storage permission denied

**Diagnose:** `docker compose exec backend sh -c 'id; ls -ld /app/storage/apks; touch /app/storage/apks/.probe && rm /app/storage/apks/.probe'`.
**Fix:** ensure the volume is writable by the container user; do not chmod 777 on the host. Recreate the volume only if empty and you accept data loss.

## GitLab CI

- 401 → token wrong/revoked; update the masked variable.
- 403 scope/permission → use WRITE and correct `appId`.
- 409 → versionCode already uploaded; bump it.
- curl timeout → large file/proxy; check nginx 300s timeouts and runner egress.
- Never print the token; rotate if exposed.

## Disk and performance

- `docker system df -v`, `df -h`, `du -sh /var/lib/docker/volumes/*`.
- Prune dangling images/build cache, not data volumes: `docker image prune -f`.
- Large audit/status tables → investigate growth, archive per policy (no built-in audit pruning).
- Slow UI → check `/health`, backend CPU/memory, database size, network.

## Escalation

Collect: timestamps (UTC), affected user/action, HTTP status + error code, container status, redacted log lines, and whether it reproduces. **Redact** Authorization headers, API keys, DSNs, cookies and personal data. Escalate to the platform owner; for security incidents follow [Security](/docs/security/index).

## Related

- [Installation](/docs/installation/quick-install)
- [Database](/docs/administration/database)
- [Backup & restore](/docs/administration/backup-restore)
