import assert from "node:assert/strict";
import { attentionConfigSchema, attentionObjectiveDraft, defaultAttentionConfig, type AttentionObjective } from "../lib/terraqo/customer-attention-config";
const base = defaultAttentionConfig("Empresa de prueba");
base.domains = ["empresa.example"];
base.installation = { position: "left", label: "Contactar", pages: ["/servicios"] };
base.timezone = "Europe/Madrid";
const original = structuredClone(base);
for (const objective of ["sales", "support", "appointments"] satisfies AttentionObjective[]) {
 const draft = attentionConfigSchema.parse(attentionObjectiveDraft(base, objective));
 assert.deepEqual({ ...draft, greeting: base.greeting, topics: base.topics }, base);
 assert.notEqual(draft.greeting, base.greeting);
 assert.equal(new Set(draft.topics).size, draft.topics.length);
 draft.topics.push("Prueba");
 assert.equal(attentionObjectiveDraft(base, objective).topics.includes("Prueba"), false);
}
assert.deepEqual(base, original);
assert.match(attentionObjectiveDraft(base, "appointments").greeting, /confirmará la disponibilidad/);
console.log("PASS attention objectives: valid independent drafts, identity/privacy/installation preserved, no mutation and manual appointment confirmation.");
