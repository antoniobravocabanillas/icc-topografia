import assert from "node:assert/strict";
import { buildEvidenceReadWhere } from "../lib/terraqo/evidence-policy";
import { projectEvidenceValidations } from "../lib/terraqo/evidence-dto";

const owner = buildEvidenceReadWhere({
  audience: "OWNER",
  professionalProfileId: "profile-owner",
  liveCvEnabled: false,
});
assert.deepEqual(owner, {
  professionalProfileId: "profile-owner",
  deletedAt: null,
});

const publicScope = buildEvidenceReadWhere({
  audience: "PUBLIC",
  professionalProfileId: "profile-public",
  liveCvEnabled: true,
});
assert.deepEqual(publicScope, {
  professionalProfileId: "profile-public",
  deletedAt: null,
  visibility: "PUBLIC",
});

const member = buildEvidenceReadWhere({
  audience: "MEMBER",
  professionalProfileId: "profile-member",
  liveCvEnabled: false,
  workspaceIds: ["workspace-a"],
});
assert.deepEqual(member, {
  professionalProfileId: "profile-member",
  deletedAt: null,
  OR: [
    { visibility: "COMMUNITY" },
    {
      visibility: "WORKSPACE",
      workspaceId: { in: ["workspace-a"] },
    },
  ],
});

const memberWithPublicProfile = buildEvidenceReadWhere({
  audience: "MEMBER",
  professionalProfileId: "profile-member",
  liveCvEnabled: true,
  workspaceIds: [],
});
assert.deepEqual(memberWithPublicProfile, {
  professionalProfileId: "profile-member",
  deletedAt: null,
  OR: [{ visibility: "PUBLIC" }, { visibility: "COMMUNITY" }],
});

const validations = [
  {
    id: "approved",
    status: "APPROVED",
    requestNote: "Nota interna de solicitud",
    responseNote: "Validado en campo",
    requestedAt: new Date("2026-10-20T10:00:00.000Z"),
    resolvedAt: new Date("2026-10-20T11:00:00.000Z"),
    validator: { name: "Supervisor", image: null },
  },
  {
    id: "rejected",
    status: "REJECTED",
    requestNote: "Motivo privado",
    responseNote: "Requiere corrección",
    requestedAt: new Date("2026-10-20T12:00:00.000Z"),
    resolvedAt: new Date("2026-10-20T13:00:00.000Z"),
    validator: { name: "Supervisor", image: null },
  },
];
const publicValidations = projectEvidenceValidations(validations, "PUBLIC");
assert.deepEqual(publicValidations.map((validation) => validation.id), ["approved"]);
assert.equal("requestNote" in publicValidations[0]!, false, "La nota interna no debe salir en público.");
assert.equal("status" in publicValidations[0]!, false, "El flujo interno no debe salir en público.");
const ownerValidations = projectEvidenceValidations(validations, "OWNER");
assert.equal(ownerValidations.length, 2, "El propietario conserva el flujo completo.");
assert.equal("requestNote" in ownerValidations[0]!, true);

console.log("Evidence audience policy checks passed.");
