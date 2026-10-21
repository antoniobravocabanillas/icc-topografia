import assert from "node:assert/strict";

import {
  attendanceLocationIdsToPrune,
  attendanceLocationScope,
  filterAttendanceLocationsForScope,
  selectAttendanceLocationBatch,
  type QueuedAttendanceLocation,
} from "../lib/client/attendance-location-queue";

function sample(
  clientSampleId: string,
  attendanceId: string,
  capturedAt: string,
  scopeKey?: string,
): QueuedAttendanceLocation {
  return {
    attendanceId,
    clientSampleId,
    scopeKey,
    latitude: -12.05,
    longitude: -77.04,
    accuracyMeters: 12,
    capturedAt,
  };
}

const firstScope = attendanceLocationScope("user-a", "/api/terraqo/field-verification?workspaceId=workspace-a");
const sameScope = attendanceLocationScope("user-a", "https://portal.terraqoglobal.com/api/terraqo/field-verification?workspaceId=workspace-a");
const otherUserScope = attendanceLocationScope("user-b", "/api/terraqo/field-verification?workspaceId=workspace-a");
const otherWorkspaceScope = attendanceLocationScope("user-a", "/api/terraqo/field-verification?workspaceId=workspace-b");
assert.equal(firstScope, sameScope);
assert.notEqual(firstScope, otherUserScope);
assert.notEqual(firstScope, otherWorkspaceScope);
assert.throws(() => attendanceLocationScope("", "/api/terraqo/field-verification?workspaceId=workspace-a"));
assert.throws(() => attendanceLocationScope("user-a", "/api/terraqo/field-verification"));

const queued = [
  sample("foreign-user", "attendance-foreign", "2026-10-19T10:00:00.000Z", otherUserScope),
  sample("current-second", "attendance-current", "2026-10-19T10:02:00.000Z", firstScope),
  sample("legacy-current", "attendance-current", "2026-10-19T10:01:00.000Z"),
  sample("legacy-foreign", "attendance-old", "2026-10-19T09:00:00.000Z"),
  sample("current-first", "attendance-current", "2026-10-19T10:00:30.000Z", firstScope),
  sample("same-scope-old", "attendance-old", "2026-10-19T08:00:00.000Z", firstScope),
];

assert.deepEqual(
  selectAttendanceLocationBatch(queued, firstScope, "attendance-current").map((item) => item.clientSampleId),
  ["same-scope-old"],
);
assert.deepEqual(
  selectAttendanceLocationBatch(queued, firstScope, "attendance-current", new Set(["attendance-old"])).map((item) => item.clientSampleId),
  ["current-first", "legacy-current", "current-second"],
);
assert.deepEqual(
  filterAttendanceLocationsForScope(queued, firstScope, "attendance-current").map((item) => item.clientSampleId),
  ["same-scope-old", "current-first", "legacy-current", "current-second"],
);
assert.deepEqual(
  selectAttendanceLocationBatch(queued, otherUserScope, null).map((item) => item.clientSampleId),
  ["foreign-user"],
);
assert.deepEqual(
  selectAttendanceLocationBatch(queued, otherWorkspaceScope, null),
  [],
);

const oversized = Array.from({ length: 1_604 }, (_, index) =>
  sample(`sample-${index}`, "attendance-current", new Date(Date.UTC(2026, 9, 19, 0, index)).toISOString(), firstScope));
assert.deepEqual(
  attendanceLocationIdsToPrune(oversized, 1_500),
  Array.from({ length: 104 }, (_, index) => `sample-${index}`),
);

console.log("Attendance offline queue contract: OK (user/workspace isolation, legacy scoping, non-blocking batches, exact cap pruning).");
