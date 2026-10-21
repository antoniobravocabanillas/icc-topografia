import assert from "node:assert/strict";
import { worklogRevisionHash } from "../lib/terraqo/worklog-revision";

const first = worklogRevisionHash({
  title: "Control de niveles",
  summary: "Se ejecutó el control del frente norte.",
  responsibilities: ["Replanteo", "Control"],
  tools: ["GNSS", "Nivel"],
});
const same = worklogRevisionHash({
  title: "Control de niveles",
  summary: "Se ejecutó el control del frente norte.",
  responsibilities: ["Control", "Replanteo", "Control"],
  tools: ["Nivel", "GNSS"],
});
const changed = worklogRevisionHash({
  title: "Control de niveles",
  summary: "Se ejecutó el control del frente sur.",
  responsibilities: ["Control", "Replanteo"],
  tools: ["Nivel", "GNSS"],
});

assert.equal(first, same, "El orden o duplicado de etiquetas no debe crear otra revisión lógica.");
assert.notEqual(first, changed, "Un cambio sustantivo debe producir otro hash.");
console.log("Worklog revision hash checks passed.");
