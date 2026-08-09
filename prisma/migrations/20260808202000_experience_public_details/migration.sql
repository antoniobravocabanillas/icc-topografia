ALTER TABLE "icc"."TerraqoProfessionalExperience"
  ADD COLUMN IF NOT EXISTS "summary" TEXT,
  ADD COLUMN IF NOT EXISTS "highlights" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
