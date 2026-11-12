# Security Guide

This guide separates **implemented controls** (verifiable in the repository) from **operational recommendations** (deployment hardening you must apply).

## Implemented controls

| Area | Control |
|---|---|
| Passwords | bcrypt hashing (cost 10); minimum 8 chars on change/reset; no plaintext storage |
| Sessions | DB-backed session rows; JWT carries `sid` + `tokenVersion`; logout revokes one session; password change/reset/deactivation revoke sessions and bump `tokenVersion` |
| Query credentials | JWTs/API tokens in query strings are rejected |
| API tokens | `relixor_live_` prefix, 256-bit random, SHA-256 hash at rest, prefix shown for identification, expiry, revocation, last-used tracking, app scope, READ/WRITE/ADMIN permission |
| RBAC | Server-side role, token permission and project/app resource checks on every protected route; interactive-only guards for administration |
| IDOR | Resource access checks resolve membership; unauthorized resources return 403/404 rather than leaking data |
| Rate limits | Global 1000/15m; login/reset 30/15m; downloads 120/15m |
| Headers | Helmet with cross-origin resource policy; CORS allow-list; `trust proxy` for correct client IPs |
| Uploads | `.apk` extension + ZIP magic bytes; size limit; SHA-256; optional declared checksum; atomic storage write |
| Downloads | Authorization checked before streaming; public downloads use short-lived single-use tickets; 410 on replay; no storage path exposure |
| Publication | ADMIN-only `isPublic`/`publicSlug`; public queries require PRODUCTION+PUBLISHED+approved |
| Validation | Zod schemas for auth/user/token/release metadata; positive versionCode; channel allow-list; version character allow-list |
| Errors | Production error handler hides internal messages/stacks |
| Audit | Login success/failure, logout, user/project/app/release/token/retention/export events with actor/IP/UA |
| Secrets at startup | Production refuses weak/default `JWT_SECRET` (<32) or missing/short admin password; refuses wildcard CORS |
| Reset tokens | Admin-issued, 32-byte random, stored hashed, 60-minute expiry, atomic single-use |
| Retention | Deletion disabled by default; production/pinned/active protected; archives metadata |

## Authentication security

- JWT lifetime is `JWT_EXPIRES_IN` (default 7d). Shorten to hours/days for high-risk environments; the UI has no refresh-token flow, so users re-login.
- JWT is stored in `localStorage`, which is readable by any XSS on the origin. The app does not render untrusted HTML; keep it that way and enforce a strict CSP at the proxy.
- Rotating `JWT_SECRET` invalidates all JWTs immediately.
- Legacy tokens without `sid`/`tokenVersion` are accepted for compatibility; this means a stolen pre-upgrade token cannot be individually revoked until expiry. Rotate the secret after upgrading if that matters.
- API tokens are for machines. They cannot manage tokens, memberships, sessions, users or retention.

## Password reset

No email provider is implemented. An administrator generates a token and delivers it out-of-band. The plaintext appears once; logs contain only the action, not the token. Reset tokens expire in 60 minutes and are consumed atomically.

## Authorization model

- Global roles: ADMIN > DEVELOPER > VIEWER.
- Memberships: project (inherited by apps) or app-specific, DEVELOPER/VIEWER.
- ADMIN bypasses membership.
- API token permission is an additional ceiling; app-scoped tokens are bound to one app.
- UI hiding is not enforcement; tests exercise the API directly.

## Recommended deployment hardening

### TLS and proxy

- Terminate TLS at the host/load balancer; redirect HTTP→HTTPS; HSTS after confirming all subdomains.
- Set `CORS_ORIGIN` to the exact HTTPS origin.
- Add CSP, `X-Content-Type-Options`, `Referrer-Policy` at the proxy if not fully covered by Helmet.
- Restrict `/docs` at the proxy if operational docs should not be public.

### Network

- Expose only 80/443; bind nginx to loopback when behind a host proxy.
- Never expose PostgreSQL (5434) or backend 5000.
- Restrict egress from the host where practical.
- Use a private network/VPN for administrative access.

### Secrets

- `.env` mode 600, owned by the deploy user; not in Git or backups in plaintext.
- Unique secrets per environment; rotate `JWT_SECRET`, DB password, admin password and CI tokens on a schedule.
- Do not reuse the seed admin password; create named admins.

### Database

- Strong password; restrict network access; encrypt disk.
- Backups encrypted at rest and in transit.
- Least-privilege DB role for the app (migrations need DDL; run them with the app role as designed, or split roles in a future change).
- Monitor failed connections and growth.

### Docker

- Run a supported Docker version; keep images updated (`node:20-alpine`, `postgres:17-alpine`, `nginx:alpine`).
- Do not mount the Docker socket into Relixor.
- Keep the host patched; restrict Docker group membership (it is root-equivalent).
- Use read-only mounts where possible at the host proxy layer.

### Storage

- Encrypt the volume/host disk; restrict filesystem permissions.
- Back up APKs with the database.
- Treat uploads as executable content; scan in CI before upload.
- Never serve the storage directory directly from nginx.

## Threat notes

| Threat | Mitigation |
|---|---|
| Stolen JWT | Revoke session; rotate secret if widespread |
| Stolen API token | Revoke token; inspect audit; rotate CI variable |
| Brute force | Auth rate limit, strong passwords, TLS, monitoring |
| IDOR | Resource checks + tests; do not rely on obscure IDs |
| Malicious APK | Out of scope: scan/sign in CI; restrict upload permission |
| XSS | React escaping, no raw HTML, CSP recommendation |
| SSRF | No user-supplied fetch URLs in the backend |
| Formula injection | CSV exports neutralise leading `= + - @` |
| Ticket replay | Single-use atomic consumption, short expiry |
| Disk exhaustion | Retention (approved), quotas/alerts, upload limit |

## Incident response

1. **Contain** — revoke sessions/tokens, disable the account, rotate secrets if needed.
2. **Preserve** — export audit logs, container logs, access logs; do not delete evidence.
3. **Assess** — which artifacts/users/data were accessed; check downloads and publication changes.
4. **Eradicate** — patch the cause, remove malicious releases, restore from a known-good backup if integrity is uncertain.
5. **Recover** — re-enable access with least privilege; verify health and checksums.
6. **Review** — document timeline, impact, and preventive actions.

Do not publish exploit details or secrets in issues/chat.

## Security checklist

See [Security checklist](/docs/maintenance/security-checklist).

## Known gaps

- No MFA/SSO.
- No email verification or self-service reset.
- No APK signature verification or malware scanning.
- No per-route CSRF tokens (JWT is sent via Authorization header, not cookies, which reduces CSRF exposure; XSS remains the primary token risk).
- No audit immutability at the database level (an operator with DB access can alter rows).
- No automatic account lockout beyond IP rate limiting.

## Related

- [User management](/docs/user-guide/user-management)
- [Production deployment](/docs/deployment/production)
- [Known limitations](/docs/KNOWN-LIMITATIONS)
