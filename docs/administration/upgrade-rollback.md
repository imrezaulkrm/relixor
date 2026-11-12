# Upgrade & Rollback

## Before you start

- Read the [CHANGELOG](/docs/CHANGELOG) and new migrations.
- Confirm the current version/commit: `git log -1 --oneline`, `git describe --tags --always`.
- Check uncommitted changes: `git status`. Do not deploy a dirty tree you cannot reproduce.
- Back up database and APK storage; verify the backup.
- Announce downtime; single-node restarts briefly interrupt service.

## Upgrade procedure

```bash
cd /opt/relixor
git fetch --all --tags
git status                     # must be clean or intentionally reviewed
git checkout <tag-or-commit>
docker compose build
docker compose up -d
docker compose logs -f backend
```

The backend runs `prisma migrate deploy` on startup. Watch for migration errors and config validation. Then verify:

```bash
curl -fsS https://relixor.example.com/health
docker compose ps
```

Functional checks: log in, open a release, download and compare SHA-256, upload a small test APK (or use a staging environment), confirm tokens still work.

## Frontend/backend compatibility

The frontend is built into its own nginx image and calls `/api/v1`. Deploy both images from the same commit. A cached browser bundle can outlive the API; hard-refresh if behaviour looks inconsistent. There is no version negotiation or feature flag layer.

## Database compatibility

Migrations are forward-only. Some may add non-null columns or transform data; rolling back the **application** after such a migration can break it. Before upgrading, read the SQL in `backend/prisma/migrations/<new>/migration.sql` and classify:

- **Additive** (new tables/columns/enums): usually safe to run the old app temporarily.
- **Destructive/renaming/backfill**: old code may fail; rollback requires restoring the pre-upgrade database backup.

Never assume a code rollback is sufficient.

## Rollback strategy

### Application rollback (no incompatible migration)

```bash
git checkout <previous-tag>
docker compose build
docker compose up -d
curl -fsS https://relixor.example.com/health
```

### Full rollback (incompatible migration or corrupt state)

1. Stop backend/nginx.
2. Preserve current logs and a snapshot for investigation.
3. Restore the pre-upgrade database dump and APK volume.
4. Check out the previous version.
5. Start the stack and verify.

This loses writes made after the backup. Get approval before restoring.

### Image-only rollback

If you tag images per release, retag the previous images and `docker compose up -d`. The repository does not publish images; build/tag them yourself if you need this.

## Recovering from a failed deployment

| Symptom | Likely cause | Action |
|---|---|---|
| Backend restart loop | migration failure or env validation | Read logs; fix env or restore backup |
| 502 from host proxy | backend/frontend not healthy | `docker compose ps`, logs |
| Login fails after upgrade | JWT secret changed | Use prior secret or accept re-login |
| New UI calls missing API | mixed versions | Rebuild both from same commit |
| Migrations “up to date” but tables missing | wrong DATABASE_URL | Check container env, not host `.env` |
| Disk full during build | old images/volumes | Prune unused images safely; do not delete data volumes |

## Post-upgrade

- Confirm backups run on the new version.
- Re-check retention settings and scheduler flags.
- Review audit for unexpected access.
- Update documentation/version notes.

## Related

- [Backup & restore](/docs/administration/backup-restore)
- [Database](/docs/administration/database)
- [Release checklist](/docs/maintenance/release-checklist)
