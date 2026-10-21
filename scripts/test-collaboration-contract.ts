import assert from "node:assert/strict";
import {
  collaborationOperationFingerprint,
  proposalDecisionState,
} from "../lib/terraqo/collaboration";
import {
  terraqoCollaborationCreateSchema,
  terraqoCollaborationDecisionSchema,
  terraqoCollaborationRevisionSchema,
} from "../lib/validations/terraqo";

const conversationId = "cm12345678901234567890123";
const proposal = {
  conversationId,
  scope: "Levantamiento y control topográfico del frente norte.",
  roleTitle: "Especialista en levantamiento",
  deliverables: ["Informe de levantamiento", "Plano de control"],
  startsOn: "2026-10-20",
  endsOn: "2026-11-15",
  conditions: "Coordinación diaria con el responsable de campo.",
};

assert.equal(terraqoCollaborationCreateSchema.safeParse(proposal).success, true);
assert.equal(
  terraqoCollaborationCreateSchema.safeParse({
    ...proposal,
    deliverables: ["Plano de control", "plano de CONTROL"],
  }).success,
  false,
  "Una versión no debe duplicar entregables equivalentes.",
);
assert.equal(
  terraqoCollaborationCreateSchema.safeParse({
    ...proposal,
    startsOn: "2026-11-20",
    endsOn: "2026-11-15",
  }).success,
  false,
  "El periodo debe ser coherente.",
);
assert.equal(
  terraqoCollaborationRevisionSchema.safeParse({
    ...proposal,
    conversationId: undefined,
    expectedVersion: 2,
  }).success,
  true,
);
assert.equal(
  terraqoCollaborationDecisionSchema.safeParse({
    action: "REQUEST_CHANGES",
    expectedRevisionNo: 1,
  }).success,
  false,
  "Pedir cambios exige comentario.",
);
assert.equal(
  terraqoCollaborationDecisionSchema.safeParse({
    action: "ACCEPT",
    expectedRevisionNo: 1,
  }).success,
  true,
);

const fingerprint = collaborationOperationFingerprint(proposal);
assert.equal(fingerprint, collaborationOperationFingerprint(proposal));
assert.notEqual(
  fingerprint,
  collaborationOperationFingerprint({ ...proposal, scope: `${proposal.scope} Alcance ampliado.` }),
  "Cambiar el alcance debe producir otra huella y exigir nueva aceptación.",
);
assert.deepEqual(proposalDecisionState("ACCEPT"), {
  proposalStatus: "ACCEPTED",
  collaborationStatus: "ACCEPTED",
});
assert.deepEqual(proposalDecisionState("REJECT"), {
  proposalStatus: "REJECTED",
  collaborationStatus: "CHANGES_REQUESTED",
});

console.log("Collaboration contract checks passed.");
