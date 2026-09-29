CREATE TYPE "icc"."TerraqoAttendancePeriodStatus" AS ENUM ('OPEN', 'SUBMITTED', 'APPROVED', 'REOPENED');

CREATE TABLE "icc"."TerraqoAttendancePeriod" (
  "id" TEXT NOT NULL,
  "workRelationshipId" TEXT NOT NULL,
  "periodKey" TEXT NOT NULL,
  "status" "icc"."TerraqoAttendancePeriodStatus" NOT NULL DEFAULT 'OPEN',
  "journeyCount" INTEGER NOT NULL DEFAULT 0,
  "regularMinutes" INTEGER NOT NULL DEFAULT 0,
  "additionalDetectedMinutes" INTEGER NOT NULL DEFAULT 0,
  "additionalApprovedMinutes" INTEGER NOT NULL DEFAULT 0,
  "estimatedAdditionalAmount" DECIMAL(12,2),
  "submittedByUserId" TEXT,
  "submittedAt" TIMESTAMP(3),
  "reviewedByUserId" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "reviewNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoAttendancePeriod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TerraqoAttendancePeriod_workRelationshipId_periodKey_key" ON "icc"."TerraqoAttendancePeriod"("workRelationshipId", "periodKey");
CREATE INDEX "TerraqoAttendancePeriod_workRelationshipId_status_periodKey_idx" ON "icc"."TerraqoAttendancePeriod"("workRelationshipId", "status", "periodKey");
ALTER TABLE "icc"."TerraqoAttendancePeriod" ADD CONSTRAINT "TerraqoAttendancePeriod_workRelationshipId_fkey" FOREIGN KEY ("workRelationshipId") REFERENCES "icc"."TerraqoWorkRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
