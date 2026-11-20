-- Proposal only. Run against a disposable database; intentionally rolls back.
BEGIN;

ALTER TABLE icc."TerraqoProfessionalDocument"
  ADD COLUMN "withdrawnAt" TIMESTAMP(3),
  ADD COLUMN "withdrawnByUserId" TEXT,
  ADD COLUMN "withdrawOperationKey" TEXT,
  ADD COLUMN "replacesDocumentId" TEXT,
  ADD COLUMN "replacementOperationKey" TEXT,
  ADD COLUMN "replacementFingerprint" TEXT,
  ADD COLUMN "lifecycleVersion" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "ProfessionalDocument_withdrawal_complete" CHECK (
    ("withdrawnAt" IS NULL AND "withdrawnByUserId" IS NULL AND "withdrawOperationKey" IS NULL)
    OR ("withdrawnAt" IS NOT NULL AND "withdrawnByUserId" IS NOT NULL AND
        "withdrawOperationKey" IS NOT NULL AND length("withdrawOperationKey") BETWEEN 16 AND 128)
  ),
  ADD CONSTRAINT "ProfessionalDocument_lifecycle_positive" CHECK ("lifecycleVersion" > 0),
  ADD CONSTRAINT "ProfessionalDocument_replacement_complete" CHECK (
    ("replacesDocumentId" IS NULL AND "replacementOperationKey" IS NULL AND "replacementFingerprint" IS NULL)
    OR ("replacesDocumentId" IS NOT NULL AND "replacementOperationKey" IS NOT NULL
      AND length("replacementOperationKey") BETWEEN 16 AND 128 AND "replacementFingerprint" IS NOT NULL
      AND "replacementFingerprint" ~ '^[a-f0-9]{64}$')
  ),
  ADD CONSTRAINT "ProfessionalDocument_predecessor_not_self" CHECK ("replacesDocumentId" IS DISTINCT FROM id),
  ADD CONSTRAINT "ProfessionalDocument_predecessor_fk" FOREIGN KEY ("replacesDocumentId")
    REFERENCES icc."TerraqoProfessionalDocument"(id) ON DELETE RESTRICT ON UPDATE RESTRICT;

CREATE UNIQUE INDEX "ProfessionalDocument_single_successor"
  ON icc."TerraqoProfessionalDocument" ("replacesDocumentId") WHERE "replacesDocumentId" IS NOT NULL;
CREATE UNIQUE INDEX "ProfessionalDocument_replacement_operation"
  ON icc."TerraqoProfessionalDocument" ("professionalProfileId", "replacementOperationKey")
  WHERE "replacementOperationKey" IS NOT NULL;

-- Actor is retained as historical attribution, not an ON DELETE SET NULL FK:
-- deleting an account must not produce a partially populated withdrawal record.
CREATE FUNCTION icc.guard_professional_document_lifecycle() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE predecessor icc."TerraqoProfessionalDocument"%ROWTYPE;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."withdrawnAt" IS NOT NULL OR OLD."replacesDocumentId" IS NOT NULL THEN
      RAISE EXCEPTION 'Retained document history requires an explicit purge workflow' USING ERRCODE = '23514';
    END IF;
    RETURN OLD;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW."withdrawnAt" IS NOT NULL OR NEW."lifecycleVersion" <> 1 THEN
      RAISE EXCEPTION 'New documents must start active at lifecycle version one' USING ERRCODE = '23514';
    END IF;
    IF NEW."replacesDocumentId" IS NOT NULL THEN
      SELECT * INTO predecessor FROM icc."TerraqoProfessionalDocument"
        WHERE id = NEW."replacesDocumentId" FOR UPDATE;
      IF NOT FOUND OR predecessor."professionalProfileId" <> NEW."professionalProfileId"
        OR predecessor."workspaceId" IS DISTINCT FROM NEW."workspaceId"
        OR predecessor.type <> NEW.type OR predecessor."withdrawnAt" IS NOT NULL
        OR NEW.type::text IN ('DNI_FRONT', 'DNI_BACK') THEN
        RAISE EXCEPTION 'Invalid document predecessor or scope' USING ERRCODE = '23514';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."replacesDocumentId" IS DISTINCT FROM OLD."replacesDocumentId"
    OR NEW."replacementOperationKey" IS DISTINCT FROM OLD."replacementOperationKey"
    OR NEW."replacementFingerprint" IS DISTINCT FROM OLD."replacementFingerprint"
    OR NEW."professionalProfileId" <> OLD."professionalProfileId"
    OR NEW."workspaceId" IS DISTINCT FROM OLD."workspaceId" OR NEW.type <> OLD.type
    OR NEW."storageKey" <> OLD."storageKey" THEN
    RAISE EXCEPTION 'Document identity and lineage are immutable' USING ERRCODE = '23514';
  END IF;
  IF OLD."withdrawnAt" IS NOT NULL THEN
    IF ROW(NEW."withdrawnAt", NEW."withdrawnByUserId", NEW."withdrawOperationKey", NEW."lifecycleVersion")
      IS DISTINCT FROM ROW(OLD."withdrawnAt", OLD."withdrawnByUserId", OLD."withdrawOperationKey", OLD."lifecycleVersion") THEN
      RAISE EXCEPTION 'Withdrawal cannot be rewritten or restored' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."withdrawnAt" IS NOT NULL THEN
    IF NEW.type::text IN ('DNI_FRONT', 'DNI_BACK') OR NEW."lifecycleVersion" <> OLD."lifecycleVersion" + 1 THEN
      RAISE EXCEPTION 'Invalid withdrawal transition' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."lifecycleVersion" <> OLD."lifecycleVersion" THEN
    RAISE EXCEPTION 'Lifecycle version requires a transition' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "ProfessionalDocument_lifecycle_guard"
  BEFORE INSERT OR UPDATE OR DELETE ON icc."TerraqoProfessionalDocument"
  FOR EACH ROW EXECUTE FUNCTION icc.guard_professional_document_lifecycle();

ROLLBACK;
