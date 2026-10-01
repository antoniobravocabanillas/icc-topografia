import assert from "node:assert/strict";

import { isCompanyWorklogWithinJourney } from "../lib/terraqo/jornada";

const journey = {
  workspaceId: "company-a",
  userId: "professional-1",
  entryAt: new Date("2026-09-30T12:00:00.000Z"),
  exitAt: new Date("2026-09-30T21:00:00.000Z"),
};

assert.equal(isCompanyWorklogWithinJourney({ worklog: { workspaceId: "company-a", authorId: "professional-1", occurredAt: new Date("2026-09-30T16:00:00.000Z") }, journey }), true);
assert.equal(isCompanyWorklogWithinJourney({ worklog: { workspaceId: "company-b", authorId: "professional-1", occurredAt: new Date("2026-09-30T16:00:00.000Z") }, journey }), false);
assert.equal(isCompanyWorklogWithinJourney({ worklog: { workspaceId: null, authorId: "professional-1", occurredAt: new Date("2026-09-30T16:00:00.000Z") }, journey }), false);
assert.equal(isCompanyWorklogWithinJourney({ worklog: { workspaceId: "company-a", authorId: "professional-2", occurredAt: new Date("2026-09-30T16:00:00.000Z") }, journey }), false);
assert.equal(isCompanyWorklogWithinJourney({ worklog: { workspaceId: "company-a", authorId: "professional-1", occurredAt: new Date("2026-09-30T22:00:00.000Z") }, journey }), false);

console.log("worklog journey linking: ok");
