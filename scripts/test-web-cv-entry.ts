import assert from "node:assert/strict";
import { parseCvEntryQuery, webCvEntryEnabled } from "../lib/terraqo/cv-publication-entry";

assert.equal(webCvEntryEnabled(undefined), false);
for (const value of ["false", "1", "TRUE", " true "]) assert.equal(webCvEntryEnabled(value), false);
assert.equal(webCvEntryEnabled("true"), true);
assert.deepEqual(parseCvEntryQuery({ workspaceSlug: "icc-topografia" }), { workspaceSlug: "icc-topografia" });
assert.deepEqual(parseCvEntryQuery({ workspaceSlug: "icc-topografia", document: "01234567-89ab-4cde-8fab-0123456789ab" }), { workspaceSlug: "icc-topografia" });
for (const query of [{}, { workspaceSlug: ["icc-topografia", "other"] }, { workspaceSlug: "../other" },
  { workspaceSlug: "icc-topografia", owner: "other" }, { workspaceSlug: "icc-topografia", operationKey: "a".repeat(32) },
  { workspaceSlug: "icc-topografia", document: "not-a-document" },
  { workspaceSlug: "icc-topografia", document: ["01234567-89ab-4cde-8fab-0123456789ab"] }])
  assert.equal(parseCvEntryQuery(query), null);
console.log("CV entry: disabled by default; strict workspace/document query; no owner or operation selectors.");
