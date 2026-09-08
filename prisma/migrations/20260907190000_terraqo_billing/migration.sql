-- CreateTable
CREATE TABLE "icc"."TerraqoBillingAccount" (
    "id" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'test',
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "planCode" TEXT NOT NULL,
    "cycle" TEXT NOT NULL DEFAULT 'MONTHLY',
    "status" TEXT NOT NULL DEFAULT 'FREE',
    "customerId" TEXT,
    "subscriptionId" TEXT,
    "currentAttemptId" TEXT,
    "paidThrough" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "nextReconcileAt" TIMESTAMP(3),
    "lastReconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerraqoBillingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icc"."TerraqoBillingPlan" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "providerId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerraqoBillingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icc"."TerraqoBillingAttempt" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "tokenFingerprint" TEXT,
    "planCode" TEXT NOT NULL,
    "planVersion" TEXT NOT NULL,
    "cycle" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "providerPlanId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PREPARED',
    "stage" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "providerCardId" TEXT,
    "providerSubscriptionId" TEXT,
    "errorCode" TEXT,
    "termsVersion" TEXT NOT NULL,
    "consentedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerraqoBillingAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icc"."TerraqoBillingPayment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerChargeId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'PEN',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "refundedMinor" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerraqoBillingPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icc"."TerraqoBillingAudit" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "accountId" TEXT,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerraqoBillingAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icc"."TerraqoUsageBucket" (
    "id" TEXT NOT NULL,
    "ownerKey" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TerraqoUsageBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoBillingAccount_subscriptionId_key" ON "icc"."TerraqoBillingAccount"("subscriptionId");

-- CreateIndex
CREATE INDEX "TerraqoBillingAccount_status_nextReconcileAt_idx" ON "icc"."TerraqoBillingAccount"("status", "nextReconcileAt");

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoBillingAccount_ownerKey_mode_key" ON "icc"."TerraqoBillingAccount"("ownerKey", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoBillingPlan_providerId_key" ON "icc"."TerraqoBillingPlan"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoBillingPlan_code_version_cycle_mode_key" ON "icc"."TerraqoBillingPlan"("code", "version", "cycle", "mode");

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoBillingAttempt_tokenFingerprint_key" ON "icc"."TerraqoBillingAttempt"("tokenFingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoBillingAttempt_providerSubscriptionId_key" ON "icc"."TerraqoBillingAttempt"("providerSubscriptionId");

-- CreateIndex
CREATE INDEX "TerraqoBillingAttempt_status_updatedAt_idx" ON "icc"."TerraqoBillingAttempt"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoBillingAttempt_accountId_idempotencyKey_key" ON "icc"."TerraqoBillingAttempt"("accountId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoBillingPayment_providerChargeId_key" ON "icc"."TerraqoBillingPayment"("providerChargeId");

-- CreateIndex
CREATE INDEX "TerraqoBillingPayment_accountId_paidAt_idx" ON "icc"."TerraqoBillingPayment"("accountId", "paidAt");

-- CreateIndex
CREATE INDEX "TerraqoBillingAudit_accountId_createdAt_idx" ON "icc"."TerraqoBillingAudit"("accountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoUsageBucket_ownerKey_period_metric_key" ON "icc"."TerraqoUsageBucket"("ownerKey", "period", "metric");

-- AddForeignKey
ALTER TABLE "icc"."TerraqoBillingAccount" ADD CONSTRAINT "TerraqoBillingAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "icc"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icc"."TerraqoBillingAccount" ADD CONSTRAINT "TerraqoBillingAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "icc"."TerraqoWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icc"."TerraqoBillingAttempt" ADD CONSTRAINT "TerraqoBillingAttempt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "icc"."TerraqoBillingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icc"."TerraqoBillingPayment" ADD CONSTRAINT "TerraqoBillingPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "icc"."TerraqoBillingAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "icc"."TerraqoBillingAccount" ADD CONSTRAINT "BillingAccount_mode_check" CHECK ("mode" IN ('test','live'));
ALTER TABLE "icc"."TerraqoBillingAccount" ADD CONSTRAINT "BillingAccount_owner_check" CHECK ("ownerKey" = CASE WHEN "workspaceId" IS NULL THEN 'user:' || "userId" ELSE 'workspace:' || "workspaceId" END);
ALTER TABLE "icc"."TerraqoBillingPlan" ADD CONSTRAINT "BillingPlan_amount_check" CHECK ("amountMinor" > 0 AND "currency" = 'PEN' AND "cycle" IN ('MONTHLY','ANNUAL') AND "mode" IN ('test','live'));
ALTER TABLE "icc"."TerraqoBillingAttempt" ADD CONSTRAINT "BillingAttempt_amount_check" CHECK ("amountMinor" > 0 AND "currency" = 'PEN');
ALTER TABLE "icc"."TerraqoBillingPayment" ADD CONSTRAINT "BillingPayment_refund_check" CHECK ("amountMinor" > 0 AND "refundedMinor" >= 0 AND "refundedMinor" <= "amountMinor");
ALTER TABLE "icc"."TerraqoUsageBucket" ADD CONSTRAINT "Usage_nonnegative_check" CHECK ("used" >= 0);
