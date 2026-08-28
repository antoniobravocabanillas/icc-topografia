ALTER TABLE "icc"."User"
ADD COLUMN IF NOT EXISTS "lastSeenAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "onlineUntil" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "User_onlineUntil_idx"
ON "icc"."User" ("onlineUntil");
