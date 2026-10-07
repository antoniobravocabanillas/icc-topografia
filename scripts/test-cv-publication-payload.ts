import assert from "node:assert/strict";
import { cvPublicationFingerprint, cvPublicationOperationId, parseCvPublicationPayload } from "../lib/server/cv-publication-payload";

const base = { version: "2026-10-07T00:00:00.000Z", operationKey: "a".repeat(32) };
const published = parseCvPublicationPayload({ ...base, action: "PUBLISH", consent: true });
const withdrawn = parseCvPublicationPayload({ ...base, action: "WITHDRAW" });
assert.equal(cvPublicationFingerprint(published), cvPublicationFingerprint(parseCvPublicationPayload({ consent: true, action: "PUBLISH", ...base })));
assert.notEqual(cvPublicationFingerprint(published), cvPublicationFingerprint(withdrawn));
assert.notEqual(cvPublicationFingerprint(published), cvPublicationFingerprint({ ...published, version: "2026-10-07T00:00:00.001Z" }));
const operation = cvPublicationOperationId("owner", "profile", base.operationKey);
assert.notEqual(operation, cvPublicationOperationId("other-owner", "profile", base.operationKey));
assert.notEqual(operation, cvPublicationOperationId("owner", "other-profile", base.operationKey));
assert.notEqual(operation, cvPublicationOperationId("owner", "profile", "b".repeat(32)));
for (const input of [
  { ...base, action: "PUBLISH" }, { ...published, consent: false }, { ...published, consent: "true" },
  { ...withdrawn, consent: true }, { ...published, action: "ALIAS" },
  { ...published, version: "2026-10-07T00:00:00Z" }, { ...published, version: "invalid" },
  { ...published, operationKey: "A".repeat(32) }, { ...published, operationKey: "a".repeat(33) },
  ...["userId", "profileId", "workspaceId", "username", "liveCvVisibility", "bankCci", "url"].map(key => ({ ...published, [key]: "injected" })),
]) assert.throws(() => parseCvPublicationPayload(input));
console.log("PASS CV publication payload: explicit consent, strict bounded fields, canonical versions/keys, stable fingerprints and owner/profile operation isolation. No database or network writes.");
