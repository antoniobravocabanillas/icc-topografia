-- S17 LOCAL PROPOSAL -- NOT APPLIED -- NOT A MIGRATION.
-- Base: f0b34c58c54bd92a9af09d66dc9e199cf43354af.
-- Requires separately authorized disposable PostgreSQL rehearsal before promotion.
-- No backfill, no sharing schema, no client generation. Legacy NULL stays NULL.
-- Atomic, one-shot DDL: intentionally no IF NOT EXISTS / CREATE OR REPLACE.
-- A second execution must fail visibly, not silently accept a divergent definition.
-- This draft ends in ROLLBACK. Even rehearsal is outside this task's permission.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

ALTER TABLE icc."TerraqoClosureRevision" ADD COLUMN "acceptedProposalId" TEXT;
CREATE INDEX "TerraqoClosureRevision_acceptedProposalId_idx"
  ON icc."TerraqoClosureRevision" ("acceptedProposalId");
ALTER TABLE icc."TerraqoClosureRevision"
  ADD CONSTRAINT "TerraqoClosureRevision_acceptedProposalId_fkey"
  FOREIGN KEY ("acceptedProposalId") REFERENCES icc."TerraqoCollaborationProposal" (id)
  ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Cross-table predicate guards need SERIALIZABLE on BOTH sides of a race.
-- Check BEFORE probing for a binding, including when no binding exists yet.
-- A read-committed check-then-write would permit concurrent first binding/mutation.
-- Future callers must retry the WHOLE transaction on 40001/40P01 with the same key.
-- No SECURITY DEFINER, dynamic SQL, trigger bypass, or external side effects.
CREATE FUNCTION icc.s17_require_serializable() RETURNS void
LANGUAGE plpgsql SET search_path = pg_catalog, icc AS $$
BEGIN
  IF current_setting('transaction_isolation') <> 'serializable' THEN
    RAISE EXCEPTION 'S17 provenance predicate writes require SERIALIZABLE'
      USING ERRCODE = '25001';
  END IF;
END;
$$;

CREATE FUNCTION icc.s17_guard_closure_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, icc AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Insert-only binding: also reject NULL -> id, not just id -> other id/NULL.
    -- A legacy revision needs a NEW revision, never retrospective attribution.
    IF NEW."acceptedProposalId" IS DISTINCT FROM OLD."acceptedProposalId" THEN
      RAISE EXCEPTION 'S17 revision provenance is insert-only' USING ERRCODE = '23514';
    END IF;
    IF OLD."acceptedProposalId" IS NOT NULL AND
      (to_jsonb(NEW) - ARRAY['status', 'submitOperationKey', 'submitFingerprint',
        'submittedAt', 'decidedById', 'decisionComment', 'decisionOperationKey',
        'decisionFingerprint', 'decidedAt']) IS DISTINCT FROM
      (to_jsonb(OLD) - ARRAY['status', 'submitOperationKey', 'submitFingerprint',
        'submittedAt', 'decidedById', 'decisionComment', 'decisionOperationKey',
        'decisionFingerprint', 'decidedAt']) THEN
      RAISE EXCEPTION 'S17 bound closure payload is immutable' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."acceptedProposalId" IS NULL THEN RETURN NEW; END IF;
  PERFORM icc.s17_require_serializable();
  -- Validate identity/evidence, not timestamp order. Workspace authority and
  -- current accepted scope / stale-editor intent remain domain-service checks.
  IF NOT EXISTS (
    SELECT 1 FROM icc."TerraqoCollaborationProposal" p
    JOIN icc."TerraqoCollaborationClosure" cl ON cl.id = NEW."closureId"
    JOIN icc."TerraqoCollaboration" c ON c.id = cl."collaborationId"
    JOIN icc."TerraqoCollaborationAcceptance" wa
      ON wa."proposalId" = p.id AND wa.party = 'WORKSPACE'
    JOIN icc."TerraqoCollaborationAcceptance" pa
      ON pa."proposalId" = p.id AND pa.party = 'PROFESSIONAL'
    WHERE p.id = NEW."acceptedProposalId" AND p."collaborationId" = c.id
      AND p.status = 'ACCEPTED'
      AND wa."actorId" = p."createdById"
      AND pa."actorId" = c."professionalUserId"
      AND p."decidedById" = pa."actorId"
  ) THEN
    RAISE EXCEPTION 'S17 requires an accepted proposal from the same collaboration with both party records'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER s17_closure_revision_guard
  BEFORE INSERT OR UPDATE ON icc."TerraqoClosureRevision"
  FOR EACH ROW EXECUTE FUNCTION icc.s17_guard_closure_revision();

CREATE FUNCTION icc.s17_guard_proposal_payload() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, icc AS $$
BEGIN
  -- Status alone is lifecycle, not a rewrite of historical acceptance/content.
  IF (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status') THEN
    PERFORM icc.s17_require_serializable();
    IF EXISTS (SELECT 1 FROM icc."TerraqoClosureRevision"
      WHERE "acceptedProposalId" = OLD.id) THEN
      RAISE EXCEPTION 'S17 bound proposal payload/evidence is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER s17_proposal_payload_guard
  BEFORE UPDATE ON icc."TerraqoCollaborationProposal"
  FOR EACH ROW EXECUTE FUNCTION icc.s17_guard_proposal_payload();
-- No proposal DELETE trigger: the RESTRICT FK already protects live bindings.

CREATE FUNCTION icc.s17_guard_acceptance() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, icc AS $$
DECLARE target_proposal TEXT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
    target_proposal := NEW."proposalId";
  END IF;
  PERFORM icc.s17_require_serializable();
  IF EXISTS (SELECT 1 FROM icc."TerraqoClosureRevision"
    WHERE "acceptedProposalId" = OLD."proposalId"
       OR "acceptedProposalId" = target_proposal) THEN
    RAISE EXCEPTION 'S17 acceptance evidence is pinned by a live closure revision'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER s17_acceptance_guard
  BEFORE UPDATE OR DELETE ON icc."TerraqoCollaborationAcceptance"
  FOR EACH ROW EXECUTE FUNCTION icc.s17_guard_acceptance();
-- INSERT needs no additional guard: binding requires both parties already;
-- existing UNIQUE(proposalId, party) and the two-value enum prevent a third row.

CREATE FUNCTION icc.s17_guard_closure_parent() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, icc AS $$
BEGIN
  IF ROW(NEW.id, NEW."collaborationId") IS DISTINCT FROM ROW(OLD.id, OLD."collaborationId") THEN
    PERFORM icc.s17_require_serializable();
    IF EXISTS (SELECT 1 FROM icc."TerraqoClosureRevision"
      WHERE "closureId" = OLD.id AND "acceptedProposalId" IS NOT NULL) THEN
      RAISE EXCEPTION 'S17 bound closure cannot be reparented' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER s17_closure_parent_guard
  BEFORE UPDATE ON icc."TerraqoCollaborationClosure"
  FOR EACH ROW EXECUTE FUNCTION icc.s17_guard_closure_parent();

CREATE FUNCTION icc.s17_guard_collaboration_parties() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, icc AS $$
BEGIN
  IF ROW(NEW.id, NEW."workspaceId", NEW."professionalUserId", NEW."conversationId")
    IS DISTINCT FROM ROW(OLD.id, OLD."workspaceId", OLD."professionalUserId", OLD."conversationId") THEN
    PERFORM icc.s17_require_serializable();
    IF EXISTS (SELECT 1 FROM icc."TerraqoClosureRevision" r
      JOIN icc."TerraqoCollaborationProposal" p ON p.id = r."acceptedProposalId"
      WHERE p."collaborationId" = OLD.id) THEN
      RAISE EXCEPTION 'S17 bound collaboration parties/context are immutable' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER s17_collaboration_parties_guard
  BEFORE UPDATE ON icc."TerraqoCollaboration"
  FOR EACH ROW EXECUTE FUNCTION icc.s17_guard_collaboration_parties();

CREATE FUNCTION icc.s17_guard_certificate() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, icc AS $$
DECLARE
  r icc."TerraqoClosureRevision"%ROWTYPE;
  p icc."TerraqoCollaborationProposal"%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
    IF EXISTS (SELECT 1 FROM icc."TerraqoClosureRevision"
      WHERE id IN (OLD."closureRevisionId", NEW."closureRevisionId")
        AND "acceptedProposalId" IS NOT NULL) THEN
      RAISE EXCEPTION 'S17 bound certificate is immutable; no reassignment'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW; -- Existing unbound certificate behavior is unchanged.
  END IF;

  SELECT * INTO r FROM icc."TerraqoClosureRevision" WHERE id = NEW."closureRevisionId";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'S17 certificate revision does not exist' USING ERRCODE = '23503';
  END IF;
  IF r."acceptedProposalId" IS NULL THEN RETURN NEW; END IF;
  PERFORM icc.s17_require_serializable();
  SELECT * INTO STRICT p FROM icc."TerraqoCollaborationProposal" WHERE id = r."acceptedProposalId";
  IF r.status <> 'ACCEPTED' OR NOT NEW."privateByDefault" OR
    ROW(NEW."closureId", NEW."proposalRevisionNo", NEW."roleTitle", NEW.scope,
      NEW."closureRevisionNo", NEW.contribution, NEW.deliverables, NEW.result, NEW."authorizedExcerpt")
    IS DISTINCT FROM
    ROW(r."closureId", p."revisionNo", p."roleTitle", p.scope,
      r."revisionNo", r.contribution, r.deliverables, r.result, r."authorizedExcerpt") OR
    NOT EXISTS (SELECT 1 FROM icc."TerraqoCollaboration" c
      WHERE c.id = p."collaborationId" AND c."professionalUserId" = NEW."issuedById") THEN
    RAISE EXCEPTION 'S17 certificate must copy its accepted bound closure and proposal'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER s17_certificate_guard
  BEFORE INSERT OR UPDATE ON icc."TerraqoCollaborationCertificate"
  FOR EACH ROW EXECUTE FUNCTION icc.s17_guard_certificate();

-- Deliberately NO unconditional DELETE guards on certificate/revision/closure.
-- Ordered, fixture-scoped teardown in SERIALIZABLE:
-- certificates -> clear currentRevisionId -> references/revisions -> closures
-- -> acceptances/proposals -> collaboration -> other parents (respect existing FKs).
-- The acceptance DELETE guard stops protecting a source once no live binding exists.
-- No authorization to delete production audit history is implied by this design.
-- Live-reference immutability is not an append-only, tamper-proof audit ledger.
ROLLBACK;
