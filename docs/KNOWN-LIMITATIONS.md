# Known Limitations

These are current product limitations, not bugs hidden in the docs. Each lists impact and a workaround where one exists.

## Distribution and Android

- **No silent install.** Android requires user consent; Relixor cannot install APKs remotely.
- **No Play Store integration**, signing, or listing management.
- **No APK signature verification or malware scanning.** Only ZIP magic bytes + SHA-256. Scan in CI.
- **Public portal is download-only**; no accounts, ratings, or per-user entitlements.

## Security and identity

- **No MFA/SSO/OIDC.** Compensate with network restriction and strong passwords.
- **No email delivery.** Password resets are admin-issued and handed over out-of-band.
- **No self-service registration.**
- JWT is held in `localStorage`; XSS on the origin could read it. No CSP is shipped.
- Legacy tokens without session claims remain accepted until expiry.
- No database-level audit immutability; DB operators can alter rows.
- Rate limiting is in-process/IP-based; behind a misconfigured proxy all clients may share an IP.

## Storage and scale

- **Local disk only.** S3/MinIO env vars are placeholders; no S3 provider is implemented.
- Single-node architecture; no horizontal scaling, HA, replication or zero-downtime deploy.
- APK storage and PostgreSQL must be backed up separately.
- No built-in WAL archiving/PITR; RPO depends on backup frequency.

## Workflow

- No automatic channel promotion or scheduled releases.
- No release approval notifications/email/Slack.
- App cannot be moved between projects.
- QA has no test-case management, attachments, or automated result ingestion; QA does not auto-block publication.
- Retention archives metadata rather than purging rows; no automated audit pruning.
- Rollback requires the previous APK to still exist.

## UI and accessibility

- No browser E2E suite; responsive and accessibility behaviour is unverified.
- Some operational tasks (memberships, sessions, retention) are admin-only and UI-driven; API tokens intentionally cannot perform them.
- Docs portal renders Mermaid diagrams as source code blocks (no client-side Mermaid renderer).

## Operations

- No Kubernetes/Helm, no published container images, no built-in monitoring/alerting.
- TLS/certbot is a documented host integration, not shipped in Compose.
- Scheduler runs inside the API process; restarts interrupt timing.
- Docker Compose deployment was not built/run during the documentation pass.

## Documentation

- Screenshots were not generated. Diagrams are Mermaid sources/ASCII.
- Commands were checked against repository files, but destructive/production examples remain unexecuted by design.

## Related

- [Project status](/docs/PROJECT-STATUS)
- [Production readiness](/docs/maintenance/production-readiness)
