# Database & Migrations

## Stack

- PostgreSQL 17 (`postgres:17-alpine`), database `${POSTGRES_DB}`, user `${POSTGRES_USER}`.
- Prisma 5 ORM; schema at `backend/prisma/schema.prisma`; migrations at `backend/prisma/migrations/`.
- Container data volume: `relixor_pgdata`.
- The backend container runs `npx prisma migrate deploy && node dist/server.js` on every start.

At v1.0 there are **7 migrations**:

1. `20261013155100_init`
2. `20261112140000_add_project_management`
3. `20261112150000_add_rbac_memberships`
4. `20261112170000_release_lifecycle_platform`
5. `20261112180000_seed_beta_retention`
6. `20261112190000_download_tickets`
7. `20261112200000_sessions_password_resets`

Migration 5 is separate because PostgreSQL cannot use a newly added enum value in the transaction that added it. Do not squash migrations on a deployed system.

## Health checks

```bash
docker compose exec postgres pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"
docker compose exec backend npx prisma migrate status
curl -fsS http://localhost:8080/health
```

Expected: accepting connections, “Database schema is up to date!”, health 200 with `database: connected`.

## Apply migrations

Normal deployment:

```bash
docker compose up -d --build
docker compose logs -f backend   # watch migrate deploy
```

Manual (container):

```bash
docker compose exec backend npx prisma migrate deploy
```

Host development, with a disposable/local database:

```bash
cd backend
DATABASE_URL='postgresql://...' npx prisma migrate deploy
```

**Never** run `prisma migrate reset`, `db push --force-reset`, or drop the database in production. Reset destroys data.

## Create a migration (development)

1. Edit `backend/prisma/schema.prisma`.
2. Ensure a disposable database is configured.
3. Run `npx prisma migrate dev --name <descriptive_name>`.
4. Review the generated SQL for destructive operations and locking.
5. Regenerate the client: `npx prisma generate`.
6. Run tests and builds.
7. Commit schema + migration together.

For enum additions that are used immediately in data changes, split into separate migrations (see the BETA retention example).

## Production migration procedure

1. Announce a maintenance window; stop uploads if schema changes are significant.
2. Back up PostgreSQL **and** verify the dump.
3. Back up the APK volume or confirm a recent snapshot.
4. Pull the new source/image.
5. Start the backend; `migrate deploy` runs once.
6. Watch logs for migration errors and startup validation failures.
7. Verify `/health`, login, one read and one upload/download.
8. Keep the previous image/source available for rollback.

## Failure recovery

| Failure | Action |
|---|---|
| Migration SQL error | Stop; do not retry blindly. Read the failing migration, restore backup if partially applied, fix forward in a new migration |
| Backend exits on config validation | Fix env (`JWT_SECRET` length, CORS, admin password); migrations may already have applied |
| `P1001` cannot reach DB | Check postgres health, DSN host/port, credentials |
| `P1000` auth failed | Fix password/DSN escaping; confirm role/database |
| Disk full | Free space safely, then retry; never delete the data volume |
| Migration drift | Compare `prisma migrate status` with `_prisma_migrations`; resolve in a copy first |

Prisma error codes: `P1000` authentication, `P1001` unreachable, `P1002` timeout, `P1003` database missing, `P2002` unique constraint, `P2025` record not found.

## Seed

```bash
docker compose exec backend node dist/prisma/seed.js
```

Creates the admin if absent. In production `SEED_DEMO_DATA=false` prevents demo data. Re-running is safe for the admin; it does not reset an existing password.

## Data preservation rules

- Release metadata, audit logs, status history and QA records persist across migrations.
- APK files live outside PostgreSQL; database backups do not include them.
- Deleting an app cascades to its releases and deletes stored APKs.
- Retention archives metadata and deletes bytes — by design.

## Capacity queries

```sql
SELECT pg_size_pretty(pg_database_size(current_database()));
SELECT relname, pg_size_pretty(pg_total_relation_size(relid))
FROM pg_catalog.pg_statio_user_tables ORDER BY pg_total_relation_size(relid) DESC LIMIT 10;
SELECT count(*) FROM releases;
SELECT count(*) FROM audit_logs;
```

Audit and status history grow with usage; monitor before they dominate disk.

## Related

- [Backup & restore](/docs/administration/backup-restore)
- [Upgrade & rollback](/docs/administration/upgrade-rollback)
- [Troubleshooting](/docs/troubleshooting/index)
