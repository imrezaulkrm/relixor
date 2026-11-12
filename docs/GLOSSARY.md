# Glossary

| Term | Meaning |
|---|---|
| **ADMIN** | Global role with full platform control |
| **DEVELOPER** | Global or membership role that can upload/edit releases for accessible apps |
| **VIEWER** | Read-only global/membership role; can download but not write |
| **Project** | Container and access boundary for apps |
| **App** | One Android package inside a project |
| **Membership** | Project- or app-level grant of DEVELOPER/VIEWER |
| **Channel** | DEV, QA, STAGING, BETA, PRODUCTION label/policy boundary |
| **Release** | One uploaded APK plus version metadata |
| **versionCode** | Monotonic integer Android uses to compare versions |
| **Status** | Lifecycle state: DRAFT/UPLOADED/PENDING_APPROVAL/APPROVED/PUBLISHED/REJECTED/DEPRECATED/ARCHIVED |
| **Submit** | Move an uploaded/rejected release into review |
| **Approve / Reject** | Reviewer decision on a pending release |
| **Publish** | Make an approved release current in its channel |
| **Promote** | Move a release to another channel (PRODUCTION resets approval) |
| **Deprecate** | Retain but mark a published release superseded |
| **Rollback** | Make a previous PRODUCTION release current again |
| **Pin** | Protect a release from retention cleanup |
| **publication** | App-level `isPublic` + `publicSlug`, ADMIN-only |
| **download ticket** | Short-lived, single-use opaque token for one download |
| **API token** | Long-lived machine credential (`relixor_live_…`), hashed at rest, scoped |
| **JWT** | Browser session token containing user, role, session id and token version |
| **session** | DB record representing one login; individually revocable |
| **tokenVersion** | Counter that invalidates JWTs after password/deactivation events |
| **RBAC** | Role-based access control |
| **IDOR** | Insecure direct object reference; prevented by resource checks |
| **QA verification** | PASS/FAIL/BLOCKED record attached to a release |
| **Retention policy** | Per-channel age/enabled rule for artifact cleanup |
| **Dry run** | Preview of cleanup with no deletion |
| **Archive** | Metadata retained after APK bytes are deleted |
| **Audit log** | Append-only application record of security-relevant actions |
| **Health endpoint** | `/health`, reports DB and storage readiness |
| **SHA-256** | Artifact checksum shown on releases and downloads |
| **SPA** | React single-page app served with history fallback |
