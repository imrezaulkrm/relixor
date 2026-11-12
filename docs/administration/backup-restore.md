# Backup & Restore

A complete Relixor backup has **two independent parts**: PostgreSQL and the APK storage volume. Restoring only one produces a broken system (metadata without files, or files without history). Include `.env` and Compose configuration in a secure secrets backup.

## What to back up

| Item | Location | Method |
|---|---|---|
| Database | volume `relixor_pgdata` | `pg_dump` (logical) and/or volume snapshot |
| APKs | volume `relixor_storage` (`/app/storage/apks`) | filesystem archive/snapshot |
| Configuration | `.env`, Compose overrides, host nginx | encrypted secret store |
| Code/version | Git commit/tag | Git remote |
| Docs | repository `docs/` | Git |

Never put `.env` or dumps in Git, chat, tickets or public object storage.

## Backup commands

Create a consistent directory:

```bash
BACKUP_DIR=/srv/backups/relixor/$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
```

Database (custom format, compressed):

```bash
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  > "$BACKUP_DIR/relixor-db.dump"
```

Storage volume archive (uses a temporary helper container; read-only mount):

```bash
docker run --rm \
  -v relixor_storage:/data:ro \
  -v "$BACKUP_DIR":/backup \
  alpine tar czf /backup/relixor-apks.tar.gz -C /data .
```

Configuration (encrypted):

```bash
age -p -o "$BACKUP_DIR/env.age" .env   # or gpg --symmetric
```

Checksums and manifest:

```bash
sha256sum "$BACKUP_DIR"/* > "$BACKUP_DIR/SHA256SUMS"
ls -lh "$BACKUP_DIR"
```

> Volume names are Compose-prefixed in some setups. Verify with `docker volume ls | grep relixor`. Adjust `-v` names accordingly.

## Verify a backup

```bash
pg_restore --list "$BACKUP_DIR/relixor-db.dump" | head
tar tzf "$BACKUP_DIR/relixor-apks.tar.gz" | head
sha256sum -c "$BACKUP_DIR/SHA256SUMS"
```

A backup is not proven until a restore has been rehearsed in an **isolated** environment.

## Restore (isolated verification)

Use a separate Compose project and separate volumes. Never test restores over production.

```bash
# Example only: use a dedicated directory and project name.
export COMPOSE_PROJECT_NAME=relixor-restore
docker compose up -d postgres
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
  -c "DROP DATABASE IF EXISTS relixor_restore;"
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres \
  -c "CREATE DATABASE relixor_restore;"
cat relixor-db.dump | docker compose exec -T postgres \
  pg_restore -U "$POSTGRES_USER" -d relixor_restore --clean --if-exists
```

Storage restore into an isolated volume:

```bash
docker run --rm -v relixor_restore_storage:/data \
  -v "$BACKUP_DIR":/backup alpine \
  sh -c "cd /data && tar xzf /backup/relixor-apks.tar.gz"
```

Start the stack against the restored DB/storage, verify health, log in, download one APK, and compare its SHA-256 with the database value.

## Production restore (high risk)

1. Declare an incident/change window.
2. Stop backend and nginx to prevent writes.
3. Take a safety snapshot of the current volumes even if they are damaged.
4. Restore the database dump into a fresh database; do not overwrite blindly.
5. Restore APK storage into the volume.
6. Start backend, run `prisma migrate deploy`.
7. Verify health, login, release list, and one download checksum.
8. Re-enable access and monitor.

Data written after the backup is lost. Communicate the recovery point.

## Naming and retention

`relixor-YYYYMMDD-HHMMSS-{db.dump,apks.tar.gz,env.age,SHA256SUMS}`.

Suggested retention: 7 daily, 4 weekly, 12 monthly, plus pre-upgrade backups. Store at least one copy off-host/off-site, encrypted. Test restores quarterly.

## Disaster recovery checklist

- [ ] Incident owner and communication channel established
- [ ] Writes stopped
- [ ] Backups located and checksums verified
- [ ] Isolated restore validated
- [ ] Production restored
- [ ] Migrations applied
- [ ] Health/login/download verified
- [ ] Audit and logs preserved
- [ ] Post-incident review scheduled

## Related

- [Database](/docs/administration/database)
- [Upgrade & rollback](/docs/administration/upgrade-rollback)
- [Disaster recovery](/docs/maintenance/disaster-recovery)
