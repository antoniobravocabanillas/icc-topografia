ALTER TABLE "icc"."User"
  ADD COLUMN IF NOT EXISTS "identityType" TEXT,
  ADD COLUMN IF NOT EXISTS "identityNumber" TEXT,
  ADD COLUMN IF NOT EXISTS "identityKey" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_identityKey_key"
  ON "icc"."User"("identityKey");
