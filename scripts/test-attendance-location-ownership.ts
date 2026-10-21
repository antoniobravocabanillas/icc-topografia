import assert from "node:assert/strict";

import { attendanceLocationOwnership } from "../lib/terraqo/attendance-location-ownership";

assert.equal(attendanceLocationOwnership(null, null), "LEGACY");
assert.equal(attendanceLocationOwnership(null, "new-browser"), "LEGACY");
assert.equal(attendanceLocationOwnership("entry-browser", "entry-browser"), "OWNED");
assert.equal(attendanceLocationOwnership("entry-browser", "other-browser"), "FOREIGN");
assert.equal(attendanceLocationOwnership("entry-browser", null), "FOREIGN");

console.log("Attendance location ownership: OK (legacy compatibility, exact owner, foreign and missing fingerprint fail closed).");
