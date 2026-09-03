ALTER TABLE "icc"."TerraqoWorklogEntry"
  ADD COLUMN "locationLabel" TEXT,
  ADD COLUMN "latitude" DOUBLE PRECISION,
  ADD COLUMN "longitude" DOUBLE PRECISION,
  ADD COLUMN "locationAccuracyMeters" DOUBLE PRECISION,
  ADD COLUMN "locationCapturedAt" TIMESTAMP(3);
