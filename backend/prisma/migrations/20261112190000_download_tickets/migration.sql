CREATE TABLE "download_tickets" (
    "id" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "userId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "download_tickets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "download_tickets_releaseId_idx" ON "download_tickets"("releaseId");
CREATE INDEX "download_tickets_expiresAt_idx" ON "download_tickets"("expiresAt");

ALTER TABLE "download_tickets" ADD CONSTRAINT "download_tickets_releaseId_fkey"
  FOREIGN KEY ("releaseId") REFERENCES "releases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
