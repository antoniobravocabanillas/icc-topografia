BEGIN;
SET LOCAL search_path = icc, pg_catalog;
-- CreateTable
CREATE TABLE "TerraqoCertificateDisclosure" (
    "id" TEXT NOT NULL,
    "certificateId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "destination" TEXT NOT NULL,
    "recipientUserId" TEXT,
    "recipientEmail" TEXT,
    "expiresAt" TIMESTAMP(3),
    "snapshot" JSONB NOT NULL,
    "digest" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerraqoCertificateDisclosure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TerraqoCertificateDisclosureEvent" (
    "id" TEXT NOT NULL,
    "disclosureId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "party" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TerraqoCertificateDisclosureEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TerraqoCertificateDisclosure_certificateId_createdAt_idx" ON "TerraqoCertificateDisclosure"("certificateId", "createdAt");

-- CreateIndex
CREATE INDEX "TerraqoCertificateDisclosure_recipientUserId_idx" ON "TerraqoCertificateDisclosure"("recipientUserId");

-- CreateIndex
CREATE INDEX "TerraqoCertificateDisclosureEvent_disclosureId_createdAt_idx" ON "TerraqoCertificateDisclosureEvent"("disclosureId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TerraqoCertificateDisclosureEvent_actorId_operationKey_key" ON "TerraqoCertificateDisclosureEvent"("actorId", "operationKey");

-- AddForeignKey
ALTER TABLE "TerraqoCertificateDisclosure" ADD CONSTRAINT "TerraqoCertificateDisclosure_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "TerraqoCollaborationCertificate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerraqoCertificateDisclosure" ADD CONSTRAINT "TerraqoCertificateDisclosure_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerraqoCertificateDisclosure" ADD CONSTRAINT "TerraqoCertificateDisclosure_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerraqoCertificateDisclosureEvent" ADD CONSTRAINT "TerraqoCertificateDisclosureEvent_disclosureId_fkey" FOREIGN KEY ("disclosureId") REFERENCES "TerraqoCertificateDisclosure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TerraqoCertificateDisclosureEvent" ADD CONSTRAINT "TerraqoCertificateDisclosureEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DISCLOSURE_GUARDS (also rehearsed after local schema bootstrap)
ALTER TABLE icc."TerraqoCertificateDisclosure" ADD CONSTRAINT "certificate_disclosure_audience" CHECK (
  (destination = 'PUBLIC' AND "recipientUserId" IS NULL AND "recipientEmail" IS NULL AND "expiresAt" IS NULL) OR
  (destination = 'INVITED' AND "recipientUserId" IS NOT NULL AND "recipientEmail" IS NOT NULL AND "expiresAt" IS NOT NULL AND "expiresAt" > "createdAt")
);
ALTER TABLE icc."TerraqoCertificateDisclosure" ADD CONSTRAINT "certificate_disclosure_digest" CHECK (digest ~ '^[a-f0-9]{64}$');
ALTER TABLE icc."TerraqoCertificateDisclosureEvent" ADD CONSTRAINT "certificate_disclosure_event_kind" CHECK (
  party IN ('WORKSPACE', 'PROFESSIONAL') AND action IN ('CREATE', 'APPROVE', 'REVOKE') AND digest ~ '^[a-f0-9]{64}$' AND fingerprint ~ '^[a-f0-9]{64}$'
);
CREATE FUNCTION icc.certificate_disclosure_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, icc AS $$
BEGIN
  RAISE EXCEPTION 'certificate disclosure and consent history are immutable' USING ERRCODE='23514';
END;
$$;
CREATE TRIGGER certificate_disclosure_immutable BEFORE UPDATE ON icc."TerraqoCertificateDisclosure"
FOR EACH ROW EXECUTE FUNCTION icc.certificate_disclosure_immutable();
CREATE TRIGGER certificate_disclosure_event_immutable BEFORE UPDATE ON icc."TerraqoCertificateDisclosureEvent"
FOR EACH ROW EXECUTE FUNCTION icc.certificate_disclosure_immutable();
CREATE FUNCTION icc.certificate_disclosure_event_guard() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, icc AS $$
DECLARE target icc."TerraqoCertificateDisclosure"%ROWTYPE;
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'serializable disclosure transaction required' USING ERRCODE='23514';
  END IF;
  SELECT * INTO target FROM icc."TerraqoCertificateDisclosure" WHERE id=NEW."disclosureId" FOR UPDATE;
  IF NOT FOUND OR target.digest <> NEW.digest THEN
    RAISE EXCEPTION 'consent digest mismatch' USING ERRCODE='23514';
  END IF;
  IF NEW.action='APPROVE' AND (target."expiresAt" <= (clock_timestamp() AT TIME ZONE 'UTC') OR EXISTS (
    SELECT 1 FROM icc."TerraqoCertificateDisclosureEvent" WHERE "disclosureId"=target.id AND action='REVOKE'
  )) THEN
    RAISE EXCEPTION 'disclosure expired or revoked' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER certificate_disclosure_event_guard BEFORE INSERT ON icc."TerraqoCertificateDisclosureEvent"
FOR EACH ROW EXECUTE FUNCTION icc.certificate_disclosure_event_guard();
COMMIT;
