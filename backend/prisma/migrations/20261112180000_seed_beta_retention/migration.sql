-- BETA retention policy is configurable by administrators (default 90 days).
-- This is a separate migration because PostgreSQL cannot use a newly added enum
-- value in the same transaction that added it.
INSERT INTO "retention_policies" ("id", "channel", "retentionDays", "enabled", "updatedAt")
VALUES ('retention-beta', 'BETA', 90, true, CURRENT_TIMESTAMP)
ON CONFLICT ("channel") DO NOTHING;
