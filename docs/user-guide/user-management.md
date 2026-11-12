# Users, Roles & Permissions

Relixor enforces authorization **server-side**. Hiding a button in the UI is not a security boundary; every route checks role, token permission and resource access.

## Global roles

| Role | Purpose |
|---|---|
| `ADMIN` | Full platform control: users, projects, apps, memberships, tokens, audit, retention, sessions, publication |
| `DEVELOPER` | Create apps, upload/edit releases, view accessible resources, manage own API tokens |
| `VIEWER` | Read-only access to accessible projects/apps; download releases |

## Membership roles

Project and app memberships are `DEVELOPER` or `VIEWER`:

- **Project membership** grants access to the project and **all apps inside it**.
- **App membership** grants access to one app only.
- Direct app membership does not grant access to sibling apps or project administration.
- Higher of inherited/direct role wins (a project DEVELOPER remains DEVELOPER on an app even if directly VIEWER).
- ADMIN bypasses membership checks.

## Permission matrix (backend-enforced)

| Capability | ADMIN | DEVELOPER | VIEWER | API token |
|---|---|---|---|---|
| View accessible projects/apps | all | member | member | owner's access + scope |
| Create project | ✅ | ❌ | ❌ | ❌ |
| Edit/delete project | ✅ | ❌ | ❌ | ❌ |
| Create app | ✅ | ✅ | ❌ | WRITE + owner access |
| Edit app | ✅ | ✅ (DEVELOPER access) | ❌ | WRITE + scope |
| Delete app | ✅ | ❌ | ❌ | ❌ |
| Upload release | ✅ | ✅ (DEVELOPER access) | ❌ | WRITE + app scope |
| Edit release metadata | ✅ | ✅ | ❌ | WRITE |
| Submit for approval | ✅ | ✅ | ❌ | WRITE |
| Approve/reject | ✅ | ✅ (not own upload unless allowed) | ❌ | WRITE* |
| Publish/deprecate/promote/rollback | ✅ | ✅ | ❌ | WRITE* |
| Delete release | ✅ | ✅ | ❌ | WRITE |
| Download release | ✅ | ✅ | ✅ | READ |
| Record QA verification | ✅ | ✅ | ✅? — **no**, write required | WRITE |
| View QA report | ✅ | ✅ | ✅ | READ |
| Manage memberships | ✅ | ❌ | ❌ | ❌ (interactive session only) |
| Manage users/sessions/reset | ✅ | ❌ | ❌ | ❌ |
| Issue/revoke API tokens | own/all as admin | own | own? — read-only role cannot create | ❌ |
| Retention policies/cleanup | ✅ | ❌ | ❌ | ❌ |
| Audit log | ✅ | ❌ | ❌ | ❌ |
| Publication settings | ✅ | ❌ | ❌ | ❌ |

\* CI tokens can call lifecycle endpoints only where route guards allow token auth; the intended CI action is upload + optional submit. Approval through a shared CI token undermines separation of duties and is not recommended.

> **Correction:** VIEWER cannot record QA verification (`requirePermission(WRITE)` denies), and VIEWER cannot create API tokens. Tokens cannot manage tokens or memberships.

## Create a user (ADMIN)

1. **Users → New User**.
2. Enter name, email, temporary password (≥8 characters), and global role.
3. Create. The user can sign in immediately; no email is sent.
4. Share the temporary password through a secure channel and ask the user to change it under **Profile**.

Deactivation (“active” off) blocks login and increments `tokenVersion`, invalidating existing sessions.

## Assign access

1. Open **Projects → project → Members** for project-level access.
2. Choose a user and role (`DEVELOPER` or `VIEWER`).
3. For one-off access, open **Apps → app → Members**.

Only ADMIN can manage memberships, and only through an interactive browser session — API tokens are rejected (`FORBIDDEN`).

## Change or remove access

- Change role via the member row's role control; this takes effect on the next request.
- Remove membership; the user immediately loses access (no cached permissions).
- Deactivating a user blocks login everywhere but does not delete their audit history.

## Access-denied behaviour

| Response | Cause |
|---|---|
| `401 UNAUTHORIZED` | Missing/invalid/revoked token |
| `403 FORBIDDEN_ROLE` | Global role too low |
| `403 FORBIDDEN_READ_ONLY` | VIEWER attempted a write |
| `403 FORBIDDEN_RESOURCE_ACCESS` | No project/app membership |
| `403 FORBIDDEN_APP_SCOPE` | API token scoped to another app |
| `403 FORBIDDEN_TOKEN_PERMISSION` | Token READ used for write |
| `404` | Resource hidden from your scope (often used to avoid IDOR disclosure) |

## Verify restrictions

1. Sign in as the user in a private window.
2. Confirm inaccessible projects are absent from lists and direct URLs return 403/404.
3. Attempt a write (upload, edit) — expect 403 for VIEWER.
4. For tokens, attempt an upload with a READ token — expect 403.

## Common problems

- **User sees an empty dashboard** — no memberships; add project/app access.
- **Developer cannot approve** — they uploaded the release and `ALLOW_SELF_APPROVAL=false`; an admin or another developer must approve.
- **Admin actions fail for API token** — administrative/session-only routes intentionally reject API tokens.
- **Role changed but user still sees old access** — ask them to refresh; permissions are read per request, but the UI may cache lists.

## Related

- [Administrator manual](/docs/user-guide/admin-manual)
- [Security](/docs/security/index)
- [API Reference](/docs/api/reference)
