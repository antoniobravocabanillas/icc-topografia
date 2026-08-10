CREATE TABLE IF NOT EXISTS "icc"."TerraqoProfessionalSocialLink" (
  "id" TEXT NOT NULL,
  "professionalProfileId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "label" TEXT,
  "url" TEXT NOT NULL,
  "visibility" "icc"."TerraqoVisibility" NOT NULL DEFAULT 'PUBLIC',
  "position" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TerraqoProfessionalSocialLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TerraqoProfessionalSocialLink_professionalProfileId_visibility_position_idx"
  ON "icc"."TerraqoProfessionalSocialLink"("professionalProfileId", "visibility", "position");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'TerraqoProfessionalSocialLink_professionalProfileId_fkey'
  ) THEN
    ALTER TABLE "icc"."TerraqoProfessionalSocialLink"
      ADD CONSTRAINT "TerraqoProfessionalSocialLink_professionalProfileId_fkey"
      FOREIGN KEY ("professionalProfileId")
      REFERENCES "icc"."TerraqoProfessionalProfile"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END $$;
