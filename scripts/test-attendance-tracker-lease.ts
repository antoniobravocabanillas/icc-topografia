import assert from "node:assert/strict";

import {
  attendanceTrackerErrorCode,
  claimAttendanceTrackerLease,
  isAttendanceTrackerLeaseOwnedBy,
  releaseAttendanceTrackerLease,
  renewAttendanceTrackerLease,
} from "../lib/client/attendance-tracker-lease";

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const storage = new MemoryStorage();
const key = "terraqo-attendance-tracker:attendance-a";

assert.equal(claimAttendanceTrackerLease(storage, key, "tab-a", 1_000, 75_000), true);
assert.equal(claimAttendanceTrackerLease(storage, key, "tab-b", 2_000, 75_000), false);
assert.equal(isAttendanceTrackerLeaseOwnedBy(storage, key, "tab-a", 2_000), true);
assert.equal(renewAttendanceTrackerLease(storage, key, "tab-b", 3_000, 75_000), false);
assert.equal(renewAttendanceTrackerLease(storage, key, "tab-a", 3_000, 75_000), true);

// Una pestaña en espera puede asumir el seguimiento cuando la propietaria deja expirar su lease.
assert.equal(claimAttendanceTrackerLease(storage, key, "tab-b", 78_001, 75_000), true);
assert.equal(isAttendanceTrackerLeaseOwnedBy(storage, key, "tab-a", 78_001), false);
assert.equal(renewAttendanceTrackerLease(storage, key, "tab-a", 79_000, 75_000), false);

// Una pestaña antigua no puede eliminar la concesión vigente de otra.
assert.equal(releaseAttendanceTrackerLease(storage, key, "tab-a"), false);
assert.equal(isAttendanceTrackerLeaseOwnedBy(storage, key, "tab-b", 79_000), true);
assert.equal(releaseAttendanceTrackerLease(storage, key, "tab-b"), true);
assert.equal(isAttendanceTrackerLeaseOwnedBy(storage, key, "tab-b", 79_000), false);

assert.equal(attendanceTrackerErrorCode({ details: { code: "LOCATION_TRACKER_OWNED_BY_ANOTHER_BROWSER" } }), "LOCATION_TRACKER_OWNED_BY_ANOTHER_BROWSER");
assert.equal(attendanceTrackerErrorCode(new Error("network")), null);

console.log("Attendance tracker lease: OK (single owner, expiry takeover, guarded renew/release and remote-browser classification).");
