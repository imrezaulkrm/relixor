# Viewer Manual

You are a `VIEWER`: you can inspect and download artifacts you have access to, but cannot change anything.

## What you can do

- Sign in and view the dashboard scoped to your memberships.
- Browse accessible projects, apps and releases.
- Search/filter the release catalog within your scope.
- View release metadata, notes, checksums and QA results.
- Download APKs (header-authenticated).
- Update your profile, change your password, review sessions/activity.
- Create? **No** — token management requires ADMIN/DEVELOPER.

## What you cannot do

- Upload, edit, submit, approve, publish, promote, roll back or delete releases.
- Create/edit projects or apps.
- Record QA verifications (requires WRITE).
- Manage users, memberships, tokens, audit, retention or publication.
- Access apps outside your project/app memberships.

The UI hides most actions, but the backend enforces restrictions regardless of the UI.

## Download a build

1. Open the app → release.
2. Choose **Download**.
3. Verify SHA-256:

```bash
sha256sum downloaded.apk
```

Compare with the release page. If it differs, delete the file and report it — do not install.

## Access problems

- **Empty dashboard** — no membership; ask an admin for project/app access.
- **403 on a direct link** — your membership does not cover that resource.
- **404** — the resource is outside your scope or deleted; ask the owner.
- **Session expired** — sign in again; an admin may have revoked sessions.

## Security

Use TLS, do not share your password, and do not forward APK download links containing credentials (Relixor does not put credentials in URLs; tickets are single-use). Report suspicious builds to the release owner.

## Related

- [APK management](/docs/user-guide/apk-management)
- [Account security](/docs/user-guide/account-management)
