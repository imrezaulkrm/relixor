# GitLab CI/CD Integration

Relixor accepts CI uploads with a scoped API token. The token goes in the `X-API-Key` header, never in the URL or YAML.

## 1. Create a token in Relixor

1. **Tokens → New token**.
2. Name it for the project/pipeline.
3. Permission: `WRITE`.
4. Scope: the specific application (recommended) or all apps.
5. Expiry: 30–90 days; rotate.
6. Copy the `relixor_live_...` value once.

## 2. Store it in GitLab

**Settings → CI/CD → Variables**:

| Key | Value | Flags |
|---|---|---|
| `RELIXOR_URL` | `https://relixor.example.com` | protected |
| `RELIXOR_APP_ID` | application UUID | protected |
| `RELIXOR_API_TOKEN` | token | **masked + protected** |

Newlines/special characters in the token are not expected; if masking is rejected, ensure the value meets GitLab's masking rules. Never commit the token or echo it.

## 3. Build stage

The pipeline needs an APK and its SHA-256:

```yaml
stages: [build, upload-dev, upload-qa]

build:apk:
  stage: build
  script:
    - ./gradlew assembleRelease
    - echo "APK_SHA256=$(sha256sum app/build/outputs/apk/release/app-release.apk | cut -d' ' -f1)" >> build.env
  artifacts:
    reports:
      dotenv: build.env
    paths:
      - app/build/outputs/apk/release/app-release.apk
```

The `dotenv` report exposes `APK_SHA256` to later jobs.

## 4. Upload jobs

```yaml
upload:dev:
  stage: upload-dev
  needs: ["build:apk"]
  rules:
    - if: '$CI_COMMIT_BRANCH == "develop"'
  script:
    - |
      curl --fail-with-body --silent --show-error \
        --request POST \
        --header "X-API-Key: ${RELIXOR_API_TOKEN}" \
        --form "file=@app/build/outputs/apk/release/app-release.apk" \
        --form "version=${ANDROID_VERSION_NAME}" \
        --form "versionCode=${ANDROID_VERSION_CODE}" \
        --form "channel=DEV" \
        --form "notes=Automated DEV build ${CI_COMMIT_SHORT_SHA}" \
        --form "sha256=${APK_SHA256}" \
        --form "gitCommitSha=${CI_COMMIT_SHA}" \
        --form "gitBranch=${CI_COMMIT_REF_NAME}" \
        --form "gitlabPipelineId=${CI_PIPELINE_ID}" \
        --form "gitlabPipelineUrl=${CI_PIPELINE_URL}" \
        --form "buildTimestamp=${CI_JOB_STARTED_AT}" \
        "${RELIXOR_URL}/api/v1/apps/${RELIXOR_APP_ID}/releases"
```

A complete two-channel example is in [`docs/examples/gitlab-ci.yml`](/docs/integrations/gitlab-ci) — copy it into your repository and adjust paths.

## 5. Version metadata

- `version` — display name (`1.4.0`).
- `versionCode` — **must increase**; derive from Gradle, not the pipeline counter, so local and CI builds agree.
- `channel` — `DEV`, `QA`, `STAGING`, `BETA`, `PRODUCTION`. Use only DEV/QA from CI; production promotion should be a deliberate human action.
- `sha256` — required for meaningful integrity. A mismatch rejects the upload.
- `gitCommitSha`, `gitBranch`, `gitlabPipelineId`, `gitlabPipelineUrl`, `buildTimestamp` — traceability.
- `minSupportedVersionCode`, `isMandatory` — update-policy metadata.

## 6. QA and production

CI can upload to QA and optionally submit for approval. Do **not** approve production from the same shared token/pipeline; approval is a human control. Recommended:

1. CI uploads QA build.
2. QA verifies; reviewer approves.
3. A human promotes/publishes to PRODUCTION.

## 7. Failure handling

| Error | Meaning | Fix |
|---|---|---|
| 401 `INVALID_TOKEN` | revoked/wrong token | Rotate token, update variable |
| 403 `FORBIDDEN_TOKEN_PERMISSION` | READ token | Use WRITE |
| 403 `FORBIDDEN_APP_SCOPE` | token for another app | Correct scope |
| 409 duplicate | version+code exists | Bump versionCode |
| 400 `CHECKSUM_MISMATCH` | artifact changed/corrupt | Recompute; investigate |
| 413 | file too large | Adjust limits deliberately |
| timeout | large upload/proxy | Check nginx timeouts (300s), retry |

`--fail-with-body` makes curl exit non-zero on HTTP errors. Do not use `|| true` around uploads.

## 8. Token rotation

Create a replacement token, update the GitLab variable, run a pipeline, then revoke the old token. Overlap briefly to avoid a broken release. Audit token usage (`lastUsedAt`) and revoke unused tokens.

## Limitations

- No GitLab OIDC/JWT federation; static API tokens only.
- No native GitLab release integration or artifact deduplication by pipeline.
- No automatic approval/promotion.
- A pipeline retry with the same versionCode is rejected — bump it or delete the prior upload if it was a mistake (if unprotected).

## Related

- [API Reference](/docs/api/reference)
- [Release management](/docs/user-guide/release-management)
- [Example pipeline](/docs/integrations/gitlab-ci)
