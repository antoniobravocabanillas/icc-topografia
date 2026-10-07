-- Additive prerequisites only. No upload route or existing education is changed.
CREATE TABLE IF NOT EXISTS "icc"."TerraqoEducationEvidence" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "educationId" TEXT NOT NULL REFERENCES "icc"."TerraqoProfessionalEducation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL CHECK (length("fileName") BETWEEN 1 AND 180),
  "contentType" TEXT NOT NULL CHECK ("contentType" IN ('application/pdf','image/jpeg','image/png','image/webp','image/avif')),
  "size" INTEGER NOT NULL CHECK ("size" BETWEEN 1 AND 4194304),
  "uploadedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("storageKey" ~ '^education-evidence/[A-Za-z0-9_-]{1,100}/[a-f0-9-]{36}$' AND split_part("storageKey",'/',2)="educationId")
);
CREATE UNIQUE INDEX IF NOT EXISTS "TerraqoEducationEvidence_storageKey_key" ON "icc"."TerraqoEducationEvidence"("storageKey");
CREATE INDEX IF NOT EXISTS "TerraqoEducationEvidence_educationId_createdAt_idx" ON "icc"."TerraqoEducationEvidence"("educationId","createdAt");
CREATE INDEX IF NOT EXISTS "TerraqoEducationEvidence_uploadedById_idx" ON "icc"."TerraqoEducationEvidence"("uploadedById");

CREATE TABLE IF NOT EXISTS "icc"."TerraqoEducationEvidenceOperation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "educationId" TEXT NOT NULL REFERENCES "icc"."TerraqoProfessionalEducation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "evidenceId" TEXT REFERENCES "icc"."TerraqoEducationEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "fileName" TEXT NOT NULL CHECK (length("fileName") BETWEEN 1 AND 180),
  "contentType" TEXT NOT NULL CHECK ("contentType" IN ('application/pdf','image/jpeg','image/png','image/webp','image/avif')),
  "size" INTEGER NOT NULL CHECK ("size" BETWEEN 1 AND 4194304),
  "originalVersion" TIMESTAMP(3) NOT NULL,
  "resultVersion" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ("resultVersion">"originalVersion"),
  CHECK ("id" ~ '^[a-f0-9]{64}$' AND "fingerprint" ~ '^[a-f0-9]{64}$' AND "operationKey" ~ '^[a-f0-9]{32}$')
);
CREATE UNIQUE INDEX IF NOT EXISTS "TerraqoEducationEvidenceOperation_educationId_operationKey_key" ON "icc"."TerraqoEducationEvidenceOperation"("educationId","operationKey");
CREATE UNIQUE INDEX IF NOT EXISTS "TerraqoEducationEvidenceOperation_evidenceId_key" ON "icc"."TerraqoEducationEvidenceOperation"("evidenceId");
CREATE INDEX IF NOT EXISTS "TerraqoEducationEvidenceOperation_educationId_createdAt_idx" ON "icc"."TerraqoEducationEvidenceOperation"("educationId","createdAt");

CREATE TABLE IF NOT EXISTS "icc"."TerraqoEducationEvidenceAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "educationId" TEXT NOT NULL REFERENCES "icc"."TerraqoProfessionalEducation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL CHECK ("operationKey" ~ '^[a-f0-9]{32}$'),
  "fingerprint" TEXT NOT NULL CHECK ("fingerprint" ~ '^[a-f0-9]{64}$'),
  "originalVersion" TIMESTAMP(3) NOT NULL,
  "storageKey" TEXT NOT NULL,
  "size" INTEGER NOT NULL CHECK ("size" BETWEEN 1 AND 4194304),
  "reservedUnits" INTEGER NOT NULL DEFAULT 0,
  "state" TEXT NOT NULL DEFAULT 'PREPARED',
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts">=0),
  "nextAttemptAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CHECK ("storageKey" ~ '^education-evidence/[A-Za-z0-9_-]{1,100}/[a-f0-9-]{36}$' AND split_part("storageKey",'/',2)="educationId"),
  CHECK ("state" IN ('PREPARED','RESERVED','COMMITTED','CLEANUP_PENDING','CLEANED','QUARANTINED')),
  CHECK (("state" IN ('PREPARED','CLEANED') AND "reservedUnits"=0)
    OR ("state" IN ('RESERVED','COMMITTED') AND "reservedUnits"=ceil("size"/1000000.0))
    OR ("state" IN ('CLEANUP_PENDING','QUARANTINED') AND "reservedUnits" IN (0,ceil("size"/1000000.0))))
);
CREATE UNIQUE INDEX IF NOT EXISTS "TerraqoEducationEvidenceAttempt_storageKey_key" ON "icc"."TerraqoEducationEvidenceAttempt"("storageKey");
CREATE INDEX IF NOT EXISTS "TerraqoEducationEvidenceAttempt_educationId_createdAt_idx" ON "icc"."TerraqoEducationEvidenceAttempt"("educationId","createdAt");
CREATE INDEX IF NOT EXISTS "TerraqoEducationEvidenceAttempt_state_nextAttemptAt_idx" ON "icc"."TerraqoEducationEvidenceAttempt"("state","nextAttemptAt");
