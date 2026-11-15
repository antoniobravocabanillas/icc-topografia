import { resolveWorklogOccurrence } from "../lib/terraqo/worklog-archive-contract";
import { worklogToday } from "../lib/terraqo/worklog-date";
import { terraqoWorklogCreateSchema } from "../lib/validations/terraqo";
import assert from "node:assert/strict";
import {
  isValidWorklogOperationKey,
  worklogCreateOperationFingerprint,
} from "../lib/terraqo/worklog-create-operation";

const payload = {
  title: "Control geométrico del sector B",
  summary: "Se controlaron los ejes y tolerancias del sector antes del vaciado.",
  outcome: "Frente liberado sin observaciones.",
  contributionRole: "Responsable del control geométrico",
  responsibilities: ["Control de ejes"],
  methods: ["Poligonal cerrada"],
  tools: ["Estación total"],
  type: "FIELD_UPDATE" as const,
  visibility: "PRIVATE" as const,
  skills: ["Topografía"],
  evidenceUrls: [],
};

const now = new Date("2026-11-15T04:59:00Z");
assert.equal(worklogToday(now), "2026-11-14");
assert.equal(resolveWorklogOccurrence(undefined, now), now);
assert.equal(resolveWorklogOccurrence("2026-11-14", now), now);
assert.equal(resolveWorklogOccurrence("2024-02-29", now).toISOString(), "2024-02-29T05:00:00.000Z");
assert.ok(terraqoWorklogCreateSchema.safeParse({ ...payload, workDate: "2024-02-29" }).success);
assert.ok(!terraqoWorklogCreateSchema.safeParse({ ...payload, workDate: "2025-02-29" }).success);
assert.notEqual(worklogCreateOperationFingerprint({ ...payload, workDate: "2026-11-14" }), worklogCreateOperationFingerprint(payload));

const first = worklogCreateOperationFingerprint(payload);
const replay = worklogCreateOperationFingerprint({ ...payload });
const changed = worklogCreateOperationFingerprint({ ...payload, outcome: "Resultado distinto" });

assert.equal(first, replay, "El mismo contenido debe producir el mismo recibo.");
assert.notEqual(first, changed, "Un cambio de contenido debe invalidar el reintento.");
assert.equal(isValidWorklogOperationKey("9cb87c95-8eeb-4c76-9b68-1a99b168aacf"), true);
assert.equal(isValidWorklogOperationKey("not-a-uuid"), false);

console.log("Worklog create idempotency checks passed.");
