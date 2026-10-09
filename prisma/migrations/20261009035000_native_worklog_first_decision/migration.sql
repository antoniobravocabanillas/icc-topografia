-- Durable FIRST choice, not a credit or permission to replay an award.
CREATE UNIQUE INDEX "NativeWorklogFirst_contribution_actor_key" ON icc."TerraqoBuilderContribution"("id","userId");
CREATE TABLE icc."TerraqoNativeWorklogFirstDecision" (
  "operationId" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "professionalProfileId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "disposition" TEXT NOT NULL,
  "contributionId" TEXT,
  "priorReceipts" INTEGER NOT NULL,
  "priorEntries" INTEGER NOT NULL,
  CONSTRAINT "NativeWorklogFirstDecision_receipt_fk" FOREIGN KEY ("operationId","actorId","workspaceId","professionalProfileId","createdAt","fingerprint")
    REFERENCES icc."TerraqoNativeWorklogOperation"("id","actorId","workspaceId","professionalProfileId","createdAt","fingerprint") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "NativeWorklogFirstDecision_contribution_fk" FOREIGN KEY ("contributionId","actorId")
    REFERENCES icc."TerraqoBuilderContribution"("id","userId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "NativeWorklogFirstDecision_policy_check" CHECK ("policyVersion"='native-first-decision-v1'),
  CONSTRAINT "NativeWorklogFirstDecision_counts_check" CHECK ("priorReceipts">=0 AND "priorEntries">=0),
  CONSTRAINT "NativeWorklogFirstDecision_choice_check" CHECK (
    ("disposition"='RESERVED' AND "contributionId" IS NOT NULL AND "priorReceipts"=0 AND "priorEntries"=0) OR
    ("disposition"='EXISTING' AND "contributionId" IS NOT NULL) OR
    ("disposition"='INELIGIBLE' AND "contributionId" IS NULL AND ("priorReceipts">0 OR "priorEntries">0)))
);
