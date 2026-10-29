# Frontend administration

## Scope

React SPA screens and client-side auth for login, dashboard, apps/releases, users, tokens, audit logs, and CI/CD documentation.

## Key files and flow

`main.tsx`/`App.tsx` bootstrap navigation. `AuthContext.tsx` stores the bearer token and current user. `api/client.ts` calls `/api/v1`. Pages under `frontend/src/pages/` render feature screens; shared components provide navigation and badges. `AppDetails.tsx` owns upload/download/QR interactions.

## Security and validation

The UI must not be treated as authorization; backend middleware is authoritative. Avoid logging or persisting token plaintext beyond the intended creation display. Validate API error handling and role-based affordances against backend behavior.

## Evidence and acceptance

- **Status:** **VERIFIED**
- Production build passed (`npm run build:frontend`) generating optimized bundle.
- Verified defect fix in `frontend/src/api/client.ts` (`downloadFile` now prepends `API_BASE` and gracefully delays blob URL revocation).
- Complete 26-scenario Playwright E2E browser automation suite (`scripts/e2e-uat-runner.mjs`) verified:
  - Landing page (`/`) and Login page (`/login`) rendering and interaction.
  - Invalid credential error alerts in UI.
  - Admin login, Dashboard KPI metrics, and full sidebar navigation.
  - App creation modal and immediate redirection to App Details.
  - Invalid APK rejection message display.
  - Valid APK upload and live card rendering.
  - Duplicate release upload error handling.
  - APK binary download with SHA-256 match.
  - Direct Mobile Install QR code modal.
  - Session sign-out.
  - Developer role UI affordances (Users tab hidden).
  - Viewer role UI affordances (Tokens, Users, and Audit tabs hidden; New App and Publish buttons hidden).
  - Viewer role APK download button successfully downloading binary artifact.
  - SPA refresh state retention.

Detailed results recorded in [docs/UAT_REPORT.md](../UAT_REPORT.md).
