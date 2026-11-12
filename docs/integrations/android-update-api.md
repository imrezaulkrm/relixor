# Android Update API

Relixor exposes release metadata so an Android client can decide whether an update exists and download the APK. The server **cannot install an APK silently**; the client must download, verify, and hand the file to the Android installer with user consent.

## Endpoints

Authenticated (JWT or API token, VIEWER on the app):

```
GET /api/v1/apps/:appId/updates/check?currentVersionCode=102
GET /api/v1/apps/:appId/updates/latest
```

Public (public app + qualifying PRODUCTION release):

```
GET /api/v1/public/apps/:appRef/updates/check?currentVersionCode=102
GET /api/v1/public/apps/:appRef/updates/latest
POST /api/v1/public/apps/:appRef/download-ticket
GET /api/v1/downloads/:ticket
```

`appRef` accepts the app UUID or public slug.

## Check response

```json
{
  "success": true,
  "data": {
    "app": { "id": "…", "name": "POS", "packageName": "com.example.pos" },
    "currentVersionCode": 102,
    "updateAvailable": true,
    "mandatoryUpdate": false,
    "latest": {
      "id": "…",
      "version": "1.4.0",
      "versionCode": 140,
      "channel": "PRODUCTION",
      "releaseNotes": "Fixes…",
      "fileName": "app-release.apk",
      "fileSize": 12345678,
      "sha256": "…64 hex…",
      "isMandatory": false,
      "minSupportedVersionCode": 100,
      "publishedAt": "2026-11-12T10:00:00.000Z"
    },
    "downloadPath": "/api/v1/apps/<appId>/releases/<releaseId>/download"
  }
}
```

`updateAvailable` is true when the latest `versionCode` is greater than the client's, or when the client sends `0`/omits it. `mandatoryUpdate` is true when the release is mandatory or the installed code is below `minSupportedVersionCode`.

## Version comparison

Use the integer, never the display string:

```kotlin
val installed = packageManager.getPackageInfo(packageName, 0).longVersionCode
if (latest.versionCode > installed) { /* update */ }
```

## Download and verify

Authenticated:

```kotlin
Request.Builder()
  .url("$baseUrl/api/v1/apps/$appId/releases/$releaseId/download")
  .header("Authorization", "Bearer $jwt")
  .build()
```

Public: request a ticket, then GET the returned `downloadUrl`. Tickets are short-lived and single-use; a replay returns HTTP 410.

Verify SHA-256 before installation:

```kotlin
fun sha256(file: File): String {
  val digest = MessageDigest.getInstance("SHA-256")
  file.inputStream().use { input ->
    val buffer = ByteArray(8192)
    while (true) {
      val read = input.read(buffer)
      if (read <= 0) break
      digest.update(buffer, 0, read)
    }
  }
  return digest.digest().joinToString("") { "%02x".format(it) }
}
require(sha256(downloaded) == latest.sha256) { "Checksum mismatch" }
```

Also check `Content-Length` and the `X-Checksum-SHA256` response header.

## Installation and platform limits

Android will not let a backend install an app. Your client must:

1. Declare `android.permission.REQUEST_INSTALL_PACKAGES` (sideload/enterprise distribution).
2. Guide the user to grant **Install unknown apps** for your package on Android 8+.
3. Share the verified file through a `FileProvider` content URI.
4. Launch `Intent.ACTION_VIEW` with `application/vnd.android.package-archive`.
5. Let the system installer obtain user confirmation.

```kotlin
val uri = FileProvider.getUriForFile(context, "$packageName.fileprovider", apkFile)
val intent = Intent(Intent.ACTION_VIEW).apply {
  setDataAndType(uri, "application/vnd.android.package-archive")
  addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
}
context.startActivity(intent)
```

Google Play policy may prohibit `REQUEST_INSTALL_PACKAGES` for Play-distributed apps. This flow targets private/enterprise distribution.

## Mandatory updates

When `mandatoryUpdate` is true, block normal use behind a non-dismissible update screen and start the download/install flow. Do not hard-code the policy in the app: the flag and `minSupportedVersionCode` are computed server-side and can change without a client release.

## Error handling

| Status | Meaning | Client action |
|---|---|---|
| 401 | Missing/invalid token | Re-authenticate or use public endpoint |
| 403 | No app access | Contact admin |
| 404 | App/release not found or not public | Check IDs/slug |
| 409 | Not publicly downloadable | Use authenticated endpoint |
| 410 | Ticket used/expired | Request a new ticket |
| 429 | Rate limited | Back off and retry |
| 503 | Backend/database/storage unhealthy | Retry later |

Never embed long-lived tokens in QR codes or URLs. Treat checksum mismatch, non-APK content and unexpected redirects as hard failures.

## Related

- [APK management](/docs/user-guide/apk-management)
- [Public portal](/docs/user-guide/public-portal)
- [API Reference](/docs/api/reference)
