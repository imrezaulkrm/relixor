# Administration Guide

This section covers platform-wide operation. Product workflows live in the [User Guide](/docs/user-guide/admin-manual); here we cover the data, infrastructure and risk-bearing controls.

## Administrator responsibilities

- **Identity** — users, roles, memberships, sessions, password resets.
- **Artifacts** — projects/apps, release workflow, publication settings, storage health.
- **CI access** — scoped tokens, expiry, rotation.
- **Evidence** — QA reports, audit review.
- **Data** — migrations, backups, restore drills.
- **Capacity** — disk, database size, retention decisions.
- **Security** — TLS, secrets, firewall, least privilege, incident response.

## Control map

| Area | Where | Guide |
|---|---|---|
| Users and sessions | Users / Profile | [User management](/docs/user-guide/user-management) |
| Projects and apps | Projects / Apps | [Projects](/docs/user-guide/project-management) |
| Release approval | Releases | [Releases](/docs/user-guide/release-management) |
| API tokens | Tokens | [GitLab CI](/docs/integrations/gitlab-ci) |
| Audit | Audit Logs | [Security](/docs/security/index) |
| Retention | Retention | [Retention](/docs/administration/retention) |
| Database | Prisma / PostgreSQL | [Database](/docs/administration/database) |
| Backups | Volumes / pg_dump | [Backup & restore](/docs/administration/backup-restore) |
| Upgrades | Compose / migrations | [Upgrade & rollback](/docs/administration/upgrade-rollback) |
| Health | `/health`, logs | [Troubleshooting](/docs/troubleshooting/index) |

## Separation of duties

Relixor supports, but does not force, separation between uploader and approver (`ALLOW_SELF_APPROVAL=false` by default). Administrators can approve any release. In regulated environments:

- CI tokens upload only.
- Developers submit; a release manager approves.
- Only named administrators publish PRODUCTION and change publication settings.
- Retention execution requires a second human approval outside the app.
- Shared admin accounts are forbidden.

## Routine schedule

- **Daily** — health, failed-login spikes, disk headroom.
- **Weekly** — backup success, container restarts, pending approvals.
- **Monthly** — restore test, token/session review, dependency updates in a staging copy.
- **Quarterly** — access recertification, TLS/secret rotation, disaster-recovery rehearsal.

See [Maintenance checklist](/docs/maintenance/maintenance-checklist).

## Emergency contacts and evidence

Keep outside the repository: on-call owner, hosting provider, DNS registrar, certificate contact, backup location credentials. During an incident preserve logs and audit exports before changing state.

## Related

- [Production readiness](/docs/maintenance/production-readiness)
- [Disaster recovery](/docs/maintenance/disaster-recovery)
