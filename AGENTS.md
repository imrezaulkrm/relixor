# Relixor agent guide

Relixor is a self-hosted private Android APK repository and release-management UI. It is a TypeScript monorepo: React 18/Vite/Tailwind frontend, Node 20+/Express backend, Prisma 5/PostgreSQL 17, local filesystem APK storage behind a `StorageProvider` interface, and Docker Compose/Nginx deployment. Read [docs/PROJECT_MAP.md](docs/PROJECT_MAP.md) for boundaries and [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md) for current evidence.

## Focused work

1. Read this file and `docs/PROJECT_STATUS.md`.
2. Select the smallest relevant module in `docs/modules/`; read its dependency documents only.
3. Inspect the named implementation and test files before editing. Rebuild the full map only when structure, major interfaces, or dependencies materially change.
4. Define acceptance criteria, make the smallest change, run targeted tests, then relevant regression checks.
5. Update the affected module document and project status when behavior or interfaces change.

Do not infer security behavior from README text, old reports, a successful TypeScript build, or the existence of code. Verify the current middleware, controller, storage boundary, schema, and tests before making security-sensitive claims. Never print, commit, or document secrets, credentials, private keys, tokens, or large source copies. Do not run migrations, alter production resources, or perform destructive operations unless the task explicitly authorizes them.

Report every check as `PASS`, `FAIL`, `BLOCKED`, or `NOT TESTED`, with the exact command and relevant limitation. A module is `VERIFIED` only when its documented acceptance criteria have sufficient executed evidence. Use the concise completion format: changed files; commands/results; remaining risks or blocked checks; next step.

See [docs/DECISIONS.md](docs/DECISIONS.md) for durable design choices and [docs/PRODUCTION_READINESS.md](docs/PRODUCTION_READINESS.md) for the existing readiness audit.
