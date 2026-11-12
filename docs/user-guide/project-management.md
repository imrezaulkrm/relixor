# Projects & Applications

## Concepts

- A **project** is a container and access boundary (for example "Payments" or "Mobile Apps"). It has a name, unique slug, optional description and icon.
- An **application** is one Android package (`com.example.app`) inside exactly one project.
- Releases, API tokens and audit context hang off an application.
- Deleting a project requires it to be empty. Deleting an app is permanent and removes its releases and APK files.

Every installation starts with a `default-project` that cannot be deleted.

## Required permissions

| Action | Who |
|---|---|
| View projects/apps | ADMIN; project/app members (VIEWER+) |
| Create project | ADMIN only |
| Edit/delete project | ADMIN |
| Create app | ADMIN, DEVELOPER |
| Edit app | ADMIN, or DEVELOPER with DEVELOPER access to that app |
| Delete app | ADMIN |
| Manage members | ADMIN, interactive session only |

## Create a project

1. Sign in and open **Projects**.
2. Select **New Project**.
3. Enter a display name and a unique slug (lowercase, URL-safe). Optionally add a description.
4. Save. The project appears in the sidebar/project list.

Expected: project detail page with an empty app list. If the slug already exists, the API returns `409 PROJECT_SLUG_EXISTS`; choose another.

## Edit a project

Open the project, choose **Edit**, update name/description/icon, and save. The slug is the stable identifier used in URLs; change it only if you understand that existing bookmarks using the slug will break (UUID-based links continue to work).

## Create an application

1. Open the target project.
2. Choose **New Application**.
3. Enter:
   - **Name** — human-readable.
   - **Package name** — must be unique globally, e.g. `com.example.pos`.
   - **Description** — optional.
4. Save.

Expected: the app appears under the project and receives a UUID used by CI, upload and update APIs.

Common errors:

- `PACKAGE_NAME_EXISTS` — another app (in any project) already uses that package.
- `PROJECT_NOT_FOUND` — stale page; refresh.
- `403 FORBIDDEN_RESOURCE_ACCESS` — you lack DEVELOPER access to the project.

## View and edit app details

The app page shows metadata, release channels, publication status and recent releases. Developers with access can edit name/description/icon. Publication settings (`isPublic`, `publicSlug`) are visible to administrators and editable **only by ADMIN**; a developer receives `403 PUBLICATION_ADMIN_ONLY`.

Assigning an app to a different project is not supported in the current UI/API. Create the app in the correct project or recreate it.

## Search and filtering

- The apps/releases views support text search by app name/package and filters by channel/status; the releases catalog adds pagination and project/app scope.
- Search is server-side for the global release catalog and client-side for small project lists. Results never include apps you cannot access.

## Delete an application (ADMIN)

**Apps → app → Delete**. Type/confirm the destructive action.

Consequences, verified in code:

- All releases for the app are deleted (cascade).
- Stored APK files for those releases are deleted from the storage provider.
- API tokens scoped to the app and memberships are removed.
- An `APP_DELETE` audit event is written.

This cannot be undone except from a backup. Take a backup first if the artifact history matters.

## Delete a project (ADMIN)

A project can only be deleted when it contains **zero** applications. Otherwise the API returns `PROJECT_NOT_EMPTY`; delete or move (recreate) the apps first. `default-project` returns `CANNOT_DELETE_DEFAULT_PROJECT`. The project's memberships are removed with it.

## Common errors

| Error | Meaning | Fix |
|---|---|---|
| `PROJECT_NOT_FOUND` | Wrong ID/slug or deleted | Refresh the list |
| `PROJECT_SLUG_EXISTS` | Slug already used | Pick another |
| `PACKAGE_NAME_EXISTS` | Package already registered | Use the existing app |
| `PROJECT_NOT_EMPTY` | Apps still exist | Delete apps first |
| `FORBIDDEN_RESOURCE_ACCESS` | No membership | Ask an admin for access |
| `PUBLICATION_ADMIN_ONLY` | Developer tried to publish | Ask an administrator |

## Verification

- Project appears for intended members only; an unassigned developer gets no data.
- App UUID matches the one configured in CI.
- After upload, the release appears on the app page.

## Related

- [Users & permissions](/docs/user-guide/user-management)
- [Releases](/docs/user-guide/release-management)
- [APK management](/docs/user-guide/apk-management)
