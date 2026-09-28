ALTER TABLE "icc"."TerraqoCvImport"
  ADD COLUMN "processingToken" TEXT,
  ADD COLUMN "heartbeatAt" TIMESTAMP(3),
  ADD COLUMN "processingAttempts" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "TerraqoCvImport_status_heartbeatAt_idx"
  ON "icc"."TerraqoCvImport"("status", "heartbeatAt");
