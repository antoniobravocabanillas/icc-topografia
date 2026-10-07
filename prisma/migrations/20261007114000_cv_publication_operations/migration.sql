-- Additive only: no existing profile or publication settings are changed.
CREATE TABLE IF NOT EXISTS "icc"."TerraqoCvPublicationOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "professionalProfileId" TEXT NOT NULL REFERENCES "icc"."TerraqoProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "operationKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "action" TEXT NOT NULL CHECK ("action" IN ('PUBLISH', 'WITHDRAW')),
  "originalVersion" TIMESTAMP(3) NOT NULL,
  "resultVersion" TIMESTAMP(3) NOT NULL,
  "published" BOOLEAN NOT NULL,
  "username" TEXT,
  "consentVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("resultVersion" > "originalVersion"),
  CHECK ("id" ~ '^[a-f0-9]{64}$' AND "fingerprint" ~ '^[a-f0-9]{64}$' AND "operationKey" ~ '^[a-f0-9]{32}$'),
  CHECK (("action" = 'PUBLISH' AND "published" = true AND "username" IS NOT NULL AND "consentVersion" IS NOT NULL AND "consentVersion" = 'cv-publication-v1')
    OR ("action" = 'WITHDRAW' AND "published" = false AND "consentVersion" IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS "TerraqoCvPublicationOperation_professionalProfileId_operationKey_key" ON "icc"."TerraqoCvPublicationOperation"("professionalProfileId", "operationKey");
CREATE INDEX IF NOT EXISTS "TerraqoCvPublicationOperation_professionalProfileId_createdAt_idx" ON "icc"."TerraqoCvPublicationOperation"("professionalProfileId", "createdAt");
