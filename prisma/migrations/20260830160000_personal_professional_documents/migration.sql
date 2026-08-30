ALTER TABLE "icc"."TerraqoProfessionalDocument"
  ALTER COLUMN "workspaceId" DROP NOT NULL;

ALTER TABLE "icc"."TerraqoProfessionalDocument"
  DROP CONSTRAINT IF EXISTS "TerraqoProfessionalDocument_workspaceId_fkey";

ALTER TABLE "icc"."TerraqoProfessionalDocument"
  ADD CONSTRAINT "TerraqoProfessionalDocument_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "icc"."TerraqoWorkspace"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
