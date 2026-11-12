# API Reference

Base URL: `https://<host>/api/v1`. All responses are JSON except APK downloads and CSV/PDF exports.

## Authentication

Send exactly one of:

```http
Authorization: Bearer <JWT>
X-API-Key: relixor_live_<token>
```

Query-string credentials (`?token=`) are **rejected**. Public endpoints require no authentication. Download tickets are opaque, short-lived and single-use.

### Response envelope

Success:

```json
{ "success": true, "data": { }, "meta": { "page": 1, "limit": 20, "total": 42 } }
```

Error:

```json
{ "success": false, "error": { "message": "Human readable", "code": "MACHINE_CODE" } }
```

HTTP status carries the primary meaning; `code` is stable enough for client logic.

### Rate limits

| Scope | Limit |
|---|---|
| All `/api/` | 1000 requests / 15 min / IP |
| `/auth/login`, `/auth/password-reset` | 30 / 15 min / IP |
| `/downloads/*` | 120 / 15 min / IP |

Exceeding returns HTTP 429 with `RATE_LIMIT_EXCEEDED`, `AUTH_RATE_LIMIT` or `DOWNLOAD_RATE_LIMIT`.

## Endpoint index

### Authentication (`/auth`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| POST | `/auth/login` | none | `{email,password}` → JWT + user; records login event |
| POST | `/auth/logout` | JWT | Revokes current session |
| GET | `/auth/me` | JWT | Current user |
| POST | `/auth/change-password` | JWT | `{currentPassword,newPassword}`; revokes other sessions |
| POST | `/auth/password-reset` | none | `{token,newPassword}`; single-use admin-issued token |

### Profile (`/profile`)

| Method | Path | Notes |
|---|---|---|
| GET | `/profile` | Own profile |
| PUT | `/profile` | Update allowed fields (name/email/avatar) |
| GET | `/profile/sessions` | Own sessions |
| DELETE | `/profile/sessions/:sessionId` | Revoke own session |
| GET | `/profile/activity` | Own login/security events |

### Users (`/users`, ADMIN, interactive)

`GET /users`, `POST /users`, `PUT /users/:userId`, `DELETE /users/:userId`, `GET /users/:userId/access`, `GET /users/:userId/sessions`, `DELETE /users/:userId/sessions`, `GET /users/:userId/activity`, `POST /users/:userId/password-reset`.

API tokens are rejected for this group.

### Projects (`/projects`)

| Method | Path | Role |
|---|---|---|
| GET | `/projects` | authenticated, scoped |
| POST | `/projects` | ADMIN |
| GET | `/projects/:projectId` | VIEWER on project |
| PUT | `/projects/:projectId` | ADMIN |
| DELETE | `/projects/:projectId` | ADMIN; project must be empty |
| GET/POST | `/projects/:projectId/members` | ADMIN interactive |
| PUT/DELETE | `/projects/:projectId/members/:userId` | ADMIN interactive |

### Applications (`/apps`)

| Method | Path | Role |
|---|---|---|
| GET | `/apps` | authenticated, scoped |
| POST | `/apps` | ADMIN/DEVELOPER |
| GET | `/apps/:appId` | VIEWER on app |
| PUT | `/apps/:appId` | ADMIN/DEVELOPER with DEVELOPER access |
| DELETE | `/apps/:appId` | ADMIN; deletes releases + files |
| GET/POST | `/apps/:appId/members` | ADMIN interactive |
| PUT/DELETE | `/apps/:appId/members/:userId` | ADMIN interactive |

### Releases (`/apps/:appId/releases`)

| Method | Path | Notes |
|---|---|---|
| GET | `/` | List; query filters/pagination |
| POST | `/` | multipart upload; `file` required |
| GET | `/current` | Current production release |
| GET | `/compare?a=&b=` | Compare two releases |
| POST | `/rollback` | Restore prior production release |
| GET | `/:releaseId` | Detail |
| GET | `/:releaseId/download` | Stream APK |
| GET | `/:releaseId/download-ticket` | Short-lived ticket |
| PUT | `/:releaseId` | Metadata update |
| POST | `/:releaseId/submit` | → PENDING_APPROVAL |
| POST | `/:releaseId/approve` | → APPROVED |
| POST | `/:releaseId/reject` | `{reason}` required |
| POST | `/:releaseId/publish` | Requires APPROVED |
| POST | `/:releaseId/deprecate` | PUBLISHED → DEPRECATED |
| POST | `/:releaseId/promote` | `{channel}`; PRODUCTION resets approval |
| DELETE | `/:releaseId` | Protected for production/pinned/active |
| GET/POST | `/:releaseId/qa-verifications` | List/record QA |
| GET | `/:releaseId/qa-summary` | Aggregated QA |

Global catalog: `GET /releases` (authenticated, scoped, paginated).

### Upload example

```bash
curl -X POST "$BASE/apps/$APP_ID/releases" \
  -H "X-API-Key: $RELIXOR_API_TOKEN" \
  -F "file=@app-release.apk" \
  -F "version=1.4.0" \
  -F "versionCode=140" \
  -F "channel=QA" \
  -F "notes=Release candidate" \
  -F "sha256=$SHA256" \
  -F "gitCommitSha=$CI_COMMIT_SHA" \
  -F "gitlabPipelineId=$CI_PIPELINE_ID"
```

### Updates (`/apps/:appId/updates`)

| Method | Path | Notes |
|---|---|---|
| GET | `/check?currentVersionCode=` | `{updateAvailable, mandatoryUpdate, latest}` |
| GET | `/latest` | Latest eligible release |

### Public (`/public`, no auth)

| Method | Path | Notes |
|---|---|---|
| GET | `/apps` | Public catalog (search/page) |
| GET | `/apps/:appRef` | Public app detail by UUID or slug |
| GET | `/apps/:appRef/updates/check` | Public update check |
| GET | `/apps/:appRef/updates/latest` | Public latest |
| POST | `/apps/:appRef/download-ticket` | Ticket for current production release |

### Downloads

`GET /downloads/:ticket` — redeem a single-use ticket; 410 after use/expiry. Rate limited.

### Tokens (`/tokens`, ADMIN/DEVELOPER, interactive)

`GET /tokens`, `POST /tokens` (`{name, permission, appId?, expiresInDays?}`), `PUT /tokens/:tokenId/revoke`, `DELETE /tokens/:tokenId`. Plaintext returned once on create.

### QA reports (`/reports`)

`GET /reports/qa?format=json|csv|pdf`, `GET /reports/qa/export?format=...`. Scoped to accessible apps; exports audited.

### Retention (`/retention`, ADMIN interactive)

`GET/PUT /retention/policies[/:channel]`, `GET /retention/storage`, `GET /retention/candidates`, `POST /retention/cleanup` (`{mode:'DRY_RUN'|'EXECUTE'}`), `GET /retention/history`.

### Dashboard (`/stats`)

`GET /stats/dashboard`, `GET /stats/overview` — role-scoped aggregates.

### Audit (`/audit-logs`)

`GET /audit-logs?action=&entityType=&userId=&page=&limit=` — ADMIN; DEVELOPER sees scoped entries; VIEWER denied.

### Health

`GET /health` and `GET /api/v1/health` (no auth). 200 when database and storage are ready; 503 otherwise.

## Error codes you will meet

`UNAUTHORIZED`, `INVALID_TOKEN`, `TOKEN_EXPIRED`, `USER_INACTIVE`, `FORBIDDEN_ROLE`, `FORBIDDEN_READ_ONLY`, `FORBIDDEN_RESOURCE_ACCESS`, `FORBIDDEN_APP_SCOPE`, `FORBIDDEN_TOKEN_PERMISSION`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `MISSING_FILE`, `INVALID_APK_FILE`, `CHECKSUM_MISMATCH`, `DUPLICATE_RELEASE`, `INVALID_CHANNEL`, `INVALID_VERSION_CODE`, `RELEASE_NOT_APPROVED`, `SELF_APPROVAL_FORBIDDEN`, `RELEASE_PROTECTED`, `NOT_PUBLICLY_DOWNLOADABLE`, `TICKET_EXPIRED`, `TICKET_ALREADY_USED`, `RETENTION_EXECUTION_DISABLED`, `PRODUCTION_RETENTION_FORBIDDEN`, `RATE_LIMIT_EXCEEDED`.

## Versioning

Routes are under `/api/v1`. There is no deprecation policy yet; additive fields may appear. Clients should ignore unknown fields and branch on HTTP status + `error.code`.

## Related

- [Android Update API](/docs/integrations/android-update-api)
- [GitLab CI](/docs/integrations/gitlab-ci)
- [Security](/docs/security/index)
