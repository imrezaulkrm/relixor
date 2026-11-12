# Relixor Documentation

Relixor is a self-hosted private Android APK repository and release-management platform. It stores builds, enforces an approval workflow, exposes a controlled public download portal, and integrates with CI/CD so Android teams can ship without a third-party artifact service.

> **Scope of this documentation.** Everything here describes the current repository (v1.0, November 2026). Features marked **NOT IMPLEMENTED** or **NOT TESTED** are listed explicitly in [Known Limitations](/docs/KNOWN-LIMITATIONS) and [Project Status](/docs/PROJECT-STATUS).

## Start here

| Audience | Path |
|---|---|
| New evaluator | [Introduction & Quick Start](/docs/getting-started/introduction) |
| System administrator | [Installation on Ubuntu](/docs/installation/quick-install) → [Production Deployment](/docs/deployment/production) |
| Developer | [Developer Manual](/docs/user-guide/developer-manual) → [GitLab CI/CD](/docs/integrations/gitlab-ci) |
| QA engineer | [QA Manual](/docs/user-guide/qa-manual) |
| API consumer | [API Reference](/docs/api/reference) → [Android Update API](/docs/integrations/android-update-api) |
| Operator on call | [Troubleshooting](/docs/troubleshooting/index) → [Backup & Restore](/docs/administration/backup-restore) |

## What Relixor does

- Organises applications inside **projects** with project- and app-level memberships.
- Stores APKs in five channels: **DEV, QA, STAGING, BETA, PRODUCTION**.
- Requires explicit **submit → approve → publish** for production-ready releases.
- Verifies uploads with ZIP/APK magic bytes and **SHA-256**; optionally requires a client-supplied checksum.
- Issues short-lived, single-use **download tickets** for public and QR downloads.
- Provides an **update-check API** for Android clients, including mandatory-update flags.
- Records **QA results**, exports CSV/PDF reports, and keeps an immutable **audit trail**.
- Applies **retention policies** that delete APK bytes but preserve release metadata.
- Supports revocable **user sessions**, administrator-issued password resets, and scoped **API tokens**.

## Documentation map

- **Getting Started** — product, architecture, requirements, install, first login.
- **Configuration** — every environment variable and its effect.
- **Architecture** — request flow, data model, authorization, upload/download, retention.
- **User Guide** — projects, releases, APKs, portal, QA, account security.
- **Role Manuals** — task-oriented guides for ADMIN, DEVELOPER, VIEWER and QA.
- **Administration** — database, retention, backups, upgrades.
- **Integrations** — GitLab CI and the Android update API.
- **API Reference** — actual routes and response envelopes.
- **Operations** — troubleshooting, development, testing, maintenance, security.

## Access to the documentation

The portal is served by the same frontend at `/docs`. It does **not** require an application login and contains no secrets, tokens, customer data or production endpoints. If your deployment must keep operational documentation private, restrict `/docs` at the reverse proxy; the SPA route itself has no authentication gate.

## Version and support

- Product version: **1.0.0**
- Documentation updated: **12 November 2026**
- No open-source license has been selected in the repository; do not redistribute without the owner's permission.
- Security reports: follow [SECURITY.md](https://github.com/) guidance in the repository root; do not open a public issue containing exploit details.
