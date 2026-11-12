-- Extend release channels and lifecycle
ALTER TYPE "ReleaseChannel" ADD VALUE IF NOT EXISTS 'BETA';

CREATE TYPE "ReleaseStatus" AS ENUM ('DRAFT', 'UPLOADED', 'PENDING_APPROVAL', 'APPROVED', 'PUBLISHED', 'REJECTED', 'DEPRECATED', 'ARCHIVED');
CREATE TYPE "QaStatus" AS ENUM ('PASS', 'FAIL', 'BLOCKED');
CREATE TYPE "CleanupMode" AS ENUM ('DRY_RUN', 'EXECUTE');

-- Public application metadata
ALTER TABLE "apps" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "apps" ADD COLUMN "publicSlug" TEXT;
CREATE UNIQUE INDEX "apps_publicSlug_key" ON "apps"("publicSlug");

-- Session revocation and account security
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- Release metadata and lifecycle
ALTER TABLE "releases"
  ADD COLUMN "status" "ReleaseStatus" NOT NULL DEFAULT 'UPLOADED',
  ADD COLUMN "title" TEXT,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "isMandatory" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "minSupportedVersionCode" INTEGER,
  ADD COLUMN "isPinned" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "gitCommitSha" TEXT,
  ADD COLUMN "gitBranch" TEXT,
  ADD COLUMN "gitlabPipelineId" TEXT,
  ADD COLUMN "gitlabPipelineUrl" TEXT,
  ADD COLUMN "buildTimestamp" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "publishedAt" TIMESTAMP(3);

CREATE INDEX "releases_status_idx" ON "releases"("status");

ALTER TABLE "releases" ADD CONSTRAINT "releases_approvedById_fkey"
  FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Release status history
CREATE TABLE "release_status_history" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "fromStatus" "ReleaseStatus",
    "toStatus" "ReleaseStatus" NOT NULL,
    "reason" TEXT,
    "changedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "release_status_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "release_status_history_releaseId_idx" ON "release_status_history"("releaseId");
ALTER TABLE "release_status_history" ADD CONSTRAINT "release_status_history_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "release_status_history" ADD CONSTRAINT "release_status_history_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- QA verification records
CREATE TABLE "qa_verifications" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" "QaStatus" NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "qa_verifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "qa_verifications_releaseId_reviewerId_key" ON "qa_verifications"("releaseId", "reviewerId");
CREATE INDEX "qa_verifications_releaseId_idx" ON "qa_verifications"("releaseId");
ALTER TABLE "qa_verifications" ADD CONSTRAINT "qa_verifications_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "qa_verifications" ADD CONSTRAINT "qa_verifications_reviewerId_fkey"
  FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Login/session history
CREATE TABLE "login_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "login_events_userId_createdAt_idx" ON "login_events"("userId", "createdAt");
ALTER TABLE "login_events" ADD CONSTRAINT "login_events_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Retention policies and cleanup history
CREATE TABLE "retention_policies" (
    "id" TEXT NOT NULL,
    "channel" "ReleaseChannel" NOT NULL,
    "retentionDays" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "retention_policies_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "retention_policies_channel_key" ON "retention_policies"("channel");

CREATE TABLE "cleanup_runs" (
    "id" TEXT NOT NULL,
    "mode" "CleanupMode" NOT NULL,
    "channel" "ReleaseChannel",
    "releasesConsidered" INTEGER NOT NULL DEFAULT 0,
    "releasesDeleted" INTEGER NOT NULL DEFAULT 0,
    "bytesFreed" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,
    "executedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cleanup_runs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "cleanup_runs_createdAt_idx" ON "cleanup_runs"("createdAt");
ALTER TABLE "cleanup_runs" ADD CONSTRAINT "cleanup_runs_executedById_fkey"
  FOREIGN KEY ("executedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Default retention policies. PRODUCTION is intentionally disabled (never auto-delete).
INSERT INTO "retention_policies" ("id", "channel", "retentionDays", "enabled", "updatedAt")
VALUES
  ('retention-dev', 'DEV', 7, true, CURRENT_TIMESTAMP),
  ('retention-qa', 'QA', 30, true, CURRENT_TIMESTAMP),
  ('retention-staging', 'STAGING', 60, true, CURRENT_TIMESTAMP),
  ('retention-production', 'PRODUCTION', 0, false, CURRENT_TIMESTAMP)
ON CONFLICT ("channel") DO NOTHING;
