# Relixor

**Self-Hosted Artifact Repository & CI/CD Release Platform**

Relixor is a private, self-hosted platform for storing, managing, versioning, and distributing APKs and other software build artifacts from a centralized location.

It provides a web-based management interface and REST API, allowing developers and CI/CD pipelines to publish, organize, and distribute artifacts securely.

## Features

- **Artifact Management** — Upload, download, update, organize, and delete artifacts.
- **Version Management** — Maintain release history, version metadata, and release notes.
- **CI/CD Integration** — Publish artifacts directly from GitLab CI/CD, GitHub Actions, Jenkins, and other automation tools.
- **User & Role Management** — Control access using Admin, Developer, and Viewer roles.
- **Secure API Access** — Use scoped API tokens for automated publishing and downloads.
- **Release Channels** — Organize releases into Dev, QA, Staging, and Production.
- **Audit Logs** — Track uploads, downloads, updates, deletions, and administrative actions.
- **Artifact Integrity** — Calculate SHA-256 checksums to verify uploaded files.
- **Private Distribution** — Restrict artifact access to authorized users and pipelines.
- **Self-Hosted Deployment** — Run the platform on your own server using Docker Compose.
- **Backup & Recovery** — Support database and artifact-storage backup and restoration.

## Use Cases

- Centralized storage for Android APK and AAB files.
- Internal application distribution for development teams.
- Automated artifact publishing from CI/CD pipelines.
- Version tracking for development, QA, and production builds.
- Private storage for ZIP files, binaries, and other build artifacts.

## Architecture

Relixor consists of the following components:

- **Frontend:** Web dashboard for artifact and user management.
- **Backend:** REST API for authentication, authorization, and artifact operations.
- **Database:** Stores users, metadata, permissions, release history, and audit logs.
- **Artifact Storage:** Stores uploaded files separately from database records.
- **CI/CD Clients:** Publish artifacts through authenticated API requests.

## Technology Stack

The planned technology stack includes:

- React, TypeScript, Vite, and Tailwind CSS
- Node.js and Express
- PostgreSQL and Prisma ORM
- Docker Compose and Nginx
- REST API for CI/CD integration

The implementation may evolve as the project develops.

## CI/CD Integration

Relixor is designed to accept artifacts directly from automated pipelines.

Supported integration targets include:

- GitLab CI/CD
- GitHub Actions
- Jenkins
- Other CI/CD systems capable of making HTTP requests

Example GitLab CI/CD publishing workflow:

```yaml
publish_artifact:
  stage: deploy
  image: curlimages/curl:latest
  script:
    - |
      curl --fail-with-body --show-error \
        --request POST \
        --header "Authorization: Bearer ${RELIXOR_TOKEN}" \
        --form "file=@app-release.apk" \
        --form "version=${APP_VERSION}" \
        "${RELIXOR_URL}/api/v1/apps/${RELIXOR_APP_ID}/releases"
```

Configure `RELIXOR_URL`, `RELIXOR_TOKEN`, `RELIXOR_APP_ID`, and `APP_VERSION` as CI/CD variables. Keep tokens masked and protected, and use HTTPS in production.

The endpoint shown above represents the planned API contract and must match the implemented backend.

## Deployment

The intended deployment method is Docker Compose on a VPS, virtual machine, or local server.

The deployment guide will cover:

1. Environment configuration.
2. Database initialization and migrations.
3. Persistent artifact storage.
4. Initial administrator setup.
5. HTTPS and reverse-proxy configuration.
6. Backup and restoration.
7. Upgrades and release management.

Detailed installation instructions will be added as the implementation becomes available.

## Versioning

Relixor will use Semantic Versioning:

- `v1.0.0` — Initial stable release.
- `v1.1.0` — Backward-compatible feature additions.
- `v1.1.1` — Backward-compatible bug fixes.
- `v2.0.0` — Major changes or breaking API changes.

## Roadmap

- [ ] Project foundation and repository structure
- [ ] Authentication and authorization
- [ ] Artifact upload and download
- [ ] Application and release management
- [ ] REST API and API token management
- [ ] GitLab CI/CD integration
- [ ] GitHub Actions and Jenkins examples
- [ ] Audit logs and release channels
- [ ] Docker Compose deployment
- [ ] Automated tests and API documentation
- [ ] Backup, recovery, and production hardening

## Project Status

**Status:** Initial development

Features and deployment instructions are subject to change until the first stable release.

## License

The project license will be specified before the first public release.