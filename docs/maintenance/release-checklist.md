# Release Checklist

## Product release

- [ ] Version and changelog updated.
- [ ] All migrations reviewed; no destructive surprises.
- [ ] Backend and frontend built from the same commit.
- [ ] Backend suite passes (or documented subset with reason).
- [ ] Critical flows exercised in staging: login, upload, approve, publish, portal, QA export, retention preview, docs.
- [ ] Docs updated for changed behaviour/interfaces.
- [ ] `git diff --check` clean; no secrets/artifacts staged.
- [ ] Rollback plan and backups ready.
- [ ] Deployment authorized; maintenance window communicated.

## Deployment

- [ ] Database + storage backup verified.
- [ ] `docker compose build` succeeds.
- [ ] `docker compose up -d`; migrations applied.
- [ ] `/health` 200; logs clean.
- [ ] Login and one download checksum verified.
- [ ] Public portal and `/docs` load through the real proxy.
- [ ] CI upload succeeds with a scoped token.

## Post-deploy

- [ ] Monitor errors/latency for 24h.
- [ ] Confirm backups run on the new version.
- [ ] Revoke temporary access/tokens.
- [ ] Record version, time and operator.
