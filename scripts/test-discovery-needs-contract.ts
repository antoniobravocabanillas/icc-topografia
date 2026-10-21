import assert from "node:assert/strict";
import { explainDiscoveryMatch, normalizeDiscoveryTerms, projectDiscoveryEvidenceFields } from "../lib/terraqo/discovery-needs";
import { isWorkspaceReplay } from "../lib/terraqo/idempotency-scope";
import {
  terraqoEvaluationAssessmentSchema,
  terraqoEvaluationDossierCreateSchema,
  terraqoEvaluationNoteSchema,
  terraqoEvaluationQuestionSchema,
  terraqoWorkNeedCreateSchema,
  terraqoWorkNeedRevisionSchema,
} from "../lib/validations/terraqo";

const cuid = "cm12345678901234567890123";
const baseNeed = {
  title: "Control topográfico de obra",
  problem: "Se necesita controlar niveles y replantear ejes antes del vaciado de concreto.",
  activities: ["Nivelación de precisión", "Replanteo de ejes"],
  requiredTools: ["Estación total", "Nivel automático"],
  endorsementNeeded: true,
  requirements: [
    { label: "Experiencia en replanteo", priority: "REQUIRED" as const },
    { label: "Manejo de estación total", priority: "DESIRED" as const },
  ],
};

assert.equal(terraqoWorkNeedCreateSchema.safeParse(baseNeed).success, true);
assert.equal(terraqoWorkNeedCreateSchema.safeParse({
  ...baseNeed,
  requirements: [...baseNeed.requirements, { label: "experiencia en REPLANTEO", priority: "DESIRED" }],
}).success, false, "Los requisitos equivalentes no deben duplicarse.");
assert.equal(terraqoWorkNeedRevisionSchema.safeParse({ ...baseNeed, expectedVersion: 2 }).success, true);
assert.equal(terraqoEvaluationDossierCreateSchema.safeParse({
  needRevisionId: cuid,
  professionalProfileId: cuid,
  worklogRevisionIds: [cuid],
}).success, true);
assert.equal(terraqoEvaluationAssessmentSchema.safeParse({
  criterionLabel: "Experiencia en replanteo",
  claimState: "DOCUMENTED",
  sourceIds: [],
  expectedRevisionNo: 0,
}).success, false, "Documentado exige una fuente exacta.");
assert.equal(terraqoEvaluationAssessmentSchema.safeParse({
  criterionLabel: "Experiencia en replanteo",
  claimState: "UNKNOWN",
  sourceIds: [],
  expectedRevisionNo: 0,
}).success, false, "Por confirmar exige explicar la información faltante.");
assert.equal(terraqoEvaluationAssessmentSchema.safeParse({
  criterionLabel: "Experiencia en replanteo",
  claimState: "DECLARED",
  sourceIds: [],
  expectedRevisionNo: 0,
}).success, true, "Declarado no debe promoverse artificialmente a documentado.");
assert.equal(terraqoEvaluationNoteSchema.safeParse({ body: "Nota privada del equipo." }).success, true);
assert.equal(terraqoEvaluationQuestionSchema.safeParse({ text: "¿Qué alcance tuvo tu participación?", expectedRevisionNo: 0 }).success, true);

assert.deepEqual(normalizeDiscoveryTerms(["Nivelación y REPLANTEO", "replanteo"]), ["nivelacion", "replanteo"]);
const reasons = explainDiscoveryMatch({
  need: baseNeed,
  evidence: {
    title: "Replanteo de ejes estructurales",
    summary: "Control de niveles previo al vaciado",
    outcome: "Ejes liberados",
    responsibilities: ["Nivelación de precisión"],
    methods: ["Radiación"],
    tools: ["Estación total"],
    skills: ["Topografía"],
    locationLabel: "Lurín, Lima",
  },
});
assert.equal(reasons.hasEvidence, true);
assert.equal(reasons.required[0]?.label, "Experiencia en replanteo");
assert.ok(reasons.toolTerms.includes("estacion"));
assert.equal("score" in reasons, false, "La explicación no debe producir un puntaje de persona.");

const titleOnlyEvidence = projectDiscoveryEvidenceFields({
  title: "Replanteo de ejes",
  summary: "Dato privado de nivelación",
  outcome: "Resultado privado",
  responsibilities: ["Responsabilidad privada"],
  methods: ["Método privado"],
  tools: ["Estación total"],
  skills: ["Topografía"],
  locationLabel: "Lurín",
}, ["title"]);
assert.equal(titleOnlyEvidence.title, "Replanteo de ejes");
assert.equal(titleOnlyEvidence.summary, "");
assert.deepEqual(titleOnlyEvidence.tools, []);
assert.deepEqual(titleOnlyEvidence.skills, []);
assert.equal(titleOnlyEvidence.locationLabel, null);
assert.equal(explainDiscoveryMatch({
  need: { ...baseNeed, title: "Uso de estación total", problem: "", activities: [], requiredTools: [], requirements: [] },
  evidence: titleOnlyEvidence,
}).hasEvidence, false, "Un campo excluido no puede provocar una coincidencia.");

assert.equal(isWorkspaceReplay(
  { workspaceId: "workspace-a", operationFingerprint: "same-payload" },
  { workspaceId: "workspace-a", operationFingerprint: "same-payload" },
), true, "El reintento idéntico dentro del workspace debe conservar la idempotencia.");
assert.equal(isWorkspaceReplay(
  { workspaceId: "workspace-a", operationFingerprint: "same-payload" },
  { workspaceId: "workspace-b", operationFingerprint: "same-payload" },
), false, "Una clave histórica no puede reproducir datos de otro workspace.");

console.log("Discovery needs contract checks passed.");
