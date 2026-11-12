# Production Readiness

Status reflects the repository at v1.0 (12 Nov 2026). Evidence is limited to what was actually executed; see [Project Status](/docs/PROJECT-STATUS).

## Ready

| Area | Evidence |
|---|---|
| Backend feature set (Modules 03–12) | 13 suites / 155 tests passed on disposable PostgreSQL 17 |
| Auth/RBAC/IDOR | Automated tests across roles, memberships and token scopes |
| Release lifecycle | Approval, publish, promote, rollback, compare tests |
| Public portal/tickets | Visibility and replay tests |
| QA/PDF/CSV | Generation and injection-escaping tests |
| Retention safety | Disabled-by-default execution, protection tests |
| Session security | Revocation, reset-token atomicity tests |
| Builds | Backend tsc + seed; frontend tsc + Vite pass |
| Migrations | Fresh replay 7/7 applied; status up to date |
| Health | HTTP 200 with DB/storage checks |
| Documentation | A–Z docs portal, manifest and link validation |

## Required before production

- [ ] Complete a browser E2E pass of critical flows (login, upload, approve, publish, portal, docs).
- [ ] Build and smoke-test the actual Compose stack on a clean VM.
- [ ] Configure TLS, DNS, firewall and exact `CORS_ORIGIN`.
- [ ] Replace all seed secrets; create named admins.
- [ ] Configure encrypted off-host backups and rehearse restore.
- [ ] Decide retention; keep deletion disabled until approved.
- [ ] Configure log collection, uptime and disk alerts.
- [ ] Review [Known Limitations](/docs/KNOWN-LIMITATIONS) with stakeholders.

## Not production-ready without additional work

- Multi-node/horizontal scaling (local disk + single DB).
- S3/object storage.
- Email-based password reset/MFA/SSO.
- APK signature/malware verification.
- Zero-downtime deployment.

## Verdict

**Conditionally ready for a single-node private deployment** after the required checklist. Not verified for public internet exposure at scale without TLS, monitoring, backups and browser E2E.
