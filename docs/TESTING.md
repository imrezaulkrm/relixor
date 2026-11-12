# E2E Testing Summary

## Validation status

- Command executed: `RELIXOR_BASE_URL=http://localhost:18081 ADMIN_DEFAULT_EMAIL=admin.e2e@relixor.internal ADMIN_DEFAULT_PASSWORD=RelixorE2eAdmin_2026_Only node scripts/e2e-uat-runner.mjs`
- Result: **PASS**
- Evidence: **26/26 scenarios passed, 0 failed**

## Scope covered

- Admin, developer, and viewer authentication flow
- Unauthorized and invalid login handling
- Role-based navigation and access control
- Application creation and lookup
- APK upload validation, duplicate prevention, checksum verification
- Release lifecycle and artifact download checks
- Session refresh and logout behavior
- API authorization enforcement for restricted roles
- Direct unauthenticated download denial

## Browser and viewport coverage

- Chromium via Playwright
- Default E2E runner coverage includes the app’s browser workflow against the isolated stack

## Security and authorization results

- Invalid credentials are rejected
- Developer privileges cannot escalate to admin token creation
- Viewer cannot create apps, manage tokens, access user or audit APIs, or publish/delete releases
- Direct unauthenticated APK download is denied
- Authenticated app downloads remain limited to permitted roles

## Environment notes

- Isolated test stack deployed with a disposable PostgreSQL database and temporary storage
- CORS allowlist updated for the browser origin used in the isolated E2E environment
- Demo project membership was seeded for the developer and viewer accounts so the viewer could access the default app in the same way the role-based E2E suite expects

## Files relevant to the E2E runner

- [scripts/e2e-uat-runner.mjs](../scripts/e2e-uat-runner.mjs)
- [docker-compose.e2e.yml](../docker-compose.e2e.yml)
- [.env.e2e](../.env.e2e)

## Remaining known items

- No production credentials or production storage were touched
- No deployment or irreversible mutation was executed outside the disposable E2E stack
