import assert from "node:assert/strict";
import type { TerraqoCompensationPolicy, TerraqoWorkSchedule } from "@prisma/client";

import { calculateJornada } from "../lib/terraqo/jornada";

const schedule = {
  timezone: "America/Lima",
  workDays: [1, 2, 3, 4, 5],
  startTime: "08:00",
  endTime: "17:00",
  breakMinutes: 60,
  saturdayStartTime: null,
  saturdayEndTime: null,
  saturdayBreakMinutes: 0,
} as TerraqoWorkSchedule;

const compensation = { hourlyReferenceAmount: 20 } as unknown as TerraqoCompensationPolicy;
const lima = (clock: string) => new Date(`2026-10-01T${clock}:00-05:00`);

const onSchedule = calculateJornada({ entryAt: lima("08:00"), exitAt: lima("17:00"), schedule, compensation });
assert.deepEqual(
  { regular: onSchedule.regularMinutes, additional: onSchedule.additionalDetectedMinutes },
  { regular: 480, additional: 0 },
  "A complete in-schedule journey must be regular time.",
);

const lateAndExtended = calculateJornada({ entryAt: lima("09:00"), exitAt: lima("19:00"), schedule, compensation });
assert.deepEqual(
  { regular: lateAndExtended.regularMinutes, additional: lateAndExtended.additionalDetectedMinutes },
  { regular: 420, additional: 120 },
  "Time after the schedule must not replace a late regular hour.",
);

const beforeAndAfter = calculateJornada({ entryAt: lima("07:00"), exitAt: lima("18:00"), schedule, compensation });
assert.deepEqual(
  { regular: beforeAndAfter.regularMinutes, additional: beforeAndAfter.additionalDetectedMinutes },
  { regular: 480, additional: 120 },
  "Time outside both schedule boundaries must be classified as additional.",
);

console.log("Attendance policy engine checks passed.");
