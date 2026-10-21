CREATE TYPE icc."TerraqoWorklogLifecycle" AS ENUM ('DRAFT', 'READY', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE icc."TerraqoWorkCaseLifecycle" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE icc."TerraqoWorkCaseRelationshipStatus" AS ENUM ('SUGGESTED', 'CONFIRMED', 'DISMISSED');
CREATE TYPE icc."TerraqoWorkCasePhase" AS ENUM ('PREPARATION', 'EXECUTION', 'RESULT');

ALTER TABLE icc."TerraqoWorklogEntry"
  ADD COLUMN "lifecycle" icc."TerraqoWorklogLifecycle" NOT NULL DEFAULT 'PUBLISHED',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "currentRevisionId" TEXT;

CREATE TABLE icc."TerraqoWorklogCreateOperation" (
  "id" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "worklogId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoWorklogCreateOperation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TerraqoWorklogCreateOperation_worklogId_key" ON icc."TerraqoWorklogCreateOperation"("worklogId");
CREATE UNIQUE INDEX "TerraqoWorklogCreateOperation_actorId_operationKey_key" ON icc."TerraqoWorklogCreateOperation"("actorId", "operationKey");
CREATE INDEX "TerraqoWorklogCreateOperation_actorId_createdAt_idx" ON icc."TerraqoWorklogCreateOperation"("actorId", "createdAt");

CREATE TABLE icc."TerraqoWorklogRevision" (
  "id" TEXT NOT NULL,
  "worklogId" TEXT NOT NULL,
  "revisionNo" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "outcome" TEXT,
  "contributionRole" TEXT,
  "responsibilities" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "methods" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "tools" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "sourceMetadata" JSONB,
  "contentHash" TEXT NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoWorklogRevision_pkey" PRIMARY KEY ("id")
);

INSERT INTO icc."TerraqoWorklogRevision" (
  "id", "worklogId", "revisionNo", "title", "summary", "outcome",
  "contentHash", "createdById", "createdAt"
)
SELECT
  'legacy-' || md5("id"), "id", 1, "title", "summary", "outcome",
  COALESCE("contentFingerprint", md5("title" || '|' || "summary" || '|' || COALESCE("outcome", ''))),
  "authorId", "createdAt"
FROM icc."TerraqoWorklogEntry";

UPDATE icc."TerraqoWorklogEntry" entry
SET "currentRevisionId" = revision."id"
FROM icc."TerraqoWorklogRevision" revision
WHERE revision."worklogId" = entry."id" AND revision."revisionNo" = 1;

CREATE UNIQUE INDEX "TerraqoWorklogEntry_currentRevisionId_key" ON icc."TerraqoWorklogEntry"("currentRevisionId");
CREATE UNIQUE INDEX "TerraqoWorklogRevision_worklogId_revisionNo_key" ON icc."TerraqoWorklogRevision"("worklogId", "revisionNo");
CREATE INDEX "TerraqoWorklogRevision_worklogId_createdAt_idx" ON icc."TerraqoWorklogRevision"("worklogId", "createdAt");
CREATE INDEX "TerraqoWorklogRevision_createdById_createdAt_idx" ON icc."TerraqoWorklogRevision"("createdById", "createdAt");
CREATE INDEX "Worklog_profile_lifecycle_updated_idx" ON icc."TerraqoWorklogEntry"("professionalProfileId", "lifecycle", "updatedAt" DESC);

ALTER TABLE icc."TerraqoWorklogRevision" ADD CONSTRAINT "TerraqoWorklogRevision_worklogId_fkey" FOREIGN KEY ("worklogId") REFERENCES icc."TerraqoWorklogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoWorklogRevision" ADD CONSTRAINT "TerraqoWorklogRevision_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoWorklogEntry" ADD CONSTRAINT "TerraqoWorklogEntry_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES icc."TerraqoWorklogRevision"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoWorklogCreateOperation" ADD CONSTRAINT "TerraqoWorklogCreateOperation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoWorklogCreateOperation" ADD CONSTRAINT "TerraqoWorklogCreateOperation_worklogId_fkey" FOREIGN KEY ("worklogId") REFERENCES icc."TerraqoWorklogEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE icc."TerraqoWorkCase" (
  "id" TEXT NOT NULL,
  "professionalProfileId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "projectId" TEXT,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "lifecycle" icc."TerraqoWorkCaseLifecycle" NOT NULL DEFAULT 'DRAFT',
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "archivedAt" TIMESTAMP(3),
  CONSTRAINT "TerraqoWorkCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE icc."TerraqoWorkCaseRecord" (
  "id" TEXT NOT NULL,
  "workCaseId" TEXT NOT NULL,
  "worklogId" TEXT NOT NULL,
  "phase" icc."TerraqoWorkCasePhase",
  "relationshipStatus" icc."TerraqoWorkCaseRelationshipStatus" NOT NULL DEFAULT 'SUGGESTED',
  "confirmedById" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoWorkCaseRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TerraqoWorkCaseRecord_worklogId_key" ON icc."TerraqoWorkCaseRecord"("worklogId");
CREATE INDEX "TerraqoWorkCase_professionalProfileId_lifecycle_updatedAt_idx" ON icc."TerraqoWorkCase"("professionalProfileId", "lifecycle", "updatedAt");
CREATE INDEX "TerraqoWorkCase_workspaceId_lifecycle_updatedAt_idx" ON icc."TerraqoWorkCase"("workspaceId", "lifecycle", "updatedAt");
CREATE INDEX "TerraqoWorkCase_projectId_idx" ON icc."TerraqoWorkCase"("projectId");
CREATE INDEX "TerraqoWorkCaseRecord_workCaseId_relationshipStatus_created_idx" ON icc."TerraqoWorkCaseRecord"("workCaseId", "relationshipStatus", "createdAt");
CREATE INDEX "TerraqoWorkCaseRecord_confirmedById_idx" ON icc."TerraqoWorkCaseRecord"("confirmedById");

ALTER TABLE icc."TerraqoWorkCase" ADD CONSTRAINT "TerraqoWorkCase_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES icc."TerraqoProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoWorkCase" ADD CONSTRAINT "TerraqoWorkCase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES icc."TerraqoWorkspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoWorkCase" ADD CONSTRAINT "TerraqoWorkCase_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES icc."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoWorkCase" ADD CONSTRAINT "TerraqoWorkCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES icc."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoWorkCaseRecord" ADD CONSTRAINT "TerraqoWorkCaseRecord_workCaseId_fkey" FOREIGN KEY ("workCaseId") REFERENCES icc."TerraqoWorkCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoWorkCaseRecord" ADD CONSTRAINT "TerraqoWorkCaseRecord_worklogId_fkey" FOREIGN KEY ("worklogId") REFERENCES icc."TerraqoWorklogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE icc."TerraqoWorkCaseRecord" ADD CONSTRAINT "TerraqoWorkCaseRecord_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES icc."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
