import assert from "node:assert/strict";
import type { TerraqoCollaborationCertificate } from "@prisma/client";
import { certificateDisclosureFields, prepareCertificateDisclosureSnapshot as prepare } from "../lib/terraqo/certificate-disclosure-snapshot";

const now = new Date("2026-11-20T12:00:00Z");
const certificate: TerraqoCollaborationCertificate = {
  id: "certificate-1", closureId: "closure-1", closureRevisionId: "revision-2",
  workspaceName: "Private company", professionalName: "Private professional", roleTitle: "Inspector",
  scope: "Exact accepted scope", contribution: "Inspection", deliverables: ["Report"], result: "Completed",
  authorizedExcerpt: null, proposalRevisionNo: 1, closureRevisionNo: 2, privateByDefault: true,
  issuedById: "private-issuer", issuedAt: new Date("2026-11-19T12:00:00Z"),
};
const binding = { closureRevisionId: "revision-2", acceptedProposalId: "proposal-1", proposalRevisionNo: 1, closureRevisionNo: 2 };
const request = { destination: "PUBLIC", fields: ["scope", "result"] };
const baseline = prepare(certificate, binding, request, now);
assert.deepEqual(baseline.snapshot.projected, { scope: certificate.scope, result: certificate.result });
for (const field of ["workspaceName", "professionalName", "issuedById", "closureId", "references", "attachments"])
  assert.ok(!(field in baseline.snapshot.projected));
assert.equal(prepare(certificate, binding, { ...request, fields: ["result", "scope"] }, now).digest, baseline.digest);
assert.equal(prepare({ ...certificate, professionalName: "Changed omitted identity" }, binding, request, now).digest, baseline.digest);
assert.notEqual(prepare({ ...certificate, scope: "Changed" }, binding, request, now).digest, baseline.digest);
assert.notEqual(prepare(certificate, { ...binding, acceptedProposalId: "proposal-2" }, request, now).digest, baseline.digest);
const invited = { ...request, destination: "INVITED", recipientUserId: "recipient-1", expiresAt: "2026-11-21T12:00:00Z" };
const invitation = prepare(certificate, binding, invited, now);
assert.notEqual(invitation.digest, baseline.digest);
for (const changed of [{ recipientUserId: "recipient-2" }, { expiresAt: "2026-11-22T12:00:00Z" }])
  assert.notEqual(prepare(certificate, binding, { ...invited, ...changed }, now).digest, invitation.digest);
assert.equal(prepare(certificate, binding, { ...invited, expiresAt: "2026-11-21T07:00:00-05:00" }, now).digest, invitation.digest);
for (const invalid of [
  { ...request, fields: [] }, { ...request, fields: ["scope", "scope"] },
  { ...request, fields: ["issuedById"] }, { ...request, recipientUserId: "extra" },
  { ...request, grant: true }, { ...invited, recipientUserId: "" },
  { ...invited, expiresAt: now.toISOString() }, { ...invited, expiresAt: "bad" },
  { destination: "INVITED", fields: ["scope"] },
]) assert.throws(() => prepare(certificate, binding, invalid, now));
for (const invalid of [{ ...binding, acceptedProposalId: null }, { ...binding, closureRevisionId: "other" },
  { ...binding, proposalRevisionNo: 2 }, { ...binding, closureRevisionNo: 3 }])
  assert.throws(() => prepare(certificate, invalid, request, now));
assert.throws(() => prepare(certificate, binding, request, new Date("invalid")));
assert.throws(() => prepare({ ...certificate, issuedAt: new Date("2026-11-21") }, binding, request, now));
const all = prepare(certificate, binding, { ...request, fields: [...certificateDisclosureFields] }, now);
assert.deepEqual(Object.keys(all.snapshot.projected), [...certificateDisclosureFields]);
assert.equal(all.snapshot.projected.authorizedExcerpt, null);
assert.throws(() => (all.snapshot.projected.deliverables as string[]).push("Cannot mutate source"));
assert.ok(Object.isFrozen(all.snapshot) && Object.isFrozen(all.snapshot.projected) &&
  Object.isFrozen(all.snapshot.fields) && Object.isFrozen(all.snapshot.audience));
assert.deepEqual(certificate.deliverables, ["Report"]);
assert.equal(certificate.privateByDefault, true);
console.log("PASS disclosure preparation: selected-field privacy, canonical digest, recipient/expiry binding, legacy denial and unchanged private certificate; no grant or publication implemented");
