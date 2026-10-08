import assert from "node:assert/strict";
import { builderContributionAdminSelect, builderContributionSummarySelect, presentBuilderContribution } from "../lib/server/builder-contribution-presentation";

const entry = {
  id: "own-presentation-only", type: "FIRST_WORKLOG" as const, status: "IN_REVIEW" as const,
  title: "Primera bitácora útil", requestedPoints: 25, approvedPoints: 0, createdAt: new Date("2026-10-08T00:00:00.000Z"),
  detail: "native-first-worklog-v1:" + "a".repeat(64), reviewNote: null,
  user: { name: "Own presentation", email: "own@example.invalid", image: null },
};
const output = presentBuilderContribution({ ...entry, sourceKey: "first-worklog:own", actorId: "own", operationId: "a".repeat(64) } as typeof entry);
assert.equal(output.detail, "Aporte asociado a la primera bitácora profesional.");
assert.equal(output.approvedPoints, 0);
assert.equal(output.status, "IN_REVIEW");
assert.ok(!JSON.stringify(output).includes("native-first-worklog-v1:"));
assert.ok(!JSON.stringify(output).includes("a".repeat(64)));
assert.ok(!("sourceKey" in output) && !("operationId" in output) && !("actorId" in output));
assert.equal(presentBuilderContribution({ ...entry, detail: "native-first-worklog-v1:malformed" }).detail, output.detail);
assert.equal(presentBuilderContribution({ ...entry, detail: "Detalle ordinario del aporte." }).detail, "Detalle ordinario del aporte.");
assert.equal(entry.detail, "native-first-worklog-v1:" + "a".repeat(64));
for (const key of ["detail", "sourceKey", "reviewNote", "userId", "workspaceId", "reviewerId"]) {
  assert.ok(!(key in builderContributionSummarySelect));
}
for (const key of ["sourceKey", "userId", "workspaceId", "reviewerId"]) assert.ok(!(key in builderContributionAdminSelect));
console.log("PASS builder contribution presentation: internal reservation hidden, bounded selectors, ordinary detail preserved; no SQL/accounting/UI flow.");
