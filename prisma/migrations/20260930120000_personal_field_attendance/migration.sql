CREATE TYPE "icc"."TerraqoAttendanceContext" AS ENUM ('PROJECT', 'PERSONAL_FIELD');

ALTER TABLE "icc"."TerraqoAttendanceEvent"
ADD COLUMN "context" "icc"."TerraqoAttendanceContext" NOT NULL DEFAULT 'PROJECT',
ALTER COLUMN "projectId" DROP NOT NULL,
ALTER COLUMN "distanceMeters" DROP NOT NULL,
ALTER COLUMN "geofenceRadiusMeters" DROP NOT NULL;

ALTER TABLE "icc"."TerraqoAttendanceEvent"
DROP CONSTRAINT "TerraqoAttendanceEvent_projectId_fkey";

ALTER TABLE "icc"."TerraqoAttendanceEvent"
ADD CONSTRAINT "TerraqoAttendanceEvent_projectId_fkey"
FOREIGN KEY ("projectId") REFERENCES "icc"."Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "TerraqoAttendanceEvent_professionalProfileId_context_capturedAt_idx"
ON "icc"."TerraqoAttendanceEvent"("professionalProfileId", "context", "capturedAt");
