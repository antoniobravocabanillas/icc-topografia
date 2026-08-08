DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'TerraqoProfileEntryVerificationStatus' AND n.nspname = 'icc'
  ) THEN
    CREATE TYPE "icc"."TerraqoProfileEntryVerificationStatus" AS ENUM ('NOT_REQUESTED', 'REQUESTED', 'APPROVED', 'REJECTED');
  END IF;
END $$;

ALTER TABLE "icc"."TerraqoProfessionalProfile"
  ADD COLUMN IF NOT EXISTS "generatedSummary" TEXT,
  ADD COLUMN IF NOT EXISTS "generatedSummaryUpdatedAt" TIMESTAMP(3);

ALTER TABLE "icc"."TerraqoProfessionalExperience"
  ADD COLUMN IF NOT EXISTS "country" TEXT DEFAULT 'PE',
  ADD COLUMN IF NOT EXISTS "locationSubdivisionCode" TEXT,
  ADD COLUMN IF NOT EXISTS "locationCity" TEXT,
  ADD COLUMN IF NOT EXISTS "currentlyWorking" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "verificationStatus" "icc"."TerraqoProfileEntryVerificationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  ADD COLUMN IF NOT EXISTS "verificationRequestedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "validatorUserId" TEXT,
  ADD COLUMN IF NOT EXISTS "validatorName" TEXT,
  ADD COLUMN IF NOT EXISTS "validatorEmail" TEXT;

CREATE TABLE IF NOT EXISTS "icc"."TerraqoProfessionalEducation" (
  "id" TEXT NOT NULL,
  "professionalProfileId" TEXT NOT NULL,
  "institution" TEXT NOT NULL,
  "degree" TEXT NOT NULL,
  "field" TEXT,
  "country" TEXT DEFAULT 'PE',
  "locationSubdivisionCode" TEXT,
  "locationCity" TEXT,
  "startedAt" TIMESTAMP(3),
  "endedAt" TIMESTAMP(3),
  "currentlyStudying" BOOLEAN NOT NULL DEFAULT false,
  "visibility" "icc"."TerraqoVisibility" NOT NULL DEFAULT 'PRIVATE',
  "verificationStatus" "icc"."TerraqoProfileEntryVerificationStatus" NOT NULL DEFAULT 'NOT_REQUESTED',
  "verificationRequestedAt" TIMESTAMP(3),
  "validatorUserId" TEXT,
  "validatorName" TEXT,
  "validatorEmail" TEXT,
  "evidence" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoProfessionalEducation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TerraqoProfessionalEducation_professionalProfileId_fkey"
    FOREIGN KEY ("professionalProfileId") REFERENCES "icc"."TerraqoProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "TerraqoProfessionalExperience_professionalProfileId_verificationStatus_idx"
  ON "icc"."TerraqoProfessionalExperience"("professionalProfileId", "verificationStatus");
CREATE INDEX IF NOT EXISTS "TerraqoProfessionalExperience_validatorUserId_verificationStatus_idx"
  ON "icc"."TerraqoProfessionalExperience"("validatorUserId", "verificationStatus");
CREATE INDEX IF NOT EXISTS "TerraqoProfessionalExperience_country_locationSubdivisionCode_locationCity_idx"
  ON "icc"."TerraqoProfessionalExperience"("country", "locationSubdivisionCode", "locationCity");

CREATE INDEX IF NOT EXISTS "TerraqoProfessionalEducation_professionalProfileId_startedAt_idx"
  ON "icc"."TerraqoProfessionalEducation"("professionalProfileId", "startedAt");
CREATE INDEX IF NOT EXISTS "TerraqoProfessionalEducation_professionalProfileId_verificationStatus_idx"
  ON "icc"."TerraqoProfessionalEducation"("professionalProfileId", "verificationStatus");
CREATE INDEX IF NOT EXISTS "TerraqoProfessionalEducation_validatorUserId_verificationStatus_idx"
  ON "icc"."TerraqoProfessionalEducation"("validatorUserId", "verificationStatus");
CREATE INDEX IF NOT EXISTS "TerraqoProfessionalEducation_country_locationSubdivisionCode_locationCity_idx"
  ON "icc"."TerraqoProfessionalEducation"("country", "locationSubdivisionCode", "locationCity");
