-- CreateTable
CREATE TABLE "icc"."TerraqoWorkspaceInvitation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "icc"."TerraqoMemberRole" NOT NULL DEFAULT 'VIEWER',
    "tokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "resendCount" INTEGER NOT NULL DEFAULT 0,
    "lastIssuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "operationKey" TEXT NOT NULL,
    "operationFingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TerraqoWorkspaceInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoWorkspaceInvitation_tokenHash_key" ON "icc"."TerraqoWorkspaceInvitation"("tokenHash");

-- CreateIndex
CREATE INDEX "TerraqoWorkspaceInvitation_workspaceId_email_status_idx" ON "icc"."TerraqoWorkspaceInvitation"("workspaceId", "email", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoWorkspaceInvitation_workspaceId_operationKey_key" ON "icc"."TerraqoWorkspaceInvitation"("workspaceId", "operationKey");

-- AddForeignKey
ALTER TABLE "icc"."TerraqoWorkspaceInvitation" ADD CONSTRAINT "TerraqoWorkspaceInvitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "icc"."TerraqoWorkspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icc"."TerraqoWorkspaceInvitation" ADD CONSTRAINT "TerraqoWorkspaceInvitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "icc"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
