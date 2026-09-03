ALTER TABLE "icc"."TerraqoWorklogEntry"
ADD COLUMN "previousWorklogId" TEXT;

CREATE UNIQUE INDEX "TerraqoWorklogEntry_previousWorklogId_key"
ON "icc"."TerraqoWorklogEntry"("previousWorklogId");

CREATE INDEX "TerraqoWorklogEntry_previousWorklogId_idx"
ON "icc"."TerraqoWorklogEntry"("previousWorklogId");

ALTER TABLE "icc"."TerraqoWorklogEntry"
ADD CONSTRAINT "TerraqoWorklogEntry_previousWorklogId_fkey"
FOREIGN KEY ("previousWorklogId")
REFERENCES "icc"."TerraqoWorklogEntry"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
