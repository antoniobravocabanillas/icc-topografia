CREATE TYPE "icc"."TerraqoWorkRelationshipStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUSPENDED', 'ENDED');
CREATE TYPE "icc"."TerraqoCompensationSource" AS ENUM ('COMPANY', 'PERSONAL');
CREATE TYPE "icc"."TerraqoCompensationFrequency" AS ENUM ('MONTHLY', 'DAILY', 'HOURLY');
CREATE TYPE "icc"."TerraqoAdditionalHoursPolicy" AS ENUM ('REQUIRES_APPROVAL', 'AUTOMATIC', 'TIME_OFF', 'NOT_APPLICABLE');
CREATE TYPE "icc"."TerraqoAttendanceReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED');
CREATE TYPE "icc"."TerraqoAttendanceAdjustmentType" AS ENUM ('MISSING_CHECK_IN', 'MISSING_CHECK_OUT', 'WRONG_TIME', 'WRONG_PROJECT', 'OTHER');
CREATE TYPE "icc"."TerraqoAttendanceAdjustmentStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'CANCELLED');

CREATE TABLE "icc"."TerraqoWorkRelationship" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "memberId" TEXT NOT NULL,
  "status" "icc"."TerraqoWorkRelationshipStatus" NOT NULL DEFAULT 'DRAFT',
  "area" TEXT,
  "contractType" TEXT,
  "modality" TEXT,
  "workSite" TEXT,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "configuredByUserId" TEXT,
  "confirmedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoWorkRelationship_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "icc"."TerraqoWorkSchedule" (
  "id" TEXT NOT NULL,
  "workRelationshipId" TEXT NOT NULL,
  "timezone" TEXT NOT NULL DEFAULT 'America/Lima',
  "jurisdictionCountry" TEXT NOT NULL DEFAULT 'PE',
  "workDays" INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5]::INTEGER[],
  "startTime" TEXT NOT NULL DEFAULT '08:00',
  "endTime" TEXT NOT NULL DEFAULT '17:00',
  "breakMinutes" INTEGER NOT NULL DEFAULT 60,
  "toleranceMinutes" INTEGER NOT NULL DEFAULT 10,
  "saturdayStartTime" TEXT,
  "saturdayEndTime" TEXT,
  "saturdayBreakMinutes" INTEGER NOT NULL DEFAULT 0,
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoWorkSchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "icc"."TerraqoCompensationPolicy" (
  "id" TEXT NOT NULL,
  "workRelationshipId" TEXT NOT NULL,
  "source" "icc"."TerraqoCompensationSource" NOT NULL DEFAULT 'COMPANY',
  "currency" TEXT NOT NULL DEFAULT 'PEN',
  "baseAmount" DECIMAL(12,2) NOT NULL,
  "frequency" "icc"."TerraqoCompensationFrequency" NOT NULL DEFAULT 'MONTHLY',
  "paymentDay" INTEGER,
  "additionalHoursPolicy" "icc"."TerraqoAdditionalHoursPolicy" NOT NULL DEFAULT 'REQUIRES_APPROVAL',
  "hourlyReferenceAmount" DECIMAL(12,4),
  "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "effectiveTo" TIMESTAMP(3),
  "confirmedAt" TIMESTAMP(3),
  "createdByUserId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoCompensationPolicy_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "icc"."TerraqoAttendanceApproval" (
  "id" TEXT NOT NULL,
  "workRelationshipId" TEXT NOT NULL,
  "checkInEventId" TEXT NOT NULL,
  "checkOutEventId" TEXT,
  "regularMinutes" INTEGER NOT NULL DEFAULT 0,
  "additionalDetectedMinutes" INTEGER NOT NULL DEFAULT 0,
  "additionalApprovedMinutes" INTEGER NOT NULL DEFAULT 0,
  "status" "icc"."TerraqoAttendanceReviewStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedByUserId" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoAttendanceApproval_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "icc"."TerraqoAttendanceAdjustment" (
  "id" TEXT NOT NULL,
  "workRelationshipId" TEXT NOT NULL,
  "attendanceEventId" TEXT,
  "type" "icc"."TerraqoAttendanceAdjustmentType" NOT NULL,
  "status" "icc"."TerraqoAttendanceAdjustmentStatus" NOT NULL DEFAULT 'REQUESTED',
  "requestedCheckInAt" TIMESTAMP(3),
  "requestedCheckOutAt" TIMESTAMP(3),
  "reason" TEXT NOT NULL,
  "requestedByUserId" TEXT NOT NULL,
  "reviewedByUserId" TEXT,
  "reviewNote" TEXT,
  "reviewedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoAttendanceAdjustment_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "icc"."TerraqoAttendanceEvent" ADD COLUMN "workRelationshipId" TEXT;

CREATE UNIQUE INDEX "TerraqoWorkRelationship_memberId_key" ON "icc"."TerraqoWorkRelationship"("memberId");
CREATE INDEX "TerraqoWorkRelationship_workspaceId_status_idx" ON "icc"."TerraqoWorkRelationship"("workspaceId", "status");
CREATE INDEX "TerraqoWorkSchedule_workRelationshipId_effectiveFrom_idx" ON "icc"."TerraqoWorkSchedule"("workRelationshipId", "effectiveFrom");
CREATE INDEX "TerraqoCompensationPolicy_workRelationshipId_source_effectiveFrom_idx" ON "icc"."TerraqoCompensationPolicy"("workRelationshipId", "source", "effectiveFrom");
CREATE UNIQUE INDEX "TerraqoAttendanceApproval_checkInEventId_key" ON "icc"."TerraqoAttendanceApproval"("checkInEventId");
CREATE INDEX "TerraqoAttendanceApproval_workRelationshipId_status_createdAt_idx" ON "icc"."TerraqoAttendanceApproval"("workRelationshipId", "status", "createdAt");
CREATE INDEX "TerraqoAttendanceAdjustment_workRelationshipId_status_createdAt_idx" ON "icc"."TerraqoAttendanceAdjustment"("workRelationshipId", "status", "createdAt");
CREATE INDEX "TerraqoAttendanceAdjustment_attendanceEventId_idx" ON "icc"."TerraqoAttendanceAdjustment"("attendanceEventId");
CREATE INDEX "TerraqoAttendanceEvent_workRelationshipId_capturedAt_idx" ON "icc"."TerraqoAttendanceEvent"("workRelationshipId", "capturedAt");

ALTER TABLE "icc"."TerraqoWorkRelationship" ADD CONSTRAINT "TerraqoWorkRelationship_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "icc"."TerraqoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoWorkRelationship" ADD CONSTRAINT "TerraqoWorkRelationship_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "icc"."TerraqoWorkspaceMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoWorkSchedule" ADD CONSTRAINT "TerraqoWorkSchedule_workRelationshipId_fkey" FOREIGN KEY ("workRelationshipId") REFERENCES "icc"."TerraqoWorkRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoCompensationPolicy" ADD CONSTRAINT "TerraqoCompensationPolicy_workRelationshipId_fkey" FOREIGN KEY ("workRelationshipId") REFERENCES "icc"."TerraqoWorkRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoAttendanceApproval" ADD CONSTRAINT "TerraqoAttendanceApproval_workRelationshipId_fkey" FOREIGN KEY ("workRelationshipId") REFERENCES "icc"."TerraqoWorkRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoAttendanceAdjustment" ADD CONSTRAINT "TerraqoAttendanceAdjustment_workRelationshipId_fkey" FOREIGN KEY ("workRelationshipId") REFERENCES "icc"."TerraqoWorkRelationship"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoAttendanceAdjustment" ADD CONSTRAINT "TerraqoAttendanceAdjustment_attendanceEventId_fkey" FOREIGN KEY ("attendanceEventId") REFERENCES "icc"."TerraqoAttendanceEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoAttendanceEvent" ADD CONSTRAINT "TerraqoAttendanceEvent_workRelationshipId_fkey" FOREIGN KEY ("workRelationshipId") REFERENCES "icc"."TerraqoWorkRelationship"("id") ON DELETE SET NULL ON UPDATE CASCADE;
