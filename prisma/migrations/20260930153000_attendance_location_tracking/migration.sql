CREATE TABLE "icc"."TerraqoAttendanceLocationSample" (
    "id" TEXT NOT NULL,
    "attendanceEventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientSampleId" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "accuracyMeters" DOUBLE PRECISION NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerraqoAttendanceLocationSample_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TerraqoAttendanceLocationSample_attendanceEventId_clientSampleId_key"
ON "icc"."TerraqoAttendanceLocationSample"("attendanceEventId", "clientSampleId");

CREATE INDEX "TerraqoAttendanceLocationSample_attendanceEventId_capturedAt_idx"
ON "icc"."TerraqoAttendanceLocationSample"("attendanceEventId", "capturedAt");

CREATE INDEX "TerraqoAttendanceLocationSample_userId_workspaceId_capturedAt_idx"
ON "icc"."TerraqoAttendanceLocationSample"("userId", "workspaceId", "capturedAt");

ALTER TABLE "icc"."TerraqoAttendanceLocationSample"
ADD CONSTRAINT "TerraqoAttendanceLocationSample_attendanceEventId_fkey"
FOREIGN KEY ("attendanceEventId") REFERENCES "icc"."TerraqoAttendanceEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "icc"."TerraqoAttendanceLocationSample"
ADD CONSTRAINT "TerraqoAttendanceLocationSample_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "icc"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "icc"."TerraqoAttendanceLocationSample"
ADD CONSTRAINT "TerraqoAttendanceLocationSample_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "icc"."TerraqoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
