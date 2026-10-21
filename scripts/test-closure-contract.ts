import assert from "node:assert/strict";
import {
  closureDecisionState,
  closureOperationFingerprint,
} from "../lib/terraqo/closure";
import { isWorkspaceResourceReplay } from "../lib/terraqo/idempotency-scope";
import {
  terraqoClosureDecisionSchema,
  terraqoClosureDraftSchema,
  terraqoClosureSubmitSchema,
} from "../lib/validations/terraqo";

const draft = {
  contribution: "Se ejecutó el control topográfico y la entrega documentada del frente norte.",
  deliverables: ["Informe de control", "Plano final"],
  result: "Frente liberado con observaciones registradas.",
  authorizedExcerpt: "Control concluido según el alcance acordado.",
  referenceRevisionIds: [],
  expectedVersion: null,
};

assert.equal(terraqoClosureDraftSchema.safeParse(draft).success, true);
assert.equal(
  terraqoClosureDraftSchema.safeParse({
    ...draft,
    referenceRevisionIds: [
      "cm12345678901234567890123",
      "cm12345678901234567890123",
    ],
  }).success,
  false,
  "El cierre no debe duplicar una referencia exacta.",
);
assert.equal(
  terraqoClosureSubmitSchema.safeParse({ expectedRevisionNo: 1 }).success,
  true,
);
assert.equal(
  terraqoClosureDecisionSchema.safeParse({
    action: "REQUEST_CHANGES",
    expectedRevisionNo: 1,
  }).success,
  false,
  "Solicitar corrección exige comentario.",
);
assert.equal(
  terraqoClosureDecisionSchema.safeParse({
    action: "ACCEPT",
    expectedRevisionNo: 1,
  }).success,
  true,
);

const first = closureOperationFingerprint(draft);
assert.equal(first, closureOperationFingerprint(draft));
assert.notEqual(
  first,
  closureOperationFingerprint({ ...draft, result: "Resultado corregido." }),
);
assert.deepEqual(closureDecisionState("ACCEPT"), {
  revisionStatus: "ACCEPTED",
  collaborationStatus: "CLOSED",
  emitsCertificate: true,
});
assert.deepEqual(closureDecisionState("DECLINE"), {
  revisionStatus: "DECLINED",
  collaborationStatus: "CHANGES_REQUESTED",
  emitsCertificate: false,
});

const closureReplay = {
  workspaceId: "workspace-a",
  resourceId: "collaboration-a",
  operationFingerprint: first,
};
assert.equal(isWorkspaceResourceReplay(closureReplay, closureReplay), true);
assert.equal(isWorkspaceResourceReplay(closureReplay, {
  ...closureReplay,
  workspaceId: "workspace-b",
}), false, "Un cierre no puede reproducirse en otro workspace.");
assert.equal(isWorkspaceResourceReplay(closureReplay, {
  ...closureReplay,
  resourceId: "collaboration-b",
}), false, "Un cierre no puede reproducirse en otra colaboración.");

console.log("Closure contract checks passed.");
