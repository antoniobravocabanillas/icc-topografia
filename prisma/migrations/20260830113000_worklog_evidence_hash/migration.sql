ALTER TABLE "icc"."TerraqoWorklogMedia" ADD COLUMN "sha256" TEXT;
CREATE INDEX "TerraqoWorklogMedia_sha256_idx" ON "icc"."TerraqoWorklogMedia"("sha256");
