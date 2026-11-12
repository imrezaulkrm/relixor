# Projects, membership, and resource RBAC

## Scope

Project containers (Module 01) and user assignment with resource-level authorization (Module 02): `Project`, `ProjectMembership`, `AppMembership`, effective-role resolution, membership APIs, audit events, and the related admin UI.

## Key files

- `backend/src/services/rbacService.ts` — effective role resolution and accessible-resource queries.
- `backend/src/middleware/resourceRbac.ts` — `requireProjectAccess` / `requireAppAccess` route guards.
- `backend/src/controllers/{project,membership}.controller.ts` and `routes/{project,app,release,user}.routes.ts` — endpoints and enforcement.
- `backend/prisma/schema.prisma` plus the `20261112140000_add_project_management` and `20261112150000_add_rbac_memberships` migrations.
- Frontend: `pages/Projects.tsx`, `ProjectDetails.tsx`, `AppDetails.tsx` (members tab), `Users.tsx` (access overview).

## Global roles

| Global role | Platform behavior |
|---|---|
| `ADMIN` | Full access to every project, app, release, download, and membership operation without membership records. |
| `DEVELOPER` | Reads only assigned projects/apps; writes/uploads only where the effective resource role is `DEVELOPER`. Cannot manage memberships. |
| `VIEWER` | Reads only assigned projects/apps; no writes, uploads, deletes, release changes, or membership management. |

Global roles remain the outer gate: existing `requireRole` checks still apply (for example a global `VIEWER` cannot publish a release even with an app-level `DEVELOPER` assignment). Resource roles refine access inside that gate.

## Membership model

- `ProjectMembership`: unique `(projectId, userId)`, role `DEVELOPER | VIEWER`, optional `createdById`, cascades on project/user deletion.
- `AppMembership`: unique `(appId, userId)`, role `DEVELOPER | VIEWER`, optional `createdById`, cascades on app/user deletion.
- Membership roles cannot grant `ADMIN`; the enum only contains `DEVELOPER` and `VIEWER`.

## Effective app role precedence

`ADMIN` > direct `AppMembership` > inherited `ProjectMembership` > deny.

A direct app assignment **always wins**, including when it is more restrictive *or* more permissive than the project role:

| Project role | App role | Effective role |
|---|---|---|
| DEVELOPER | — | DEVELOPER |
| VIEWER | — | VIEWER |
| DEVELOPER | VIEWER | VIEWER |
| VIEWER | DEVELOPER | DEVELOPER |
| — | DEVELOPER | DEVELOPER |
| — | VIEWER | VIEWER |
| — | — | DENY |

Project membership never bypasses an explicit app-level restriction. Users with only app memberships can see the parent project container so they can navigate, but project details and `/projects/:id/apps` are filtered to their accessible apps only.

## Permission matrix

| Action | ADMIN | Resource DEVELOPER | Resource VIEWER |
|---|---|---|---|
| View project/app/release metadata | yes | yes | yes |
| Download APK / QR download link | yes | yes | yes |
| Upload or delete a release | yes | yes | no |
| Update app metadata | yes | yes | no |
| Create app in project | yes | yes (project DEVELOPER) | no |
| Delete app | yes | no | no |
| Create/update/delete project | yes | no | no |
| Manage project/app memberships | yes | no | no |
| Create/revoke API tokens | yes | yes (existing global rules) | no |

## API endpoints

Membership management (ADMIN only, `requireRole(Role.ADMIN)`):

- `GET|POST /api/v1/projects/:projectId/members`
- `PUT|DELETE /api/v1/projects/:projectId/members/:userId`
- `GET|POST /api/v1/apps/:appId/members`
- `PUT|DELETE /api/v1/apps/:appId/members/:userId`
- `GET /api/v1/users/:userId/access`

Resource-enforced endpoints include project details/listing/app creation, app listing/details/update, release list/details/upload/delete/download, and the download URL embedded in the QR modal. Releases are always authorized through their parent `appId`; a release ID or storage key alone is never sufficient. Unauthorized resources return `403` (or `404` only where resource existence is already public to the caller), so UUID guessing does not bypass access checks.

Validation covers resource existence, user existence, role enum validity, duplicate membership (`409`), malformed IDs (`404`/`400`), and Zod request-body validation (`400`).

## API token compatibility

API tokens keep their existing records, hashes, IDs, scopes, permissions, and CI upload behavior. Token authentication continues to attach the owning user plus the token's permission/app scope:

- An app-scoped token is authorized only for its own app (`requirePermission` and `requireAppAccess` reject other app IDs).
- A global token is evaluated against its owner's resource access.
- Token management remains unavailable through token authentication, and tokens cannot be used for user/membership administration.

No token is regenerated, revoked, or re-scoped by this module.

## Audit events

Membership writes record `PROJECT_MEMBER_ASSIGNED`, `PROJECT_MEMBER_ROLE_UPDATED`, `PROJECT_MEMBER_REMOVED`, `APP_MEMBER_ASSIGNED`, `APP_MEMBER_ROLE_UPDATED`, and `APP_MEMBER_REMOVED` through `recordAuditLog`, including actor, target user, project/app ID, previous/new role, IP, and user agent. No secrets or token values are logged. Each membership mutation and its audit record now run in one Prisma transaction; an audit-write failure rolls back the membership change. Non-membership audit calls retain the existing best-effort behavior.

Audit-log reads are resource-scoped as well: a DEVELOPER may query `?appId=` only for an app they can read, global API tokens are evaluated against their owner's access, and app-scoped tokens are confined to their own app.

## Dashboard and count isolation

For non-admins, `GET /stats/dashboard` derives every aggregate (app/release counts, downloads, storage bytes, channel breakdown, recent releases, recent activity) from the user's accessible app IDs. Users with no accessible apps receive zeros and empty lists. Storage bytes use the sum of authorized release sizes instead of the global filesystem total. Project list `appCount`/`releaseCount`, project-detail counts, and project app listings are filtered the same way. `ADMIN` retains global statistics.

## Migration

`20261112140000_add_project_management` creates `projects`, inserts the `default-project` row, adds nullable `apps.projectId`, backfills every existing app to the default project, then sets `NOT NULL` with a `RESTRICT` foreign key. `20261112150000_add_rbac_memberships` is purely additive (enum plus two tables/indexes/foreign keys). No membership backfill is performed, so existing `DEVELOPER`/`VIEWER` users do not gain access to every project; global `ADMIN` users keep platform-wide access through their role.

Apply with `npx prisma migrate deploy` against the target database. Production execution requires explicit approval and a validated backup.

## Evidence

- **Status:** **VERIFIED** for Module 02 acceptance on 2026-11-12.
- `npx jest --runInBand --forceExit` against a disposable PostgreSQL 17 database: **6 suites, 83 tests passed**, including 27 RBAC/membership tests (assignment CRUD, duplicate `409`, non-admin `403`, unassigned deny, precedence in both directions, inherited viewer read-only, sibling-app/IDOR denial, dashboard/count isolation, unauthorized audit metadata denial, audit events, token compatibility).
- Disposable migration test on a pre-module database with existing users/apps/releases/tokens/audit rows: all rows and IDs preserved, both apps backfilled to `default-project`, token hash and APK `storageKey` unchanged, zero memberships auto-created.
- `npm --prefix backend run build` and `npm --prefix frontend run build`: passed.
