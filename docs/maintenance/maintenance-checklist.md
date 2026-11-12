# Maintenance Checklist

## Daily

- [ ] `GET /health` returns 200 with database/storage ready.
- [ ] `docker compose ps` — all services up, no restart loop.
- [ ] Disk headroom above 20% on the Docker volume and APK storage.
- [ ] Review `AUTH_LOGIN_FAILED` and high-severity audit events.
- [ ] Check pending releases/approvals that block teams.
- [ ] Confirm last night's backup completed and is non-zero.

## Weekly

- [ ] Verify a backup checksum and copy it off-host.
- [ ] Review container restarts and error logs.
- [ ] Review API tokens: unused, expired, over-privileged.
- [ ] Review user list and memberships; remove leavers.
- [ ] Check TLS certificate expiry (>30 days).
- [ ] Check database and audit growth trends.

## Monthly

- [ ] Restore a backup into an isolated environment and validate login/download.
- [ ] Apply host OS and Docker updates in a window (backup first).
- [ ] Review dependency advisories for Node, React, Prisma, nginx, Postgres.
- [ ] Rotate CI tokens nearing expiry; test the pipeline.
- [ ] Inspect retention policies without enabling deletion unless approved.
- [ ] Export audit evidence if required by policy.

## Quarterly

- [ ] Access recertification (admins, developers, app scopes).
- [ ] Rotate `JWT_SECRET` (forces re-login) and database password with a change window.
- [ ] Disaster-recovery rehearsal and RPO/RTO validation.
- [ ] Review [security checklist](/docs/maintenance/security-checklist).
- [ ] Review documentation accuracy against the deployed version.

## Never

- `docker compose down -v`, deleting `relixor_pgdata`/`relixor_storage`, `prisma migrate reset`, or editing applied migrations on production.
- Sharing `.env`, tokens, dumps or unredacted logs.
