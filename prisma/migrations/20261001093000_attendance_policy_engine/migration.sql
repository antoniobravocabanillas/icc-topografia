-- Attendance policy engine: flexible geofences, auditable automatic decisions,
-- privacy-preserving connection signals, and a current work assignment.
CREATE TYPE "icc"."TerraqoGeofencePolicy" AS ENUM ('FIXED_RADIUS', 'LOCATION_ONLY');
CREATE TYPE "icc"."TerraqoAttendanceDecisionSource" AS ENUM ('SYSTEM', 'MANAGER');

ALTER TABLE "icc"."Project"
  ADD COLUMN "geofencePolicy" "icc"."TerraqoGeofencePolicy" NOT NULL DEFAULT 'FIXED_RADIUS';

ALTER TABLE "icc"."TerraqoAttendanceEvent"
  ADD COLUMN "networkFingerprint" TEXT,
  ADD COLUMN "userAgentFingerprint" TEXT,
  ADD COLUMN "riskFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "icc"."TerraqoWorkRelationship"
  ADD COLUMN "currentProjectId" TEXT;

ALTER TABLE "icc"."TerraqoAttendanceApproval"
  ADD COLUMN "decisionSource" "icc"."TerraqoAttendanceDecisionSource" NOT NULL DEFAULT 'SYSTEM',
  ADD COLUMN "requiresReview" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "riskFlags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE INDEX "TerraqoWorkRelationship_currentProjectId_idx"
  ON "icc"."TerraqoWorkRelationship"("currentProjectId");

ALTER TABLE "icc"."TerraqoWorkRelationship"
  ADD CONSTRAINT "TerraqoWorkRelationship_currentProjectId_fkey"
  FOREIGN KEY ("currentProjectId") REFERENCES "icc"."Project"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
