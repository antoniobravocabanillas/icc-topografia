import assert from "node:assert/strict";
import {
  decodeWorklogArchiveCursor,
  encodeWorklogArchiveCursor,
  formatWorklogDay,
  localDateStartUtc,
  parseWorklogArchiveFilters,
  WorklogArchiveError,
} from "../lib/terraqo/worklog-archive-contract";

const filters = parseWorklogArchiveFilters(
  {
    q: "  control   de niveles ",
    tipo: "FIELD_UPDATE",
    proyecto: "project_12345678",
    estado: "VERIFIED",
    desde: "2026-10-20",
    hasta: "2026-10-10",
    mes: "2026-10",
    tz: "America/Lima",
    limite: "500",
    alcance: "all",
  },
  new Date("2026-10-15T12:00:00.000Z"),
);

assert.equal(filters.query, "control de niveles");
assert.equal(filters.type, "FIELD_UPDATE");
assert.equal(filters.month, "2026-10");
assert.equal(filters.evidenceStatus, "VERIFIED");
assert.equal(filters.from, "2026-10-10");
assert.equal(filters.to, "2026-10-20");
assert.equal(filters.limit, 50);
assert.equal(filters.allTime, true);
assert.equal(
  localDateStartUtc("2026-10-15", "America/Lima").toISOString(),
  "2026-10-15T05:00:00.000Z",
);
assert.equal(
  localDateStartUtc("2026-07-01", "America/New_York").toISOString(),
  "2026-07-01T04:00:00.000Z",
);
assert.equal(
  formatWorklogDay(new Date("2026-10-01T02:30:00.000Z"), "America/Lima"),
  "2026-09-30",
);

const occurredAt = new Date("2026-10-14T17:00:00.000Z");
const cursor = encodeWorklogArchiveCursor(
  occurredAt,
  "cmworklog12345678",
  filters,
);
assert.deepEqual(decodeWorklogArchiveCursor(cursor, filters), {
  occurredAt,
  id: "cmworklog12345678",
});

const incompatibleFilters = parseWorklogArchiveFilters({
  q: "otro filtro",
  mes: "2026-10",
  tz: "America/Lima",
});
assert.equal(incompatibleFilters.allTime, false);
assert.throws(
  () => decodeWorklogArchiveCursor(cursor, incompatibleFilters),
  WorklogArchiveError,
);
assert.throws(
  () => decodeWorklogArchiveCursor("cursor-adulterado", filters),
  WorklogArchiveError,
);

console.log("Worklog archive cursor, filters and timezone checks passed.");
