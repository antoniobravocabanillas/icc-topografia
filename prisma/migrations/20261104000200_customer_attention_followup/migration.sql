ALTER TABLE "icc"."ChatConversation"
ADD COLUMN "nextAction" TEXT,
ADD COLUMN "nextActionAt" TIMESTAMP(3),
ADD COLUMN "nextActionCompletedAt" TIMESTAMP(3);
CREATE INDEX "ChatConversation_workspace_followup_idx" ON "icc"."ChatConversation"("terraqoWorkspaceId", "nextActionAt");
