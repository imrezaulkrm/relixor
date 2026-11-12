# APK Upload & Download

## Validation performed

Relixor validates:

1. **Extension** — filename must end with `.apk` (Multer file filter).
2. **Magic bytes** — file must begin with a ZIP local-file header (`PK\x03\x04`), the container format of an APK.
3. **Size** — `MAX_FILE_SIZE_MB` (default 500 MB, also limited by nginx `client_max_body_size 500M`).
4. **Checksum** — server computes SHA-256; if the upload includes `sha256`, it must match.
5. **Duplicate** — `(appId, version, versionCode)` must be unique.

**Not performed:** malware scanning, signature verification, manifest parsing, minSdk/targetSdk extraction. The UI can display `minSdkVersion`/`targetSdkVersion` fields supplied by the client, but the APK itself is not inspected for them. Treat uploads as trusted internal artifacts.

## Upload manually

1. Open the app → **Upload APK**.
2. Select the file and fill version/versionCode/channel/notes.
3. Submit and wait; large files stream through nginx (300s timeout).
4. Verify the returned SHA-256 against your local file:

```bash
sha256sum app-release.apk
```

Expected: identical 64-character hex string in the UI/API response.

## Upload from CI

```bash
curl --fail-with-body \
  -H "X-API-Key: $RELIXOR_API_TOKEN" \
  -F "file=@app-release.apk" \
  -F "version=1.4.0" \
  -F "versionCode=140" \
  -F "channel=QA" \
  -F "notes=Build $CI_COMMIT_SHORT_SHA" \
  -F "sha256=$(sha256sum app-release.apk | cut -d' ' -f1)" \
  "https://relixor.example.com/api/v1/apps/$RELIXOR_APP_ID/releases"
```

See [GitLab CI](/docs/integrations/gitlab-ci) for a full pipeline and [API Reference](/docs/api/reference).

## Download

### Authenticated users

`GET /api/v1/apps/:appId/releases/:releaseId/download` with `Authorization: Bearer <JWT>` or `X-API-Key`. Access requires VIEWER on the app. Response streams the APK with `Content-Disposition`, `Content-Length` and `X-Checksum-SHA256`.

### Public/QR downloads

Public downloads never carry a long-lived credential in the URL. The client first requests a ticket:

```bash
curl -X POST https://relixor.example.com/api/v1/public/apps/<slug>/download-ticket
```

The response contains a short-lived, single-use ticket URL. Redeeming it consumes the ticket; a second request returns HTTP 410. Only PRODUCTION, PUBLISHED, approved releases of a public app are eligible. Internal releases return `409 NOT_PUBLICLY_DOWNLOADABLE`.

## QR codes

The UI generates a QR code pointing at a ticket URL, never at a JWT. Tickets expire quickly (minutes) and are single-use, so a photographed QR code cannot be reused indefinitely. Regenerate the QR for another download.

## Storage

- Local provider only: `STORAGE_LOCAL_DIR` (`/app/storage/apks` in Compose), backed by the `relixor_storage` volume.
- Keys are generated server-side; original filenames are metadata only.
- Files are written to a temporary path and moved atomically.
- Deleting an app deletes its APK files. Retention deletes files and archives metadata.

## Safe handling

- Keep the volume on encrypted disk where possible.
- Back up the volume consistently with the database; a DB backup without APKs cannot restore downloads.
- Do not mount the storage directory into unrelated containers.
- APKs are executable content: restrict who can upload and scan artifacts in your build pipeline before upload.

## Common errors

| Symptom | Cause | Fix |
|---|---|---|
| `MISSING_FILE` | Form field not named `file` | Use `-F "file=@..."` |
| `Only .apk files are supported` | Wrong extension | Upload `.apk` |
| `INVALID_APK_FILE` | Not a ZIP/APK | Rebuild the artifact |
| `CHECKSUM_MISMATCH` | Corrupted transfer or wrong hash | Recompute; re-upload |
| 413 | Exceeds nginx/Multer limit | Raise both limits deliberately |
| 409 duplicate | Same version/versionCode | Bump versionCode |
| 410 on download | Ticket already used/expired | Request a new ticket |
| 409 not publicly downloadable | Non-production or unpublished | Use authenticated download |

## Related

- [Release lifecycle](/docs/user-guide/release-management)
- [Public portal](/docs/user-guide/public-portal)
- [Backup & restore](/docs/administration/backup-restore)
