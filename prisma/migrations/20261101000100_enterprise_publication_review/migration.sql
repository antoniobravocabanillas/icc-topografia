-- CreateEnum
CREATE TYPE "icc"."TerraqoPublicationDecision" AS ENUM ('PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'DECLINED');

-- AlterTable
ALTER TABLE "icc"."TerraqoPublicProjection" ADD COLUMN     "snapshot" JSONB;

-- CreateTable
CREATE TABLE "icc"."TerraqoPublicationReview" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "collectionVersion" INTEGER NOT NULL,
    "scopeHash" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "requestedById" TEXT NOT NULL,
    "decision" "icc"."TerraqoPublicationDecision" NOT NULL DEFAULT 'PENDING',
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "comment" TEXT,
    "revokedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerraqoPublicationReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TerraqoPublicationReview_workspaceId_decision_createdAt_idx" ON "icc"."TerraqoPublicationReview"("workspaceId", "decision", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoPublicationReview_collectionId_workspaceId_collectio_key" ON "icc"."TerraqoPublicationReview"("collectionId", "workspaceId", "collectionVersion");

-- AddForeignKey
ALTER TABLE "icc"."TerraqoPublicationReview" ADD CONSTRAINT "TerraqoPublicationReview_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "icc"."TerraqoShareCollection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icc"."TerraqoPublicationReview" ADD CONSTRAINT "TerraqoPublicationReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "icc"."TerraqoWorkspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icc"."TerraqoPublicationReview" ADD CONSTRAINT "TerraqoPublicationReview_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "icc"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icc"."TerraqoPublicationReview" ADD CONSTRAINT "TerraqoPublicationReview_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "icc"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icc"."TerraqoPublicationReview" ADD CONSTRAINT "TerraqoPublicationReview_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "icc"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
