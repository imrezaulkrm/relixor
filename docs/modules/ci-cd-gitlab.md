# GitLab CI/CD integration

## Purpose

Upload APKs from GitLab pipelines into Relixor with traceable build metadata. CI uploads always land in the lifecycle state `UPLOADED`; a pipeline cannot publish a release directly.

## Authentication and token scope

1. Sign in as an ADMIN or DEVELOPER.
2. Create an API token in **API Tokens**, scoped to the target application, with `WRITE` permission.
3. Store the plaintext token once in GitLab as a **masked, protected** CI/CD variable (`RELIXOR_API_TOKEN`).

Tokens are stored only as SHA-256 hashes. App-scoped tokens cannot read or write another application. Expired, revoked or inactive-user tokens receive `401`. A token scoped to a different app receives `403 FORBIDDEN_APP_SCOPE`.

## Endpoint

`POST /api/v1/apps/:appId/releases` with `multipart/form-data` and header `X-API-Key: <token>`.

| Field | Required | Notes |
|---|---|---|
| `file` | yes | APK binary. Field name must be `file`. |
| `version` | yes | e.g. `1.4.2`. Letters, digits, `.`, `+`, `-`, `_`. |
| `versionCode` | yes | Positive integer, unique per application. |
| `channel` | no | `DEV` (default), `QA`, `STAGING`, `BETA`, `PRODUCTION`. |
| `notes` / `releaseNotes` | no | Release notes. |
| `title`, `description` | no | Release metadata. |
| `sha256` | no | If supplied, must match the uploaded bytes or the upload is rejected with `CHECKSUM_MISMATCH`. |
| `gitCommitSha`, `gitBranch` | no | Recorded for traceability. |
| `gitlabPipelineId`, `gitlabPipelineUrl` | no | Recorded for traceability. |
| `buildTimestamp` | no | ISO-8601 build time. |
| `isMandatory`, `minSupportedVersionCode` | no | Android update policy metadata. |

The server independently computes SHA-256 and stores the artifact under a content-addressed key. The response returns the release record, including `sha256`, `fileSize` and `status: "UPLOADED"`.

## Errors and retry behavior

| Status | Code | Meaning |
|---|---|---|
| 400 | `MISSING_FILE` | No multipart `file` part. |
| 400 | `INVALID_APK` | File is not a valid ZIP/APK container. |
| 400 | `CHECKSUM_MISMATCH` | Declared `sha256` differs from content. |
| 401 | `INVALID_TOKEN` / `TOKEN_EXPIRED` | Token invalid, revoked or expired. |
| 403 | `FORBIDDEN_APP_SCOPE` | Token belongs to another app or lacks `WRITE`. |
| 409 | `DUPLICATE_RELEASE` | Same `version` + `versionCode` already exists. |
| 409 | `VERSION_CODE_CONFLICT` | `versionCode` already used by another version. |

A failed checksum or validation attempt does not create a release or retain the temporary file. Retrying the same build returns `409`; increment `versionCode` for a new artifact. Pipeline retries are therefore safe against accidental duplicates.

## Pipeline workflow

- **DEV**: upload after a successful build; no approval required for internal downloads.
- **QA**: upload after validation; QA reviewers record verification results.
- **STAGING**: promote an existing QA/BETA release (`POST .../promote`) rather than rebuilding.
- **PRODUCTION**: CI uploads only create an `UPLOADED` record. Submission, approval and publication are separate authorized UI/API actions (`submit` → `approve` → `publish`), and the uploader cannot approve their own release unless `ALLOW_SELF_APPROVAL=true`.

## Example pipeline

See [docs/examples/gitlab-ci.yml](../examples/gitlab-ci.yml). It builds the APK, computes SHA-256, and uploads to DEV/QA with `curl --fail-with-body`.

## Manual curl example

```bash
curl --fail-with-body \
  -X POST \
  -H "X-API-Key: $RELIXOR_API_TOKEN" \
  -F "file=@app-release.apk" \
  -F "version=1.0.0" \
  -F "versionCode=100" \
  -F "channel=DEV" \
  -F "sha256=$(sha256sum app-release.apk | cut -d' ' -f1)" \
  -F "gitCommitSha=$CI_COMMIT_SHA" \
  "$RELIXOR_URL/api/v1/apps/$RELIXOR_APP_ID/releases"
```

## Troubleshooting

- **401**: confirm the variable is not expired/protected incorrectly; regenerate the token and re-mask it.
- **403 APP_SCOPE**: the token is bound to a different application; create a token for the correct app.
- **409 DUPLICATE_RELEASE**: the pipeline reused a version code that is already stored; bump `versionCode`.
- **413/network error**: check Nginx `client_max_body_size` and `MAX_FILE_SIZE_MB`.
- **Invalid APK**: ensure the artifact is the signed APK, not an AAB or a partial download.
- **Production not visible publicly**: publishing also requires the application to be marked public and the release to be `PRODUCTION` + `PUBLISHED`.

## Security notes

- Never place tokens in URLs, repository files, build logs or artifacts.
- Use a distinct token per application/pipeline and revoke it when the pipeline is retired.
- Relixor never logs the `X-API-Key` value; audit records contain only release metadata.
