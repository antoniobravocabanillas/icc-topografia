CREATE TYPE "icc"."TerraqoCvImportStatus" AS ENUM ('PROCESSING', 'READY_FOR_REVIEW', 'APPLYING', 'COMPLETED', 'PARTIAL', 'FAILED');
CREATE TYPE "icc"."TerraqoCvImportItemType" AS ENUM ('PROFILE', 'EXPERIENCE', 'EDUCATION', 'SKILL', 'CERTIFICATION', 'SOFTWARE', 'EQUIPMENT');
CREATE TYPE "icc"."TerraqoCvImportItemDecision" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'MERGED', 'APPLIED');

CREATE TABLE "icc"."TerraqoCvImport" (
  "id" TEXT NOT NULL,
  "professionalProfileId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "status" "icc"."TerraqoCvImportStatus" NOT NULL DEFAULT 'PROCESSING',
  "fileHash" TEXT NOT NULL,
  "parserVersion" TEXT NOT NULL,
  "extractor" TEXT NOT NULL,
  "consentForTraining" BOOLEAN NOT NULL DEFAULT false,
  "errorCode" TEXT,
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoCvImport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TerraqoCvImport_professionalProfileId_fkey" FOREIGN KEY ("professionalProfileId") REFERENCES "icc"."TerraqoProfessionalProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TerraqoCvImport_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "icc"."TerraqoProfessionalDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "icc"."TerraqoCvImportItem" (
  "id" TEXT NOT NULL,
  "cvImportId" TEXT NOT NULL,
  "type" "icc"."TerraqoCvImportItemType" NOT NULL,
  "position" INTEGER NOT NULL DEFAULT 0,
  "rawData" JSONB NOT NULL,
  "normalizedData" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "sourcePage" INTEGER,
  "sourceText" TEXT,
  "decision" "icc"."TerraqoCvImportItemDecision" NOT NULL DEFAULT 'PENDING',
  "candidateMatchId" TEXT,
  "createdEntityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoCvImportItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TerraqoCvImportItem_cvImportId_fkey" FOREIGN KEY ("cvImportId") REFERENCES "icc"."TerraqoCvImport"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "icc"."TerraqoCvImportCorrection" (
  "id" TEXT NOT NULL,
  "cvImportItemId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "predictedValue" JSONB,
  "correctedValue" JSONB,
  "accepted" BOOLEAN NOT NULL DEFAULT false,
  "useForTraining" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoCvImportCorrection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TerraqoCvImportCorrection_cvImportItemId_fkey" FOREIGN KEY ("cvImportItemId") REFERENCES "icc"."TerraqoCvImportItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TerraqoCvImport_professionalProfileId_fileHash_parserVersion_key" ON "icc"."TerraqoCvImport"("professionalProfileId", "fileHash", "parserVersion");
CREATE INDEX "TerraqoCvImport_professionalProfileId_createdAt_idx" ON "icc"."TerraqoCvImport"("professionalProfileId", "createdAt");
CREATE INDEX "TerraqoCvImport_status_createdAt_idx" ON "icc"."TerraqoCvImport"("status", "createdAt");
CREATE INDEX "TerraqoCvImportItem_cvImportId_type_position_idx" ON "icc"."TerraqoCvImportItem"("cvImportId", "type", "position");
CREATE INDEX "TerraqoCvImportItem_decision_idx" ON "icc"."TerraqoCvImportItem"("decision");
CREATE INDEX "TerraqoCvImportCorrection_cvImportItemId_createdAt_idx" ON "icc"."TerraqoCvImportCorrection"("cvImportItemId", "createdAt");
CREATE INDEX "TerraqoCvImportCorrection_useForTraining_createdAt_idx" ON "icc"."TerraqoCvImportCorrection"("useForTraining", "createdAt");
