ALTER TYPE "icc"."TerraqoModuleCode" ADD VALUE IF NOT EXISTS 'BUILDERS';

CREATE TYPE "icc"."TerraqoBuilderContributionType" AS ENUM ('BUG_REPORT', 'SUGGESTION', 'RESEARCH', 'REFERRAL', 'COMPANY_REFERRAL', 'FIRST_WORKLOG', 'EXPERIENCE_VALIDATION', 'BETA_PARTICIPATION');
CREATE TYPE "icc"."TerraqoBuilderContributionStatus" AS ENUM ('RECEIVED', 'IN_REVIEW', 'VALIDATED', 'IMPLEMENTED', 'REJECTED');
CREATE TYPE "icc"."TerraqoBuilderLedgerType" AS ENUM ('CREDIT', 'REDEMPTION', 'ADJUSTMENT', 'REVERSAL');
CREATE TYPE "icc"."TerraqoBuilderRewardCategory" AS ENUM ('PREMIUM', 'VALIDATION', 'VISIBILITY', 'EARLY_ACCESS', 'BADGE');
CREATE TYPE "icc"."TerraqoBuilderRedemptionStatus" AS ENUM ('FULFILLED', 'CANCELLED');

CREATE TABLE "icc"."TerraqoBuilderAccount" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "availablePoints" INTEGER NOT NULL DEFAULT 0,
  "contributionScore" INTEGER NOT NULL DEFAULT 0, "lifetimeEarned" INTEGER NOT NULL DEFAULT 0,
  "validationCredits" INTEGER NOT NULL DEFAULT 0, "profileBoostUntil" TIMESTAMP(3), "earlyAccessUntil" TIMESTAMP(3),
  "premiumUntil" TIMESTAMP(3), "foundingBuilder" BOOLEAN NOT NULL DEFAULT false, "foundingCompany" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoBuilderAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TerraqoBuilderAccount_userId_key" ON "icc"."TerraqoBuilderAccount"("userId");
CREATE INDEX "TerraqoBuilderAccount_contributionScore_idx" ON "icc"."TerraqoBuilderAccount"("contributionScore");
ALTER TABLE "icc"."TerraqoBuilderAccount" ADD CONSTRAINT "TerraqoBuilderAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "icc"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "icc"."TerraqoBuilderContribution" (
  "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "workspaceId" TEXT, "type" "icc"."TerraqoBuilderContributionType" NOT NULL,
  "status" "icc"."TerraqoBuilderContributionStatus" NOT NULL DEFAULT 'RECEIVED', "title" TEXT NOT NULL, "detail" TEXT NOT NULL,
  "sourceKey" TEXT, "requestedPoints" INTEGER NOT NULL DEFAULT 0, "approvedPoints" INTEGER NOT NULL DEFAULT 0,
  "reviewerId" TEXT, "reviewNote" TEXT, "reviewedAt" TIMESTAMP(3), "implementedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoBuilderContribution_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TerraqoBuilderContribution_sourceKey_key" ON "icc"."TerraqoBuilderContribution"("sourceKey");
CREATE INDEX "TerraqoBuilderContribution_userId_status_createdAt_idx" ON "icc"."TerraqoBuilderContribution"("userId", "status", "createdAt");
CREATE INDEX "TerraqoBuilderContribution_status_createdAt_idx" ON "icc"."TerraqoBuilderContribution"("status", "createdAt");
ALTER TABLE "icc"."TerraqoBuilderContribution" ADD CONSTRAINT "TerraqoBuilderContribution_userId_fkey" FOREIGN KEY ("userId") REFERENCES "icc"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "icc"."TerraqoBuilderReward" (
  "id" TEXT NOT NULL, "slug" TEXT NOT NULL, "title" TEXT NOT NULL, "description" TEXT NOT NULL,
  "category" "icc"."TerraqoBuilderRewardCategory" NOT NULL, "pointsCost" INTEGER NOT NULL, "benefitCode" TEXT NOT NULL,
  "durationDays" INTEGER, "quantity" INTEGER NOT NULL DEFAULT 1, "active" BOOLEAN NOT NULL DEFAULT true, "inventory" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoBuilderReward_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TerraqoBuilderReward_slug_key" ON "icc"."TerraqoBuilderReward"("slug");
CREATE INDEX "TerraqoBuilderReward_active_category_pointsCost_idx" ON "icc"."TerraqoBuilderReward"("active", "category", "pointsCost");

CREATE TABLE "icc"."TerraqoBuilderRedemption" (
  "id" TEXT NOT NULL, "accountId" TEXT NOT NULL, "rewardId" TEXT NOT NULL, "pointsCost" INTEGER NOT NULL,
  "status" "icc"."TerraqoBuilderRedemptionStatus" NOT NULL DEFAULT 'FULFILLED', "idempotencyKey" TEXT NOT NULL,
  "benefitEndsAt" TIMESTAMP(3), "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "cancelledAt" TIMESTAMP(3),
  CONSTRAINT "TerraqoBuilderRedemption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TerraqoBuilderRedemption_idempotencyKey_key" ON "icc"."TerraqoBuilderRedemption"("idempotencyKey");
CREATE INDEX "TerraqoBuilderRedemption_accountId_redeemedAt_idx" ON "icc"."TerraqoBuilderRedemption"("accountId", "redeemedAt");
CREATE INDEX "TerraqoBuilderRedemption_rewardId_status_idx" ON "icc"."TerraqoBuilderRedemption"("rewardId", "status");
ALTER TABLE "icc"."TerraqoBuilderRedemption" ADD CONSTRAINT "TerraqoBuilderRedemption_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "icc"."TerraqoBuilderAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoBuilderRedemption" ADD CONSTRAINT "TerraqoBuilderRedemption_rewardId_fkey" FOREIGN KEY ("rewardId") REFERENCES "icc"."TerraqoBuilderReward"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "icc"."TerraqoBuilderLedger" (
  "id" TEXT NOT NULL, "accountId" TEXT NOT NULL, "contributionId" TEXT, "redemptionId" TEXT,
  "type" "icc"."TerraqoBuilderLedgerType" NOT NULL, "pointsDelta" INTEGER NOT NULL, "scoreDelta" INTEGER NOT NULL DEFAULT 0,
  "balanceAfter" INTEGER NOT NULL, "description" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TerraqoBuilderLedger_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TerraqoBuilderLedger_idempotencyKey_key" ON "icc"."TerraqoBuilderLedger"("idempotencyKey");
CREATE INDEX "TerraqoBuilderLedger_accountId_createdAt_idx" ON "icc"."TerraqoBuilderLedger"("accountId", "createdAt");
CREATE INDEX "TerraqoBuilderLedger_contributionId_idx" ON "icc"."TerraqoBuilderLedger"("contributionId");
CREATE INDEX "TerraqoBuilderLedger_redemptionId_idx" ON "icc"."TerraqoBuilderLedger"("redemptionId");
ALTER TABLE "icc"."TerraqoBuilderLedger" ADD CONSTRAINT "TerraqoBuilderLedger_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "icc"."TerraqoBuilderAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoBuilderLedger" ADD CONSTRAINT "TerraqoBuilderLedger_contributionId_fkey" FOREIGN KEY ("contributionId") REFERENCES "icc"."TerraqoBuilderContribution"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoBuilderLedger" ADD CONSTRAINT "TerraqoBuilderLedger_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "icc"."TerraqoBuilderRedemption"("id") ON DELETE SET NULL ON UPDATE CASCADE;
