ALTER TABLE "icc"."TerraqoBuilderAccount"
  ADD COLUMN "trustScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "pendingPoints" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "rewardsFrozenUntil" TIMESTAMP(3);

ALTER TABLE "icc"."TerraqoBuilderContribution"
  ADD COLUMN "availableAt" TIMESTAMP(3),
  ADD COLUMN "releasedAt" TIMESTAMP(3),
  ADD COLUMN "riskScore" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "icc"."TerraqoWorklogEntry"
  ADD COLUMN "qualityScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "trustScoreAwarded" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "tqPointsAwarded" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "contentFingerprint" TEXT,
  ADD COLUMN "moderationStatus" TEXT NOT NULL DEFAULT 'DECLARED',
  ADD COLUMN "moderationNote" TEXT;

CREATE INDEX "TerraqoBuilderAccount_trustScore_idx" ON "icc"."TerraqoBuilderAccount"("trustScore");
CREATE INDEX "TerraqoBuilderContribution_availableAt_releasedAt_idx" ON "icc"."TerraqoBuilderContribution"("availableAt", "releasedAt");
CREATE INDEX "TerraqoWorklogEntry_moderationStatus_createdAt_idx" ON "icc"."TerraqoWorklogEntry"("moderationStatus", "createdAt");
CREATE INDEX "TerraqoWorklogEntry_contentFingerprint_idx" ON "icc"."TerraqoWorklogEntry"("contentFingerprint");
