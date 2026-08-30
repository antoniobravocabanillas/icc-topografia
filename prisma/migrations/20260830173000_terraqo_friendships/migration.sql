CREATE TYPE "icc"."TerraqoFriendshipStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED');

CREATE TABLE "icc"."TerraqoFriendship" (
  "id" TEXT NOT NULL,
  "pairKey" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "status" "icc"."TerraqoFriendshipStatus" NOT NULL DEFAULT 'PENDING',
  "respondedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TerraqoFriendship_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TerraqoFriendship_pairKey_key" ON "icc"."TerraqoFriendship"("pairKey");
CREATE INDEX "TerraqoFriendship_requesterId_status_updatedAt_idx" ON "icc"."TerraqoFriendship"("requesterId", "status", "updatedAt");
CREATE INDEX "TerraqoFriendship_recipientId_status_updatedAt_idx" ON "icc"."TerraqoFriendship"("recipientId", "status", "updatedAt");
ALTER TABLE "icc"."TerraqoFriendship" ADD CONSTRAINT "TerraqoFriendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "icc"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "icc"."TerraqoFriendship" ADD CONSTRAINT "TerraqoFriendship_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "icc"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
