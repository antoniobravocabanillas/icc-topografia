import assert from "node:assert/strict";
import { discoverEvidenceForNeed, explainDiscoveryMatch, normalizeDiscoveryTerms, projectDiscoveryEvidenceFields } from "../lib/terraqo/discovery-needs";
import { prisma } from "../lib/prisma";
import { isWorkspaceReplay } from "../lib/terraqo/idempotency-scope";
import { constrainAllowedFields } from "../lib/terraqo/evaluation-source-policy";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
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

assert.deepEqual(
  constrainAllowedFields(["title", "summary"], { allowedFields: ["summary"] }),
  ["summary"],
  "Editar una selección no puede ampliar los campos congelados en el dossier.",
);
assert.deepEqual(
  constrainAllowedFields(["summary"], { allowedFields: ["title", "summary"] }),
  ["summary"],
  "La autorización viva también puede estrechar el snapshot.",
);

const discoverySource = readFileSync(resolve(process.cwd(), "lib/terraqo/discovery-needs.ts"), "utf8");
assert.match(discoverySource, /professionalProfile: \{ liveCvEnabled: true \}/, "Discovery debe exigir una política pública explícita para la identidad profesional.");
assert.match(discoverySource, /allowedFields,\s*\n\s*\},/, "El dossier debe congelar los campos autorizados al adjuntar una fuente.");
const privateGrantBranch = discoverySource.indexOf("} else if (privateItem?.collection.grants[0])");
const publicProjectionBranch = discoverySource.indexOf("} else if (publicItem?.collection.publicProjection");
assert.ok(privateGrantBranch >= 0 && publicProjectionBranch > privateGrantBranch, "Una concesión privada válida debe evaluarse antes que la proyección pública para que liveCvEnabled no la oculte.");

assert.equal(isWorkspaceReplay(
  { workspaceId: "workspace-a", operationFingerprint: "same-payload" },
  { workspaceId: "workspace-a", operationFingerprint: "same-payload" },
), true, "El reintento idéntico dentro del workspace debe conservar la idempotencia.");
assert.equal(isWorkspaceReplay(
  { workspaceId: "workspace-a", operationFingerprint: "same-payload" },
  { workspaceId: "workspace-b", operationFingerprint: "same-payload" },
), false, "Una clave histórica no puede reproducir datos de otro workspace.");

// Execute the real service with a predicate-evaluating Prisma fixture. This
// catches leaks from SQL candidate membership, not just response redaction.
function matchesFixture(value: unknown, filter: Record<string, unknown>): boolean {
  const row = value as Record<string, unknown> | null;
  return Object.entries(filter).every(([key, expected]) => {
    if (key === "AND") return (Array.isArray(expected) ? expected : [expected]).every((part) => matchesFixture(value, part));
    if (key === "OR") return (expected as Record<string, unknown>[]).some((part) => matchesFixture(value, part));
    const actual = row?.[key];
    if (expected === null || typeof expected !== "object") return actual === expected;
    const predicate = expected as Record<string, unknown>;
    if ("contains" in predicate) return typeof actual === "string" && actual.toLowerCase().includes(String(predicate.contains).toLowerCase());
    if ("has" in predicate) return Array.isArray(actual) && actual.includes(predicate.has);
    if ("hasSome" in predicate) return Array.isArray(actual) && (predicate.hasSome as unknown[]).some((item) => actual.includes(item));
    if ("some" in predicate) return Array.isArray(actual) && actual.some((item) => matchesFixture(item, predicate.some as Record<string, unknown>));
    if ("isNot" in predicate) return actual !== predicate.isNot;
    if ("not" in predicate) return actual !== predicate.not;
    return matchesFixture(actual, predicate);
  });
}

async function verifyDiscoveryMembership() {
  const originalNeed = prisma.terraqoWorkNeed.findFirst;
  const originalRevisions = prisma.terraqoWorklogRevision.findMany;
  let title = "GNSS Acme";
  const row = {
    id: "revision", title: "Nivelacion", summary: "Acme confidencial", outcome: null,
    tools: ["GNSS"], methods: [], responsibilities: [], currentFor: { id: "worklog" },
    shareItems: [{ allowedFields: ["tools"], collection: { lifecycle: "ACTIVE", publicProjection: { id: "projection", revokedAt: null } } }],
    worklog: {
      id: "worklog", visibility: "PRIVATE", deletedAt: null, lifecycle: "PUBLISHED", currentRevisionId: "revision",
      skills: [], locationLabel: null, occurredAt: new Date(), workCaseLinks: [],
      professionalProfile: { id: "profile", liveCvEnabled: true, headline: "Topografía", user: { name: "Synthetic", image: null } },
    },
  };
  let fixtures = [row];
  prisma.terraqoWorkNeed.findFirst = (async () => ({ currentRevision: { title, problem: "", activities: [], requiredTools: [], requirements: [] } })) as unknown as typeof originalNeed;
  prisma.terraqoWorklogRevision.findMany = (async ({ where, take }: { where: Record<string, unknown>; take: number }) => fixtures.filter((item) => matchesFixture(item, where)).slice(0, take)) as unknown as typeof originalRevisions;
  try {
    const known = await discoverEvidenceForNeed("workspace", "need");
    title = "GNSS Zebra";
    const unknown = await discoverEvidenceForNeed("workspace", "need");
    assert.equal(known.length, 1);
    assert.deepEqual(known, unknown, "A hidden keyword must affect neither membership nor match reasons.");
    assert.equal("summary" in known[0], false);
    title = "Acme";
    assert.equal((await discoverEvidenceForNeed("workspace", "need")).length, 0, "An exclusively hidden match must not be returned.");
    row.worklog.visibility = "PUBLIC";
    assert.equal((await discoverEvidenceForNeed("workspace", "need")).length, 1, "Fully public text remains searchable.");
    row.worklog.professionalProfile.liveCvEnabled = false;
    assert.equal((await discoverEvidenceForNeed("workspace", "need")).length, 0, "Withdrawn public identity stays undiscoverable.");
    row.worklog.professionalProfile.liveCvEnabled = true;
    fixtures = [...Array.from({ length: 300 }, (_, i) => ({ ...row, id: `irrelevant-${i}`, title: "Sin coincidencia", summary: "Otra actividad", tools: ["Otro"], worklog: { ...row.worklog, id: `other-${i}`, visibility: "PRIVATE" } })), row];
    assert.equal((await discoverEvidenceForNeed("workspace", "need")).length, 1, "Unrelated partial selections cannot displace matching public work.");
    row.worklog.visibility = "PRIVATE";
    row.shareItems[0].allowedFields = ["summary"];
    assert.equal((await discoverEvidenceForNeed("workspace", "need")).length, 1, "Unrelated selections cannot displace authorized searchable text in another selection.");
  } finally {
    prisma.terraqoWorkNeed.findFirst = originalNeed;
    prisma.terraqoWorklogRevision.findMany = originalRevisions;
  }
}

verifyDiscoveryMembership().then(() => console.log("Discovery needs contract checks passed, including hidden-field membership controls.")).catch((error) => { console.error(error); process.exitCode = 1; });
