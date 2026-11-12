# Security Policy

## Supported versions

Security fixes are applied to the current `main` line (v1.x). There is no long-term-support branch.

## Reporting a vulnerability

**Do not open a public issue, discussion or pull request containing exploit details, credentials or user data.**

Report privately to the repository owner/maintainer through the private channel used for this project (for example the organisation's security contact or a private GitLab/GitHub security advisory). Include:

- affected version/commit,
- a description of the issue and impact,
- reproduction steps or a minimal proof of concept,
- affected endpoints/components,
- any suggested mitigation.

You will receive an acknowledgement when the report is triaged. Please allow time for a fix before disclosure.

## Scope

In scope: authentication/session handling, authorization and tenant isolation, API tokens, download tickets, upload validation, audit integrity, retention safeguards, secret handling, and deployment configuration in this repository.

Out of scope: vulnerabilities requiring a compromised host or database administrator, social engineering, denial of service through resource exhaustion beyond documented limits, and issues in third-party images/dependencies that are already publicly known (report upstream, but tell us if Relixor's usage amplifies impact).

## Operational security expectations

- Deploy behind TLS; never expose PostgreSQL or the backend port publicly.
- Use unique, strong secrets; rotate after suspected exposure.
- Keep `RETENTION_ALLOW_DELETE=false` until backups and dry-runs are verified.
- Restrict `/docs` at the proxy if operational details should not be public.
- Review audit logs and revoke stale sessions/tokens.

See the [Security Guide](docs/security/index.md) for implemented controls, gaps and incident response.
