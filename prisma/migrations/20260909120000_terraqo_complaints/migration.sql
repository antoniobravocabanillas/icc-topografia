CREATE TABLE "icc"."TerraqoComplaint" (
 "id" SERIAL PRIMARY KEY, "keyHash" TEXT NOT NULL UNIQUE, "payloadHash" TEXT NOT NULL,
 "payload" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "dueAt" TIMESTAMP(3) NOT NULL, "response" TEXT, "respondedAt" TIMESTAMP(3), "responseActor" TEXT, "postalEvidence" TEXT
);
CREATE TABLE "icc"."TerraqoComplaintEvent" (
 "id" TEXT PRIMARY KEY,"complaintId" INTEGER NOT NULL REFERENCES "icc"."TerraqoComplaint"("id") ON DELETE RESTRICT,
 "action" TEXT NOT NULL,"actor" TEXT,"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "TerraqoComplaintEvent_complaintId_createdAt_idx" ON "icc"."TerraqoComplaintEvent"("complaintId","createdAt");
CREATE TABLE "icc"."TerraqoComplaintMail" (
 "id" TEXT PRIMARY KEY,"complaintId" INTEGER NOT NULL REFERENCES "icc"."TerraqoComplaint"("id") ON DELETE RESTRICT,
 "kind" TEXT NOT NULL,"recipient" TEXT NOT NULL,"text" TEXT NOT NULL,"sentAt" TIMESTAMP(3),"providerId" TEXT,
 "attempts" INTEGER NOT NULL DEFAULT 0,"nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,"lastError" TEXT,
 CONSTRAINT "TerraqoComplaintMail_complaintId_kind_key" UNIQUE ("complaintId","kind")
);
CREATE INDEX "TerraqoComplaintMail_sentAt_nextAttemptAt_idx" ON "icc"."TerraqoComplaintMail"("sentAt","nextAttemptAt");
