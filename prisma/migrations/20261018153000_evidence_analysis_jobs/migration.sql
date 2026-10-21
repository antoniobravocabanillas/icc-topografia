CREATE TYPE "icc"."TerraqoAnalysisJobStatus" AS ENUM (
  'QUEUED',
  'PROCESSING',
  'RETRY_WAIT',
  'READY',
  'INSUFFICIENT',
  'FAILED',
  'CANCELLED',
  'SOURCE_REVOKED'
);

CREATE TYPE "icc"."TerraqoAnalysisClaimKind" AS ENUM (
  'EXPLICIT_DATA',
  'DECLARATION_SUMMARY',
  'PROPOSED_INTERPRETATION'
);

CREATE TABLE "icc"."TerraqoAnalysisJob" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "dossierId" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "status" "icc"."TerraqoAnalysisJobStatus" NOT NULL DEFAULT 'QUEUED',
  "policyVersion" TEXT NOT NULL,
  "promptVersion" TEXT NOT NULL,
  "provider" TEXT,
  "model" TEXT,
  "sourceSetHash" TEXT NOT NULL,
  "cacheKey" TEXT NOT NULL,
  "claims" JSONB,
  "missing" JSONB,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "maxAttempts" INTEGER NOT NULL DEFAULT 2,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "estimatedCostMicros" BIGINT,
  "latencyMs" INTEGER,
  "failureCode" TEXT,
  "nextAttemptAt" TIMESTAMP(3),
  "cancelRequestedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "operationFingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoAnalysisJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "icc"."TerraqoAnalysisJobSource" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "evaluationSourceId" TEXT NOT NULL,
  "worklogRevisionId" TEXT NOT NULL,
  "contentHash" TEXT NOT NULL,
  "accessKind" "icc"."TerraqoEvaluationSourceAccessKind" NOT NULL,
  "accessReferenceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoAnalysisJobSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TerraqoAnalysisJob_createdById_operationKey_key"
  ON "icc"."TerraqoAnalysisJob"("createdById", "operationKey");
CREATE INDEX "TerraqoAnalysisJob_workspaceId_status_createdAt_idx"
  ON "icc"."TerraqoAnalysisJob"("workspaceId", "status", "createdAt");
CREATE INDEX "TerraqoAnalysisJob_createdById_cacheKey_status_createdAt_idx"
  ON "icc"."TerraqoAnalysisJob"("createdById", "cacheKey", "status", "createdAt");
CREATE INDEX "TerraqoAnalysisJob_status_nextAttemptAt_idx"
  ON "icc"."TerraqoAnalysisJob"("status", "nextAttemptAt");
CREATE UNIQUE INDEX "TerraqoAnalysisJobSource_jobId_evaluationSourceId_key"
  ON "icc"."TerraqoAnalysisJobSource"("jobId", "evaluationSourceId");
CREATE INDEX "TerraqoAnalysisJobSource_evaluationSourceId_idx"
  ON "icc"."TerraqoAnalysisJobSource"("evaluationSourceId");
CREATE INDEX "TerraqoAnalysisJobSource_worklogRevisionId_idx"
  ON "icc"."TerraqoAnalysisJobSource"("worklogRevisionId");

ALTER TABLE "icc"."TerraqoAnalysisJob"
  ADD CONSTRAINT "TerraqoAnalysisJob_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "icc"."TerraqoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoAnalysisJob"
  ADD CONSTRAINT "TerraqoAnalysisJob_dossierId_fkey"
  FOREIGN KEY ("dossierId") REFERENCES "icc"."TerraqoEvaluationDossier"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoAnalysisJob"
  ADD CONSTRAINT "TerraqoAnalysisJob_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "icc"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoAnalysisJobSource"
  ADD CONSTRAINT "TerraqoAnalysisJobSource_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "icc"."TerraqoAnalysisJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoAnalysisJobSource"
  ADD CONSTRAINT "TerraqoAnalysisJobSource_evaluationSourceId_fkey"
  FOREIGN KEY ("evaluationSourceId") REFERENCES "icc"."TerraqoEvaluationSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoAnalysisJobSource"
  ADD CONSTRAINT "TerraqoAnalysisJobSource_worklogRevisionId_fkey"
  FOREIGN KEY ("worklogRevisionId") REFERENCES "icc"."TerraqoWorklogRevision"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
