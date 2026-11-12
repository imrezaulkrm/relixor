# Security Checklist

## Deployment

- [ ] TLS everywhere; HTTP redirects; certificate renewal tested.
- [ ] Firewall allows only 22/80/443; DB and backend ports closed.
- [ ] `CORS_ORIGIN` exact, no wildcard.
- [ ] `.env` mode 600, outside Git; secrets unique per environment.
- [ ] `JWT_SECRET` ≥32 random characters; admin password strong.
- [ ] Seed demo data disabled.
- [ ] `/docs` access decision documented (public or proxy-restricted).
- [ ] Security headers verified (`curl -I`).

## Identity

- [ ] Named admin accounts; no shared credentials.
- [ ] Least-privilege global roles.
- [ ] Memberships reviewed; leavers removed/deactivated.
- [ ] Password reset tokens delivered out-of-band, never logged.
- [ ] Sessions reviewed; stale sessions revoked.
- [ ] MFA/SSO gap accepted or compensated by network controls.

## Tokens and CI

- [ ] CI tokens app-scoped, WRITE (not ADMIN), expiring.
- [ ] Tokens masked/protected in GitLab; never in YAML/URLs.
- [ ] Rotation schedule and owner.
- [ ] Unused/expired tokens revoked.

## Artifacts

- [ ] Upload restricted to trusted roles.
- [ ] APKs signed and scanned in CI before upload.
- [ ] SHA-256 verified by consumers.
- [ ] Public apps reviewed; only intended releases exposed.
- [ ] Retention deletion disabled or formally approved; backups verified.

## Data and operations

- [ ] Encrypted, off-host backups; restore rehearsed.
- [ ] Audit review cadence and retention policy.
- [ ] Monitoring/alerts for failed logins, 5xx, disk, restarts.
- [ ] Incident response contacts and runbook known.
- [ ] Host/Docker/images patched.
