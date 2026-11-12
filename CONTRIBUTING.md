# Contributing to Relixor

## Before you start

- Read [AGENTS.md](AGENTS.md) and [docs/PROJECT_STATUS.md](docs/PROJECT_STATUS.md).
- Preserve existing uncommitted work; never reset, clean or stash another contributor's changes.
- Do not commit `.env`, secrets, APKs, database dumps, backups, `node_modules` or build output.
- Do not push, deploy or run production migrations without explicit authorization.

## Development workflow

1. Create a focused branch.
2. Read the relevant module doc in `docs/modules/` and the implementation before editing.
3. Make the smallest change that satisfies the requirement.
4. Add or update tests for behaviour changes.
5. Run the relevant checks:

```bash
npm --prefix backend run build
npm --prefix frontend run build
cd backend && npx jest --runInBand --forceExit
```

Tests require a disposable PostgreSQL database (see [Testing](/docs/testing/index)). Never point tests at production.

6. Update documentation when interfaces or behaviour change.
7. Review `git diff` and `git diff --check`.

## Code conventions

- TypeScript strict; avoid `any`.
- Validate input with Zod; enforce authorization server-side.
- Keep controllers thin and domain logic in services.
- Use the existing error envelope and stable error codes.
- Audit security-relevant actions.
- Additive, reviewed Prisma migrations only.
- Frontend: existing Tailwind slate/indigo style, accessible labels, loading/empty/error states.

## Pull requests

Include: summary, motivation, affected modules, verification commands and results, risks, and screenshots only if UI changed (redact data). Do not claim tests passed if they were not run.

## Documentation

Documentation lives in `docs/` and is served at `/docs`. Add new pages to `frontend/src/docs/manifest.ts` and run `node scripts/check-docs.mjs`.

## Security issues

Do not open a public issue. Follow [SECURITY.md](SECURITY.md).
