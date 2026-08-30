CREATE TABLE "icc"."TerraqoMessageAttachment" (
  "id" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'FILE',
  "durationMs" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TerraqoMessageAttachment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TerraqoMessageAttachment_storageKey_key" ON "icc"."TerraqoMessageAttachment"("storageKey");
CREATE INDEX "TerraqoMessageAttachment_messageId_createdAt_idx" ON "icc"."TerraqoMessageAttachment"("messageId", "createdAt");
ALTER TABLE "icc"."TerraqoMessageAttachment" ADD CONSTRAINT "TerraqoMessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "icc"."TerraqoDirectMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
