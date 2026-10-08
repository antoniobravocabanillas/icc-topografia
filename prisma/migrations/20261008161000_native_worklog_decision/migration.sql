-- Additive native declared decision. No migration ledger reconciliation or apply caller.
CREATE UNIQUE INDEX "NativeWorklogOperation_decision_binding_key" ON icc."TerraqoNativeWorklogOperation"("id","createdAt","fingerprint");
CREATE TABLE icc."TerraqoNativeWorklogDecision" (
  "operationId" TEXT NOT NULL PRIMARY KEY,
  "policyVersion" TEXT NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "dayStart" TIMESTAMP(3) NOT NULL,
  "dayEndExclusive" TIMESTAMP(3) NOT NULL,
  "trustStartInclusive" TIMESTAMP(3) NOT NULL,
  "trustEndInclusive" TIMESTAMP(3) NOT NULL,
  "availableAt" TIMESTAMP(3) NOT NULL,
  "priorDuplicates" INTEGER NOT NULL,
  "rewardedInDay" INTEGER NOT NULL,
  "trustedInWindow" INTEGER NOT NULL,
  "tqPoints" INTEGER NOT NULL,
  "trustScore" INTEGER NOT NULL,
  "qualityScore" INTEGER NOT NULL,
  "moderationStatus" TEXT NOT NULL,
  "riskScore" INTEGER NOT NULL,
  CONSTRAINT "NativeWorklogDecision_receipt_fk" FOREIGN KEY ("operationId","createdAt","fingerprint")
    REFERENCES icc."TerraqoNativeWorklogOperation"("id","createdAt","fingerprint") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "NativeWorklogDecision_policy_check" CHECK ("policyVersion"='native-declared-lima-v1'),
  CONSTRAINT "NativeWorklogDecision_counts_check" CHECK ("priorDuplicates">=0 AND "rewardedInDay">=0 AND "trustedInWindow">=0),
  CONSTRAINT "NativeWorklogDecision_windows_check" CHECK (
    "createdAt">=TIMESTAMP '2000-01-01 00:00:00' AND "createdAt"<=TIMESTAMP '9998-12-31 00:00:00' AND
    "dayStart"=date_trunc('day',"createdAt"-INTERVAL '5 hours')+INTERVAL '5 hours' AND
    "dayEndExclusive"="dayStart"+INTERVAL '1 day' AND
    "trustStartInclusive"="createdAt"-INTERVAL '7 days' AND "trustEndInclusive"="createdAt" AND
    "availableAt"="createdAt"+INTERVAL '7 days'),
  CONSTRAINT "NativeWorklogDecision_awards_check" CHECK (
    "tqPoints"=CASE WHEN "priorDuplicates">0 OR "rewardedInDay">=3 THEN 0 ELSE 1 END AND
    "trustScore"=CASE WHEN "priorDuplicates">0 OR "trustedInWindow">=10 THEN 0 ELSE 1 END),
  CONSTRAINT "NativeWorklogDecision_presentation_check" CHECK (
    "moderationStatus"=CASE WHEN "priorDuplicates">0 THEN 'DUPLICATE' ELSE 'DECLARED' END AND
    "riskScore"=CASE WHEN "priorDuplicates">0 THEN 90 WHEN "rewardedInDay">=3 THEN 20 WHEN "trustedInWindow">=10 THEN 15 ELSE 0 END),
  CONSTRAINT "NativeWorklogDecision_quality_check" CHECK ("qualityScore" IN (15,25,30,40,45,55,60,70))
);
CREATE INDEX "NativeWorklogDecision_created_idx" ON icc."TerraqoNativeWorklogDecision"("createdAt");
