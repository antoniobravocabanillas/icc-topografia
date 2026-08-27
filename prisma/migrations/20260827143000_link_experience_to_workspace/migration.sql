ALTER TABLE "icc"."TerraqoProfessionalExperience"
ADD COLUMN IF NOT EXISTS "workspaceId" TEXT;

CREATE INDEX IF NOT EXISTS "TerraqoProfessionalExperience_workspaceId_idx"
ON "icc"."TerraqoProfessionalExperience"("workspaceId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'TerraqoProfessionalExperience_workspaceId_fkey'
      AND connamespace = 'icc'::regnamespace
  ) THEN
    ALTER TABLE "icc"."TerraqoProfessionalExperience"
    ADD CONSTRAINT "TerraqoProfessionalExperience_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "icc"."TerraqoWorkspace"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
