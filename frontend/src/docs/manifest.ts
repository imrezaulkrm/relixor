export interface DocEntry {
  path: string;
  title: string;
  group: string;
  description: string;
  updated: string;
}

export interface DocGroup {
  title: string;
  entries: DocEntry[];
}

const entry = (
  path: string,
  title: string,
  group: string,
  description: string,
  updated = '2026-11-12'
): DocEntry => ({ path, title, group, description, updated });

export const DOC_ENTRIES: DocEntry[] = [
  entry('/docs', 'Relixor Documentation', 'Overview', 'Start here: what Relixor is, who this documentation is for, and how it is organised.'),
  entry('/docs/getting-started/introduction', 'Introduction & Quick Start', 'Getting Started', 'Product overview, architecture, requirements, installation and first login.'),
  entry('/docs/installation/quick-install', 'Installation on Ubuntu', 'Getting Started', 'Install Docker, configure .env, build and start the full stack, verify health.'),
  entry('/docs/deployment/production', 'Production Deployment', 'Getting Started', 'Hardened single-VM deployment, TLS, firewall, verification and rollback.'),

  entry('/docs/configuration/environment-variables', 'Environment Variables', 'Configuration', 'Every supported variable, defaults, sensitivity and restart requirements.'),

  entry('/docs/architecture/overview', 'Architecture Overview', 'Architecture', 'Request lifecycle, data model, authentication, upload/download and retention flows.'),
  entry('/docs/security', 'Security Guide', 'Architecture', 'Implemented controls and operational hardening for authentication, storage and deployment.'),

  entry('/docs/user-guide/project-management', 'Projects & Applications', 'User Guide', 'Create projects, register apps, manage metadata and understand deletion rules.'),
  entry('/docs/user-guide/user-management', 'Users, Roles & Permissions', 'User Guide', 'RBAC enforcement, memberships, the permission matrix and access troubleshooting.'),
  entry('/docs/user-guide/release-management', 'Releases & Channels', 'User Guide', 'Lifecycle, approval, publication, promotion, rollback and versioning rules.'),
  entry('/docs/user-guide/apk-management', 'APK Upload & Download', 'User Guide', 'Validation, checksums, storage, tickets, QR codes and common failures.'),
  entry('/docs/user-guide/public-portal', 'Public Download Portal', 'User Guide', 'Publishing apps publicly, visibility rules, QR access and abuse controls.'),
  entry('/docs/user-guide/qa-reports', 'QA & Reports', 'User Guide', 'Record QA results, read dashboards, export CSV/PDF and interpret evidence.'),
  entry('/docs/user-guide/account-management', 'Profile & Account Security', 'User Guide', 'Password changes, sessions, login history, reset tokens and deactivation.'),
  entry('/docs/user-guide/admin-manual', 'Administrator Manual', 'Role Manuals', 'Day-to-day administration workflows for ADMIN users.'),
  entry('/docs/user-guide/developer-manual', 'Developer Manual', 'Role Manuals', 'Uploading, iterating and promoting builds as a DEVELOPER.'),
  entry('/docs/user-guide/viewer-manual', 'Viewer Manual', 'Role Manuals', 'Read-only access, downloads and what VIEWER cannot do.'),
  entry('/docs/user-guide/qa-manual', 'QA Manual', 'Role Manuals', 'Verifying releases, recording evidence and exporting reports.'),

  entry('/docs/administration', 'Administration Guide', 'Administration', 'Users, tokens, audit, storage, health and maintenance procedures.'),
  entry('/docs/administration/database', 'Database & Migrations', 'Administration', 'PostgreSQL, Prisma, safe migrations, backups and failure recovery.'),
  entry('/docs/administration/retention', 'Retention & Cleanup', 'Administration', 'Policies, protections, dry-run, scheduling and irreversible deletion.'),
  entry('/docs/administration/backup-restore', 'Backup & Restore', 'Administration', 'Database, APK storage and configuration backups with verified restore steps.'),
  entry('/docs/administration/upgrade-rollback', 'Upgrade & Rollback', 'Administration', 'Upgrade sequence, compatibility rules and realistic rollback options.'),

  entry('/docs/api/reference', 'API Reference', 'Integrations', 'Authentication and every route group exposed by the backend.'),
  entry('/docs/integrations/gitlab-ci', 'GitLab CI/CD', 'Integrations', 'Token scopes, CI variables and a complete working upload pipeline.'),
  entry('/docs/integrations/android-update-api', 'Android Update API', 'Integrations', 'Update checks, mandatory updates, tickets, SHA-256 and installation limits.'),

  entry('/docs/troubleshooting', 'Troubleshooting', 'Operations', 'Symptom-driven fixes for containers, TLS, database, uploads and access.'),
  entry('/docs/development', 'Development Guide', 'Operations', 'Local setup, conventions, adding endpoints/pages and safe contribution workflow.'),
  entry('/docs/testing', 'Testing Guide', 'Operations', 'Disposable database setup, suites, coverage and known untested areas.'),

  entry('/docs/maintenance/maintenance-checklist', 'Maintenance Checklist', 'Maintenance', 'Daily, weekly, monthly and quarterly operational checks.'),
  entry('/docs/maintenance/production-readiness', 'Production Readiness', 'Maintenance', 'Evidence-based readiness assessment and release blockers.'),
  entry('/docs/maintenance/release-checklist', 'Release Checklist', 'Maintenance', 'Ship checklist for product releases and infrastructure changes.'),
  entry('/docs/maintenance/security-checklist', 'Security Checklist', 'Maintenance', 'Deployment, account, network and data protection checks.'),
  entry('/docs/maintenance/disaster-recovery', 'Disaster Recovery', 'Maintenance', 'Recovery scenarios, RPO/RTO guidance and verification.'),
  entry('/docs/CHANGELOG', 'Changelog', 'Reference', 'Dated changes, modules and migration history.'),
  entry('/docs/KNOWN-LIMITATIONS', 'Known Limitations', 'Reference', 'What Relixor does not do today, with impact and workarounds.'),
  entry('/docs/FAQ', 'FAQ', 'Reference', 'Short answers to common product and operations questions.'),
  entry('/docs/GLOSSARY', 'Glossary', 'Reference', 'Terminology used throughout the UI, API and documentation.'),
  entry('/docs/PROJECT-STATUS', 'Project Status', 'Reference', 'Verified capabilities with exact evidence and unverified areas.'),
  entry('/docs/COMPLETENESS', 'Documentation Matrix', 'Reference', 'A–Z coverage, verification status and remaining gaps.'),
];

export const DOC_GROUPS: DocGroup[] = DOC_ENTRIES.reduce<DocGroup[]>((groups, doc) => {
  const existing = groups.find((group) => group.title === doc.group);
  if (existing) existing.entries.push(doc);
  else groups.push({ title: doc.group, entries: [doc] });
  return groups;
}, []);
