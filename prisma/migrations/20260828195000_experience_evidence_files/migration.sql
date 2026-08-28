CREATE TABLE IF NOT EXISTS "icc"."TerraqoExperienceEvidence" (
  "id" TEXT NOT NULL,
  "experienceId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoExperienceEvidence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TerraqoExperienceEvidence_experienceId_fkey" FOREIGN KEY ("experienceId") REFERENCES "icc"."TerraqoProfessionalExperience"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "TerraqoExperienceEvidence_storageKey_key" ON "icc"."TerraqoExperienceEvidence"("storageKey");
CREATE INDEX IF NOT EXISTS "TerraqoExperienceEvidence_experienceId_createdAt_idx" ON "icc"."TerraqoExperienceEvidence"("experienceId", "createdAt");
CREATE INDEX IF NOT EXISTS "TerraqoExperienceEvidence_uploadedById_idx" ON "icc"."TerraqoExperienceEvidence"("uploadedById");
