# Administrator Manual

This is the day-to-day operating guide for `ADMIN` users. It assumes the stack is installed and healthy.

## First week

1. **Change the admin password** (Profile). Confirm the seed account is the only admin you expect.
2. **Create named users** (Users → New User). Give each the least global role that works.
3. **Create projects and apps**; register real package names.
4. **Assign memberships** at project level where possible; use app-level for exceptions.
5. **Set publication** only for apps that should be publicly downloadable.
6. **Create CI tokens** scoped to one app with WRITE; store them in GitLab masked/protected variables.
7. **Take a backup** before the first real upload.
8. **Decide retention** but leave deletion disabled until a dry-run and backup are reviewed.

## User administration

- Create/deactivate/delete users; set global roles.
- Reset passwords (single-use token, no email).
- Inspect sessions and activity; revoke all sessions for a compromised account.
- Membership changes require an interactive admin session (API tokens are rejected).
- You cannot escalate a DEVELOPER into an ADMIN by project membership; membership roles are only DEVELOPER/VIEWER.

## Project and app administration

- Projects: create/edit/delete; deletion requires zero apps and `default-project` is protected.
- Apps: create; edit metadata; delete only as ADMIN (destructive: deletes releases and APK files).
- Publication: set `isPublic` and a unique `publicSlug`; requires a qualifying production release.
- Moving an app between projects is not supported.

## Release administration

- Review pending approvals; reject with a reason when evidence is missing.
- Approve releases you did not upload; self-approval by developers is disabled by default.
- Publish only APPROVED releases. Production publication deprecates the previous release.
- Pin releases that must survive retention; production releases are already protected.
- Use rollback only when the target release's APK still exists.
- Never “fix” a release by editing the database; upload a new build.

## API tokens

- **Tokens → New token**: name, permission (`READ`/`WRITE`/`ADMIN`), optional app scope, expiry (1–365 days).
- Plaintext is shown once; only a hash is stored. Copy immediately into the CI secret store.
- Prefer app-scoped WRITE tokens with expiry for CI. Avoid ADMIN tokens for automation.
- Revoke on rotation or suspicion; deletion removes the record.
- Tokens cannot manage tokens, memberships or account security.

## Audit log

**Audit Logs** (ADMIN) supports action/entity/user filters and pagination. Review at least:

- `AUTH_LOGIN_FAILED` spikes,
- `USER_*`, `PROJECT_*`, `APP_DELETE`,
- `RELEASE_*` lifecycle changes,
- `TOKEN_*` create/revoke,
- `RETENTION_*`,
- `DOWNLOAD_*` for public artifacts.

Audit records are append-only from the application's perspective. Export/inspect before retention changes if you need long-term evidence.

## Storage and retention

- Monitor SQL: `SELECT pg_size_pretty(pg_database_size(current_database()));`
- Monitor volume: `docker system df -v` and `df -h`.
- Retention policies are per channel; PRODUCTION cannot be configured for deletion.
- Preview first. Execution requires `RETENTION_ALLOW_DELETE=true` and archives metadata after deleting files.
- Scheduler is off by default (`RETENTION_SCHEDULE_ENABLED=false`).

## System health and maintenance

- `GET /health` must return 200 with database and storage ready.
- Check container status and restart counts weekly.
- Back up database + APK volume before upgrades; never run `prisma migrate reset`.
- See [Maintenance checklist](/docs/maintenance/maintenance-checklist).

## Incident quick actions

| Incident | Action |
|---|---|
| Lost admin device | Revoke that user's sessions; reset password |
| Leaked API token | Revoke token; inspect audit/downloads |
| Leaked JWT secret | Rotate `JWT_SECRET`, recreate backend, force re-login |
| Suspicious upload | Delete release (if not protected), preserve audit, investigate source |
| Database down | Stop writes, restore from backup if corrupt; see database guide |
| Disk full | Free space via approved retention/backups; never delete volumes blindly |

## Related

- [User management](/docs/user-guide/user-management)
- [Retention](/docs/administration/retention)
- [Backup & restore](/docs/administration/backup-restore)
- [Troubleshooting](/docs/troubleshooting/index)
