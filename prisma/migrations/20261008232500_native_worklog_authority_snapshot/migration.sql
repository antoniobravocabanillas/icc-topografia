-- Historical creation proof only. Never reconstruct a token or extend a revocable grant.
CREATE UNIQUE INDEX "NativeWorklogOperation_authority_binding_key" ON icc."TerraqoNativeWorklogOperation"("id","actorId","workspaceId","professionalProfileId","createdAt","fingerprint");
CREATE TABLE icc."TerraqoNativeWorklogAuthority" (
  "operationId" TEXT NOT NULL PRIMARY KEY,
  "actorId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "professionalProfileId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL,
  "fingerprint" TEXT NOT NULL,
  "policyVersion" TEXT NOT NULL,
  "grantHash" TEXT NOT NULL,
  "tokenIssuedAt" TIMESTAMP(3) NOT NULL,
  "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
  "grantExpiresAt" TIMESTAMP(3) NOT NULL,
  "paidThrough" TIMESTAMP(3),
  "role" TEXT NOT NULL,
  "modules" TEXT[] NOT NULL,
  CONSTRAINT "NativeWorklogAuthority_receipt_fk" FOREIGN KEY ("operationId","actorId","workspaceId","professionalProfileId","createdAt","fingerprint")
    REFERENCES icc."TerraqoNativeWorklogOperation"("id","actorId","workspaceId","professionalProfileId","createdAt","fingerprint") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "NativeWorklogAuthority_policy_check" CHECK ("policyVersion"='native-creation-authority-v1'),
  CONSTRAINT "NativeWorklogAuthority_scope_check" CHECK ("role"='PROFESSIONAL' AND "modules"=ARRAY['LIVE_CV','PROFESSIONAL_NETWORK']::TEXT[]),
  CONSTRAINT "NativeWorklogAuthority_hash_check" CHECK ("grantHash" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "NativeWorklogAuthority_calendar_check" CHECK (
    "tokenIssuedAt">=TIMESTAMP '2000-01-01 00:00:00' AND "tokenIssuedAt"<="createdAt" AND
    "createdAt"<=TIMESTAMP '9998-12-31 00:00:00' AND
    "tokenExpiresAt"<=TIMESTAMP '9998-12-31 00:00:00' AND "grantExpiresAt"<=TIMESTAMP '9998-12-31 00:00:00' AND
    ("paidThrough" IS NULL OR "paidThrough"<=TIMESTAMP '9998-12-31 00:00:00')),
  CONSTRAINT "NativeWorklogAuthority_valid_at_creation_check" CHECK (
    "tokenExpiresAt">"createdAt" AND "grantExpiresAt">"createdAt" AND
    ("paidThrough" IS NULL OR "paidThrough">"createdAt"))
);
