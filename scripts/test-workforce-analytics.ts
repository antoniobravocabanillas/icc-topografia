import assert from "node:assert/strict";
import { calculateWorkforceMetric, estimateApprovedOvertimeAmount } from "../lib/terraqo/workforce-analytics";

const schedule = { timezone: "America/Lima", workDays: [1, 2, 3, 4, 5], startTime: "08:00", toleranceMinutes: 10, saturdayStartTime: null };
const events = [
  { id: "in-1", userId: "u1", type: "CHECK_IN" as const, capturedAt: new Date("2026-09-28T13:05:00Z"), projectId: null, context: "PERSONAL_FIELD" as const },
  { id: "out-1", userId: "u1", type: "CHECK_OUT" as const, capturedAt: new Date("2026-09-28T22:00:00Z"), projectId: null, context: "PERSONAL_FIELD" as const },
  { id: "in-2", userId: "u1", type: "CHECK_IN" as const, capturedAt: new Date("2026-09-29T13:25:00Z"), projectId: null, context: "PERSONAL_FIELD" as const },
  { id: "out-2", userId: "u1", type: "CHECK_OUT" as const, capturedAt: new Date("2026-09-29T22:00:00Z"), projectId: null, context: "PERSONAL_FIELD" as const },
  { id: "in-3", userId: "u1", type: "CHECK_IN" as const, capturedAt: new Date("2026-09-30T13:00:00Z"), projectId: null, context: "PERSONAL_FIELD" as const },
  { id: "out-3", userId: "u1", type: "CHECK_OUT" as const, capturedAt: new Date("2026-09-30T22:00:00Z"), projectId: null, context: "PERSONAL_FIELD" as const },
];

const metric = calculateWorkforceMetric({
  events,
  schedule,
  approvals: events.filter((event) => event.type === "CHECK_IN").map((event) => ({ checkInEventId: event.id, regularMinutes: 480, additionalDetectedMinutes: 30, additionalApprovedMinutes: 30, status: "APPROVED" as const })),
  verifiedEvidenceCount: 3,
  incidentCount: 0,
});

assert.equal(metric.completedJourneyCount, 3);
assert.equal(metric.onTimeCount, 2);
assert.equal(metric.lateCount, 1);
assert.equal(metric.lateMinutes, 15);
assert.equal(metric.punctualityRate, 67);
assert.equal(metric.additionalApprovedMinutes, 90);
assert.ok(metric.recognitionScore !== null);
assert.equal(estimateApprovedOvertimeAmount(180, 10), 38.5);
console.log("workforce analytics: ok");
