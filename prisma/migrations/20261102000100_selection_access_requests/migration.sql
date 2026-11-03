-- CreateTable
CREATE TABLE "icc"."TerraqoSelectionAccessRequest" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "targetHash" TEXT NOT NULL,
    "collectionId" TEXT,
    "collectionVersion" INTEGER,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionHash" TEXT,
    "grantId" TEXT,

    CONSTRAINT "TerraqoSelectionAccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoSelectionAccessRequest_grantId_key" ON "icc"."TerraqoSelectionAccessRequest"("grantId");

-- CreateIndex
CREATE INDEX "TerraqoSelectionAccessRequest_requesterId_requestedAt_idx" ON "icc"."TerraqoSelectionAccessRequest"("requesterId", "requestedAt");

-- CreateIndex
CREATE INDEX "TerraqoSelectionAccessRequest_collectionId_status_requested_idx" ON "icc"."TerraqoSelectionAccessRequest"("collectionId", "status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoSelectionAccessRequest_requesterId_targetHash_key" ON "icc"."TerraqoSelectionAccessRequest"("requesterId", "targetHash");

-- AddForeignKey
ALTER TABLE "icc"."TerraqoSelectionAccessRequest" ADD CONSTRAINT "TerraqoSelectionAccessRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "icc"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icc"."TerraqoSelectionAccessRequest" ADD CONSTRAINT "TerraqoSelectionAccessRequest_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "icc"."TerraqoShareCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icc"."TerraqoSelectionAccessRequest" ADD CONSTRAINT "TerraqoSelectionAccessRequest_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "icc"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icc"."TerraqoSelectionAccessRequest" ADD CONSTRAINT "TerraqoSelectionAccessRequest_grantId_fkey" FOREIGN KEY ("grantId") REFERENCES "icc"."TerraqoAccessGrant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Domain invariants; deployment must separately verify the runtime role and no anonymous grants.
ALTER TABLE "icc"."TerraqoSelectionAccessRequest"
  ADD CONSTRAINT "selection_access_request_status" CHECK ("status" IN ('PENDING', 'APPROVED', 'DECLINED')),
  ADD CONSTRAINT "selection_access_request_version" CHECK ("version" > 0),
  ADD CONSTRAINT "selection_access_request_message" CHECK (length("message") <= 500),
  ADD CONSTRAINT "selection_access_request_decision" CHECK (
    ("status" = 'PENDING' AND "decidedAt" IS NULL AND "decidedById" IS NULL AND "grantId" IS NULL AND "decisionHash" IS NULL)
    OR ("status" = 'APPROVED' AND "decidedAt" IS NOT NULL AND "decidedById" IS NOT NULL AND "grantId" IS NOT NULL AND "decisionHash" IS NOT NULL)
    OR ("status" = 'DECLINED' AND "decidedAt" IS NOT NULL AND "decidedById" IS NOT NULL AND "grantId" IS NULL AND "decisionHash" IS NOT NULL)
  );
REVOKE ALL ON TABLE "icc"."TerraqoSelectionAccessRequest" FROM PUBLIC;
