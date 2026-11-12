-- CreateEnum
CREATE TYPE "MembershipRole" AS ENUM ('DEVELOPER', 'VIEWER');

-- CreateTable "project_memberships"
CREATE TABLE "project_memberships" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'DEVELOPER',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable "app_memberships"
CREATE TABLE "app_memberships" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL DEFAULT 'DEVELOPER',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_memberships_projectId_userId_key" ON "project_memberships"("projectId", "userId");
CREATE INDEX "project_memberships_projectId_idx" ON "project_memberships"("projectId");
CREATE INDEX "project_memberships_userId_idx" ON "project_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "app_memberships_appId_userId_key" ON "app_memberships"("appId", "userId");
CREATE INDEX "app_memberships_appId_idx" ON "app_memberships"("appId");
CREATE INDEX "app_memberships_userId_idx" ON "app_memberships"("userId");

-- AddForeignKey
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "project_memberships" ADD CONSTRAINT "project_memberships_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_memberships" ADD CONSTRAINT "app_memberships_appId_fkey" FOREIGN KEY ("appId") REFERENCES "apps"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_memberships" ADD CONSTRAINT "app_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app_memberships" ADD CONSTRAINT "app_memberships_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
