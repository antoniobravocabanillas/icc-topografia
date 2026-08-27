CREATE UNIQUE INDEX IF NOT EXISTS "TerraqoProfessionalAffiliation_professionalProfileId_workspaceId_key"
ON "icc"."TerraqoProfessionalAffiliation"("professionalProfileId", "workspaceId");
