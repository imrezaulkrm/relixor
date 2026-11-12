-- Step 1: CreateTable "projects"
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "iconUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- Step 2: CreateIndex
CREATE UNIQUE INDEX "projects_slug_key" ON "projects"("slug");

-- Step 3: Insert Default Project for existing applications
INSERT INTO "projects" ("id", "name", "slug", "description", "updatedAt")
VALUES (
    'default-project-0000-0000-000000000000',
    'Default Project',
    'default-project',
    'System default project containing existing applications',
    CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

-- Step 4: AddColumn "projectId" to "apps" as nullable initially
ALTER TABLE "apps" ADD COLUMN "projectId" TEXT;

-- Step 5: Backfill all existing applications to Default Project
UPDATE "apps" SET "projectId" = 'default-project-0000-0000-000000000000' WHERE "projectId" IS NULL;

-- Step 6: AlterColumn "projectId" to NOT NULL
ALTER TABLE "apps" ALTER COLUMN "projectId" SET NOT NULL;

-- Step 7: CreateIndex on apps(projectId)
CREATE INDEX "apps_projectId_idx" ON "apps"("projectId");

-- Step 8: AddForeignKey
ALTER TABLE "apps" ADD CONSTRAINT "apps_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
