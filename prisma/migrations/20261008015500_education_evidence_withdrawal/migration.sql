-- Separate withdrawal receipts only. Apply through the reviewed additive
-- bootstrap. Never run the unreconciled general Prisma migration ledger.
CREATE TABLE IF NOT EXISTS "icc"."TerraqoEducationEvidenceWithdrawal" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "educationId" TEXT NOT NULL REFERENCES "icc"."TerraqoProfessionalEducation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "actorId" TEXT NOT NULL,
  "operationKey" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "targetEvidenceId" TEXT NOT NULL,
  "uploadOperationId" TEXT NOT NULL REFERENCES "icc"."TerraqoEducationEvidenceOperation"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "attemptId" TEXT NOT NULL REFERENCES "icc"."TerraqoEducationEvidenceAttempt"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "originalVersion" TIMESTAMP(3) NOT NULL,
  "resultVersion" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EducationWithdrawal_digest_check" CHECK ("id" ~ '^[a-f0-9]{64}$' AND "fingerprint" ~ '^[a-f0-9]{64}$' AND "operationKey" ~ '^[a-f0-9]{32}$'),
  CONSTRAINT "EducationWithdrawal_binding_check" CHECK ("educationId" ~ '^[A-Za-z0-9_-]{1,100}$' AND "actorId" ~ '^[A-Za-z0-9_-]{1,100}$' AND "targetEvidenceId" ~ '^[A-Za-z0-9_-]{1,100}$' AND "attemptId" ~ '^[A-Za-z0-9_-]{1,100}$' AND "uploadOperationId" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "EducationWithdrawal_version_check" CHECK ("resultVersion" > "originalVersion")
);
CREATE UNIQUE INDEX IF NOT EXISTS "EducationWithdrawal_education_operation_key" ON "icc"."TerraqoEducationEvidenceWithdrawal"("educationId","operationKey");
CREATE UNIQUE INDEX IF NOT EXISTS "EducationWithdrawal_attempt_key" ON "icc"."TerraqoEducationEvidenceWithdrawal"("attemptId");
CREATE INDEX IF NOT EXISTS "EducationWithdrawal_education_created_idx" ON "icc"."TerraqoEducationEvidenceWithdrawal"("educationId","createdAt");
CREATE INDEX IF NOT EXISTS "EducationWithdrawal_upload_idx" ON "icc"."TerraqoEducationEvidenceWithdrawal"("uploadOperationId");
