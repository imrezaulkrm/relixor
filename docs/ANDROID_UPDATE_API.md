# Android update API integration

Relixor exposes release metadata for Android clients. The server can tell a client that an update exists and serve the APK; it **cannot** install an APK silently. Installation always requires Android platform permissions and user consent.

## Endpoints

Authenticated (JWT or `X-API-Key`, app access required):

```
GET /api/v1/apps/:appId/updates/check?currentVersionCode=102&channel=PRODUCTION
GET /api/v1/apps/:appId/updates/latest?channel=PRODUCTION
```

Public (only apps explicitly marked public and a PRODUCTION release that is `PUBLISHED` with completed approval):

```
GET /api/v1/public/apps/:appIdOrSlug/updates/check?currentVersionCode=102
GET /api/v1/public/apps/:appIdOrSlug/updates/latest
POST /api/v1/public/apps/:appIdOrSlug/download-ticket
GET /api/v1/downloads/:ticket
```

## Check response

```json
{
  "success": true,
  "data": {
    "app": { "id": "...", "name": "POS", "packageName": "com.example.pos" },
    "currentVersionCode": 102,
    "updateAvailable": true,
    "mandatoryUpdate": false,
    "latest": {
      "id": "...",
      "version": "1.4.0",
      "versionCode": 140,
      "channel": "PRODUCTION",
      "releaseNotes": "Fixes…",
      "fileName": "app-release.apk",
      "fileSize": 12345678,
      "sha256": "…64 hex chars…",
      "isMandatory": false,
      "minSupportedVersionCode": 100,
      "publishedAt": "2026-11-12T10:00:00.000Z"
    },
    "downloadPath": "/api/v1/apps/<appId>/releases/<releaseId>/download"
  }
}
```

`updateAvailable` is true when the server version code is greater than `currentVersionCode`, or when the client sends `0`/omits the parameter. `mandatoryUpdate` is true when the release is marked mandatory or the installed code is below `minSupportedVersionCode`.

## Comparing versions

Use **`versionCode`** (monotonic integer), never the display version string:

```kotlin
val installed = packageManager.getPackageInfo(packageName, 0).longVersionCode
if (latest.versionCode > installed) {
    // update available
}
```

## Downloading

Authenticated internal clients may download with the normal header — never put a token in a URL:

```kotlin
val request = Request.Builder()
    .url("$baseUrl/api/v1/apps/$appId/releases/$releaseId/download")
    .header("Authorization", "Bearer $jwt")
    .build()
```

Public clients request a short-lived, single-use ticket and download from the ticket URL:

```kotlin
val ticket = api.createPublicDownloadTicket(slug) // POST /api/v1/public/apps/{slug}/download-ticket
downloadFile("$baseUrl${ticket.downloadUrl}")    // /api/v1/downloads/<ticket>
```

Tickets expire (5–10 minutes) and are consumed exactly once. A second request returns HTTP 410.

## Verifying SHA-256

Always verify the downloaded bytes before offering installation:

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

The download response also carries `X-Checksum-SHA256`, `Content-Length` and `Content-Disposition`.

## Mandatory updates

When `mandatoryUpdate` is true, block normal use behind a non-dismissible update screen and start the download/install flow. Do not hard-code policy in the client: the flag and `minSupportedVersionCode` are computed server-side and can change without an app release.

## Installing the APK

A backend cannot silently install an app. Use the platform installer with user consent:

1. Declare `android.permission.REQUEST_INSTALL_PACKAGES` in the manifest for sideloaded distribution.
2. On Android 8+, the user must grant **Install unknown apps** for your package (`Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES`).
3. Share the verified file with a `FileProvider` content URI.
4. Launch `Intent.ACTION_VIEW` with `application/vnd.android.package-archive`.

```kotlin
val uri = FileProvider.getUriForFile(context, "$packageName.fileprovider", apkFile)
val intent = Intent(Intent.ACTION_VIEW).apply {
    setDataAndType(uri, "application/vnd.android.package-archive")
    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
}
context.startActivity(intent)
```

The user confirms installation in the system installer. Google Play policy may prohibit `REQUEST_INSTALL_PACKAGES` for Play-distributed apps; this flow is intended for private/enterprise distribution.

## Security rules

- Never embed long-lived JWTs or API tokens in QR codes or URLs.
- Public endpoints expose only `PRODUCTION` + `PUBLISHED` + approved releases of public apps. DEV/QA/STAGING/BETA and draft/pending releases remain private.
- Internal update checks require app-level `VIEWER` access; app-scoped API tokens can only see their own app.
- Treat checksum mismatches, non-APK content and unexpected redirects as hard failures.
