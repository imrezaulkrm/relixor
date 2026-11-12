# FAQ

**What is Relixor?**
A self-hosted private APK repository and release-management platform with approval workflows, a public download portal, QA evidence and CI integration.

**Does it replace Google Play?**
No. It distributes APKs privately/sideloaded. It does not sign apps, manage Play listings, or install remotely.

**Where do APKs live?**
On a local Docker volume (`relixor_storage` → `/app/storage/apks`), not in PostgreSQL. Back up both.

**Can I use S3?**
Not yet. The provider interface exists but only local storage is implemented.

**How do I create the first admin?**
Set `ADMIN_DEFAULT_*` in `.env`, start the stack, then `docker compose exec backend node dist/prisma/seed.js`.

**Why can't a developer publish?**
Publication requires approval. A developer cannot approve their own upload unless `ALLOW_SELF_APPROVAL=true`; an admin can always approve.

**Why is my app missing from `/portal`?**
Needs `isPublic` + `publicSlug` (ADMIN), and an approved, published **PRODUCTION** release.

**Why does a QR code expire?**
QR codes use short-lived single-use download tickets. They are not permanent links; regenerate as needed.

**Can I download with `?token=`?**
No. Query credentials are rejected. Use `Authorization`/`X-API-Key`, or a ticket for public/QR.

**Do password reset emails get sent?**
No email provider exists. An administrator generates a one-time token and delivers it securely.

**How do I revoke a stolen session?**
Profile → Sessions (own) or Users → user → Sessions (admin). Rotate `JWT_SECRET` only if compromise is broad.

**How do I free disk space?**
Retention policies with dry-run, then approved execution. Files are deleted and metadata archived. Production/pinned releases are protected.

**How do I update the platform?**
Back up, pull the new version, `docker compose up -d --build`; migrations run automatically. See upgrade guide.

**Is there a mobile app?**
No client is included. The update API and Android integration guide support building one.

**Is there an open-source license?**
No license has been selected in this repository. Do not redistribute without permission.

**How do I report a security issue?**
Follow [SECURITY.md](/docs/security/index) in the repository; do not open a public issue with exploit details.
