BEGIN;

-- CreateEnum
CREATE TYPE "icc"."TerraqoWorkspaceInvitationRole" AS ENUM ('OWNER', 'ADMIN', 'MANAGER', 'MEMBER', 'VIEWER', 'CLIENT', 'PROFESSIONAL', 'EVALUATOR');

-- Cast the stored values in place. Dropping and recreating role would silently
-- turn historical invitations into VIEWER memberships. A reverse cast to the
-- old enum must reject EVALUATOR; never supply a fallback membership role.
ALTER TABLE "icc"."TerraqoWorkspaceInvitation" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "icc"."TerraqoWorkspaceInvitation"
    ALTER COLUMN "role" TYPE "icc"."TerraqoWorkspaceInvitationRole"
    USING "role"::text::"icc"."TerraqoWorkspaceInvitationRole";
ALTER TABLE "icc"."TerraqoWorkspaceInvitation"
    ALTER COLUMN "role" SET DEFAULT 'VIEWER',
    ADD COLUMN "canReadEvaluations" BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT "workspace_invitation_evaluator_permission"
        CHECK (NOT "canReadEvaluations" OR "role" = 'EVALUATOR');

-- CreateTable
CREATE TABLE "icc"."TerraqoWorkspaceEvaluator" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "canReadEvaluations" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerraqoWorkspaceEvaluator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icc"."TerraqoWorkspaceEvaluatorAssignment" (
    "workspaceId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,

    CONSTRAINT "TerraqoWorkspaceEvaluatorAssignment_pkey" PRIMARY KEY ("workspaceId","evaluatorId","dossierId")
);

-- CreateIndex
CREATE INDEX "TerraqoWorkspaceEvaluator_userId_active_idx" ON "icc"."TerraqoWorkspaceEvaluator"("userId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoWorkspaceEvaluator_workspaceId_userId_key" ON "icc"."TerraqoWorkspaceEvaluator"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoWorkspaceEvaluator_workspaceId_id_key" ON "icc"."TerraqoWorkspaceEvaluator"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "TerraqoWorkspaceEvaluatorAssignment_workspaceId_dossierId_idx" ON "icc"."TerraqoWorkspaceEvaluatorAssignment"("workspaceId", "dossierId");

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoEvaluationDossier_workspaceId_id_key" ON "icc"."TerraqoEvaluationDossier"("workspaceId", "id");

-- AddForeignKey
ALTER TABLE "icc"."TerraqoWorkspaceEvaluator" ADD CONSTRAINT "TerraqoWorkspaceEvaluator_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "icc"."TerraqoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icc"."TerraqoWorkspaceEvaluator" ADD CONSTRAINT "TerraqoWorkspaceEvaluator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "icc"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icc"."TerraqoWorkspaceEvaluatorAssignment" ADD CONSTRAINT "TerraqoWorkspaceEvaluatorAssignment_workspaceId_evaluatorI_fkey" FOREIGN KEY ("workspaceId", "evaluatorId") REFERENCES "icc"."TerraqoWorkspaceEvaluator"("workspaceId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "icc"."TerraqoWorkspaceEvaluatorAssignment" ADD CONSTRAINT "TerraqoWorkspaceEvaluatorAssignment_workspaceId_dossierId_fkey" FOREIGN KEY ("workspaceId", "dossierId") REFERENCES "icc"."TerraqoEvaluationDossier"("workspaceId", "id") ON DELETE CASCADE ON UPDATE RESTRICT;

COMMIT;
