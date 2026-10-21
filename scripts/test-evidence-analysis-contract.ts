import assert from "node:assert/strict";
import {
  buildEvidenceAnalysisCacheKey,
  EVIDENCE_ANALYSIS_PROVIDER_JSON_SCHEMA,
  EvidenceAnalysisError,
  shouldDispatchEvidenceAnalysisJob,
  validateEvidenceAnalysisOutput,
  type EvidenceAnalysisSource,
} from "../lib/terraqo/evidence-analysis";
import { terraqoAnalysisJobCreateSchema } from "../lib/validations/terraqo";

const revisionId = "cm12345678901234567890123";
const dossierId = "cm22345678901234567890123";
const sourceId = "cm32345678901234567890123";
const contentHash = "a".repeat(64);
const source: EvidenceAnalysisSource = {
  sourceId,
  revisionId,
  contentHash,
  accessKind: "PRIVATE_GRANT",
  fields: {
    title: "Replanteo de ejes estructurales",
    summary: "Se registró el replanteo de ejes previo al vaciado.",
    tools: ["Estación total", "Nivel automático"],
  },
};

assert.equal(EVIDENCE_ANALYSIS_PROVIDER_JSON_SCHEMA.additionalProperties, false);
assert.deepEqual(EVIDENCE_ANALYSIS_PROVIDER_JSON_SCHEMA.required, ["claims", "missing"]);
assert.equal(EVIDENCE_ANALYSIS_PROVIDER_JSON_SCHEMA.properties.claims.items.additionalProperties, false);
assert.deepEqual(
  EVIDENCE_ANALYSIS_PROVIDER_JSON_SCHEMA.properties.claims.items.properties.kind.enum,
  ["EXPLICIT_DATA", "DECLARATION_SUMMARY", "PROPOSED_INTERPRETATION"],
);

assert.equal(terraqoAnalysisJobCreateSchema.safeParse({
  dossierId,
  purpose: "EVIDENCE_SUMMARY",
  sourceRevisionIds: [revisionId],
  expectedPolicies: [{ sourceRevisionId: revisionId, contentHash, accessKind: "PRIVATE_GRANT" }],
}).success, true);

assert.equal(terraqoAnalysisJobCreateSchema.safeParse({
  dossierId,
  purpose: "EVIDENCE_SUMMARY",
  sourceRevisionIds: [revisionId, revisionId],
  expectedPolicies: [{ sourceRevisionId: revisionId, contentHash, accessKind: "PRIVATE_GRANT" }],
}).success, false, "No se deben aceptar revisiones duplicadas.");

const valid = validateEvidenceAnalysisOutput({
  claims: [{
    text: "La evidencia declara un replanteo previo al vaciado.",
    kind: "DECLARATION_SUMMARY",
    citations: [{ sourceId, revisionId, field: "summary", excerpt: "replanteo de ejes previo al vaciado" }],
  }],
  missing: ["No hay respaldo independiente del resultado."],
}, [source]);
assert.equal(valid.claims.length, 1);

assert.throws(
  () => validateEvidenceAnalysisOutput({
    claims: [{
      text: "Capacidad confirmada.",
      kind: "CONFIRMED",
      citations: [{ sourceId, revisionId, field: "summary", excerpt: "replanteo de ejes" }],
    }],
    missing: [],
  }, [source]),
  (error) => error instanceof EvidenceAnalysisError && error.code === "INVALID_ANALYSIS_SCHEMA",
  "La salida no puede promover una declaración a confirmación.",
);

assert.throws(
  () => validateEvidenceAnalysisOutput({
    claims: [{
      text: "Afirmación fuera del expediente.",
      kind: "EXPLICIT_DATA",
      citations: [{ sourceId: "source-outside-scope", revisionId, field: "title", excerpt: "Replanteo de ejes" }],
    }],
    missing: [],
  }, [source]),
  (error) => error instanceof EvidenceAnalysisError && error.code === "CITATION_OUT_OF_SCOPE",
);

assert.throws(
  () => validateEvidenceAnalysisOutput({
    claims: [{
      text: "Cita inventada.",
      kind: "EXPLICIT_DATA",
      citations: [{ sourceId, revisionId, field: "title", excerpt: "levantamiento GNSS nacional" }],
    }],
    missing: [],
  }, [source]),
  (error) => error instanceof EvidenceAnalysisError && error.code === "CITATION_NOT_VERIFIABLE",
);

assert.throws(
  () => validateEvidenceAnalysisOutput(valid, []),
  (error) => error instanceof EvidenceAnalysisError && error.code === "CITATION_OUT_OF_SCOPE",
  "Retirar la fuente debe invalidar todas sus afirmaciones.",
);

const cacheBase = {
  actorId: "actor-1",
  workspaceId: "workspace-1",
  dossierId,
  purpose: "EVIDENCE_SUMMARY" as const,
  policyVersion: "policy-v1",
  sources: [{ revisionId, contentHash, accessKind: "PRIVATE_GRANT", accessReferenceId: "grant-1" }],
};
assert.notEqual(
  buildEvidenceAnalysisCacheKey(cacheBase),
  buildEvidenceAnalysisCacheKey({ ...cacheBase, policyVersion: "policy-v2" }),
  "Cambiar la política debe invalidar la caché.",
);
assert.notEqual(
  buildEvidenceAnalysisCacheKey(cacheBase),
  buildEvidenceAnalysisCacheKey({ ...cacheBase, sources: [{ ...cacheBase.sources[0], contentHash: "b".repeat(64) }] }),
  "Editar una revisión debe invalidar la caché.",
);

assert.deepEqual(validateEvidenceAnalysisOutput({
  claims: [],
  missing: ["No existe evidencia suficiente para responder."],
}, [source]).claims, [], "La abstención debe ser una salida válida.");

assert.equal(shouldDispatchEvidenceAnalysisJob("QUEUED"), true);
assert.equal(shouldDispatchEvidenceAnalysisJob("RETRY_WAIT"), true);
for (const status of ["PROCESSING", "READY", "INSUFFICIENT", "FAILED", "CANCELLED", "SOURCE_REVOKED"]) {
  assert.equal(shouldDispatchEvidenceAnalysisJob(status), false, `No se debe volver a despachar un job ${status}.`);
}

console.log("Evidence analysis contract checks passed.");
