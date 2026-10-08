import assert from "node:assert/strict";
import { nativeWorklogContentKey } from "../lib/server/native-worklog-content-key";
import { parseNativeWorklogPayload } from "../lib/server/native-worklog-payload";
import { decideNativeDeclaredWorklog, NativeWorklogBaseDecisionError } from "../lib/server/native-worklog-base-decision";

async function main() {
  const payload = { operationKey: "a".repeat(32), title: "Own work", summary: "Own summary ".repeat(8).trim(),
    outcome: "Own result", type: "FIELD_UPDATE", projectId: "c" + "a".repeat(24),
    projectVersion: "2026-10-08T00:00:00.000Z" };
  const parse = (data = payload) => parseNativeWorklogPayload(new Request("https://example.invalid/own", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data),
  }));
  const parsed = await parse();
  const counts = { priorDuplicates: 0, rewardedInDay: 2, trustedInWindow: 9 };
  const before = JSON.stringify({ payload, counts });
  const decision = decideNativeDeclaredWorklog(parsed, "2026-10-08T04:59:59.999Z", counts);
  assert.equal(decision.dayStart, "2026-10-07T05:00:00.000Z");
  assert.equal(decision.dayEndExclusive, "2026-10-08T05:00:00.000Z");
  assert.equal(decision.trustStartInclusive, "2026-10-01T04:59:59.999Z");
  assert.equal(decision.trustEndInclusive, decision.createdAt);
  assert.equal(decision.availableAt, "2026-10-15T04:59:59.999Z");
  assert.equal(decision.tqPoints, 1); assert.equal(decision.trustScore, 1);
  assert.equal(decision.qualityScore, 70); assert.equal(decision.moderationStatus, "DECLARED");
  assert.ok(Object.isFrozen(decision)); assert.equal(JSON.stringify({ payload, counts }), before);
  assert.throws(() => Object.assign(decision, { tqPoints: 100 }));
  assert.equal(decideNativeDeclaredWorklog(parsed, "2026-10-08T05:00:00.000Z", counts).dayStart, "2026-10-08T05:00:00.000Z");
  const daily = decideNativeDeclaredWorklog(parsed, decision.createdAt, { ...counts, rewardedInDay: 3 });
  assert.equal(daily.tqPoints, 0); assert.equal(daily.trustScore, 1); assert.equal(daily.riskScore, 20);
  const weekly = decideNativeDeclaredWorklog(parsed, decision.createdAt, { ...counts, trustedInWindow: 10 });
  assert.equal(weekly.tqPoints, 1); assert.equal(weekly.trustScore, 0); assert.equal(weekly.riskScore, 15);
  const both = decideNativeDeclaredWorklog(parsed, decision.createdAt, { ...counts, rewardedInDay: 3, trustedInWindow: 10 });
  assert.equal(both.tqPoints + both.trustScore, 0); assert.equal(both.riskScore, 20);
  const duplicate = decideNativeDeclaredWorklog(parsed, decision.createdAt, { priorDuplicates: 1, rewardedInDay: 3, trustedInWindow: 10 });
  assert.equal(duplicate.tqPoints + duplicate.trustScore, 0);
  assert.equal(duplicate.moderationStatus, "DUPLICATE"); assert.equal(duplicate.riskScore, 90);
  for (const key of Object.keys(counts) as (keyof typeof counts)[])
    for (const invalid of [-1, 0.5, NaN, Infinity, 2_147_483_648])
      assert.throws(() => decideNativeDeclaredWorklog(parsed, decision.createdAt, { ...counts, [key]: invalid }), NativeWorklogBaseDecisionError);
  for (const date of ["invalid", "2026-02-30T00:00:00.000Z", "2026-10-08T05:00:00Z", "1999-12-31T23:59:59.999Z"])
    assert.throws(() => decideNativeDeclaredWorklog(parsed, date, counts), NativeWorklogBaseDecisionError);
  const minimal = await parse({ ...payload, title: "Own!", summary: "Own minimal summary text", outcome: "", projectId: "", projectVersion: "" });
  assert.equal(decideNativeDeclaredWorklog(minimal, decision.createdAt, counts).qualityScore, 15);
  // Exact replay data retains its digest; operationKey alone cannot change content adjudication.
  const replay = await parse({ ...payload, operationKey: "b".repeat(32) });
  assert.deepEqual(decideNativeDeclaredWorklog(replay, decision.createdAt, counts), decision);
  assert.throws(() => decideNativeDeclaredWorklog({ ...parsed }, decision.createdAt, counts), NativeWorklogBaseDecisionError);
  const tampered = await parse();
  assert.throws(() => Object.assign(tampered, { fingerprint: "0".repeat(64) }));
  assert.throws(() => decideNativeDeclaredWorklog({ ...tampered, fingerprint: "0".repeat(64) }, decision.createdAt, counts), NativeWorklogBaseDecisionError);
  counts.rewardedInDay = 99;
  assert.equal(nativeWorklogContentKey({ title: "Bitácora ICC", summary: "Trabajo   propio", projectId: "" }),
    nativeWorklogContentKey({ title: "BITACORA ICC", summary: "TRABAJO propio", projectId: "" }));
  assert.notEqual(nativeWorklogContentKey({ title: "ICC", summary: "Trabajo", projectId: "" }),
    nativeWorklogContentKey({ title: "ICC", summary: "Trabajo", projectId: "proyecto" }));
  assert.equal(decision.rewardedInDay, 2); assert.equal(decision.tqPoints, 1);
  console.log("PASS native declared base policy: boundaries, quota/duplicate precedence, provenance, immutable replay; controlled values only, no SQL/awards.");
}
main().catch((error: unknown) => {
  const line = error instanceof Error ? error.stack?.match(/test-native-worklog-base-decision\.ts:[0-9]+:[0-9]+/)?.[0] : undefined;
  console.error(JSON.stringify({ outcome: "failed", line })); process.exitCode = 1;
});
