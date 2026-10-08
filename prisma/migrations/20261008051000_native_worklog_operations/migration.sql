-- Native receipts and accounting outbox only. General migration ledger remains unreconciled.
-- Apply exclusively through a reviewed, pinned additive bootstrap after rollback validation.
CREATE TABLE IF NOT EXISTS "icc"."TerraqoNativeWorklogOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT NOT NULL REFERENCES "icc"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "workspaceId" TEXT NOT NULL REFERENCES "icc"."TerraqoWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "professionalProfileId" TEXT NOT NULL REFERENCES "icc"."TerraqoProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "operationKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "targetWorklogId" TEXT NOT NULL,
  "worklogId" TEXT REFERENCES "icc"."TerraqoWorklogEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "originalProjectId" TEXT,
  "originalProjectVersion" TIMESTAMP(3),
  "resultVersion" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NativeWorklogOperation_digest_check" CHECK ("id" ~ '^[a-f0-9]{64}$' AND "operationKey" ~ '^[a-f0-9]{32}$' AND "fingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "NativeWorklogOperation_binding_check" CHECK ("actorId" ~ '^[A-Za-z0-9_-]{1,100}$' AND "workspaceId" ~ '^[A-Za-z0-9_-]{1,100}$' AND "professionalProfileId" ~ '^[A-Za-z0-9_-]{1,100}$' AND "targetWorklogId" ~ '^[A-Za-z0-9_-]{1,100}$' AND ("worklogId" IS NULL OR "worklogId" = "targetWorklogId")),
  CONSTRAINT "NativeWorklogOperation_project_check" CHECK (("originalProjectId" IS NULL AND "originalProjectVersion" IS NULL) OR ("originalProjectId" IS NOT NULL AND "originalProjectId" ~ '^c[a-z0-9]{24}$' AND "originalProjectVersion" IS NOT NULL)),
  CONSTRAINT "NativeWorklogOperation_version_check" CHECK ("resultVersion" = "createdAt")
);
CREATE UNIQUE INDEX IF NOT EXISTS "NativeWorklogOperation_actor_workspace_operation_key" ON "icc"."TerraqoNativeWorklogOperation"("actorId","workspaceId","operationKey");
CREATE UNIQUE INDEX IF NOT EXISTS "NativeWorklogOperation_target_key" ON "icc"."TerraqoNativeWorklogOperation"("targetWorklogId");
CREATE UNIQUE INDEX IF NOT EXISTS "NativeWorklogOperation_worklog_key" ON "icc"."TerraqoNativeWorklogOperation"("worklogId");
CREATE INDEX IF NOT EXISTS "NativeWorklogOperation_profile_created_idx" ON "icc"."TerraqoNativeWorklogOperation"("professionalProfileId","createdAt");
CREATE INDEX IF NOT EXISTS "NativeWorklogOperation_workspace_created_idx" ON "icc"."TerraqoNativeWorklogOperation"("workspaceId","createdAt");
CREATE TABLE IF NOT EXISTS "icc"."TerraqoNativeWorklogAccounting" (
  "operationId" TEXT NOT NULL PRIMARY KEY REFERENCES "icc"."TerraqoNativeWorklogOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NativeWorklogAccounting_state_check" CHECK ("state" IN ('PENDING','APPLIED','QUARANTINED')),
  CONSTRAINT "NativeWorklogAccounting_attempts_check" CHECK ("attempts" >= 0),
  CONSTRAINT "NativeWorklogAccounting_completion_check" CHECK (("state" = 'APPLIED' AND "completedAt" IS NOT NULL) OR ("state" <> 'APPLIED' AND "completedAt" IS NULL))
);
CREATE INDEX IF NOT EXISTS "NativeWorklogAccounting_state_due_idx" ON "icc"."TerraqoNativeWorklogAccounting"("state","nextAttemptAt");
