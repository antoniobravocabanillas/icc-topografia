import assert from "node:assert/strict";
import {
  conversationWorkspaceScope,
  messageOperationFingerprint,
  projectConversationContext,
} from "../lib/terraqo/messaging";
import {
  terraqoConversationRequestCreateSchema,
  terraqoConversationRequestDecisionSchema,
} from "../lib/validations/terraqo";

const dossierId = "cm12345678901234567890123";

assert.equal(
  terraqoConversationRequestCreateSchema.safeParse({
    dossierId,
    note: "Quisieramos conversar sobre una posible colaboracion.",
  }).success,
  true,
);
assert.equal(
  terraqoConversationRequestDecisionSchema.safeParse({
    action: "ACCEPT",
    expectedVersion: 1,
  }).success,
  true,
);
assert.equal(
  terraqoConversationRequestDecisionSchema.safeParse({
    action: "BLOCK",
    expectedVersion: 1,
  }).success,
  false,
  "Bloquear exige una razon auditable.",
);
assert.equal(
  terraqoConversationRequestDecisionSchema.safeParse({
    action: "REPORT",
    expectedVersion: 1,
    reason: "Solicitud insistente no relacionada.",
  }).success,
  true,
);

const firstFingerprint = messageOperationFingerprint("conversation-1", " Hola ");
assert.equal(
  firstFingerprint,
  messageOperationFingerprint("conversation-1", "Hola"),
  "Un reintento equivalente debe conservar la huella.",
);
assert.notEqual(
  firstFingerprint,
  messageOperationFingerprint("conversation-1", "Otro mensaje"),
  "La misma clave no puede representar contenido distinto.",
);

const sourceContext = {
  id: "context-1",
  kind: "EVALUATION",
  referenceId: dossierId,
  labelSnapshot: "Evaluacion interna: Topografo de obra",
  createdAt: new Date("2026-10-18T00:00:00.000Z"),
};
const protectedContext = projectConversationContext(sourceContext, false);
assert.equal(protectedContext.referenceId, null);
assert.equal(protectedContext.labelSnapshot, "Contexto profesional protegido");
assert.equal(protectedContext.protected, true);
const authorizedContext = projectConversationContext(sourceContext, true);
assert.equal(authorizedContext.referenceId, dossierId);
assert.equal(authorizedContext.labelSnapshot, sourceContext.labelSnapshot);
assert.equal(authorizedContext.protected, false);

assert.deepEqual(conversationWorkspaceScope(["workspace-a"]), {
  OR: [
    { workspaceId: null },
    { workspaceId: { in: ["workspace-a"] } },
  ],
}, "El hub solo debe incluir conversaciones personales o de membresías activas.");
assert.deepEqual(conversationWorkspaceScope(["workspace-a"], "workspace-a"), {
  workspaceId: "workspace-a",
});

console.log("Contextual messaging contract checks passed.");
