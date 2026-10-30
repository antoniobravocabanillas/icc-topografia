import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import {
  runEvidenceAnalysisProviderProbe,
  type EvidenceAnalysisSource,
} from "../lib/terraqo/evidence-analysis";

loadEnvConfig(process.cwd());

const consent = "terraqo:b5-groq-synthetic-provider-contract";
assert.equal(
  process.env.TERRAQO_GROQ_PROVIDER_TESTS,
  consent,
  `Define TERRAQO_GROQ_PROVIDER_TESTS=${consent} para autorizar una única llamada sintética.`,
);
assert.ok((process.env.GROQ_API_KEY?.trim().length ?? 0) >= 32, "Falta GROQ_API_KEY.");

process.env.TERRAQO_EVIDENCE_ANALYSIS_PROVIDER = "groq";
process.env.GROQ_EVIDENCE_ANALYSIS_MODEL = "openai/gpt-oss-20b";

const source: EvidenceAnalysisSource = {
  sourceId: "synthetic-source-b5-groq",
  revisionId: "synthetic-revision-b5-groq",
  contentHash: "a".repeat(64),
  accessKind: "PUBLIC_CV",
  fields: {
    title: "Replanteo sintético de ejes",
    summary: "Se replantearon ejes A y B con estación total antes del vaciado de concreto.",
    outcome: "Ejes A y B señalizados para revisión.",
    contributionRole: "Apoyo topográfico",
    responsibilities: ["Replanteo de ejes A y B"],
    methods: ["Radiación"],
    tools: ["Estación total"],
    locationLabel: "Ubicación sintética",
  },
};

async function main() {
  const result = await runEvidenceAnalysisProviderProbe({
    purpose: "EVIDENCE_SUMMARY",
    need: {
      title: "Control topográfico de obra",
      problem: "Se requiere evidencia de replanteo antes del vaciado.",
      requirements: [{ label: "Evidencia de replanteo", priority: "REQUIRED" }],
    },
    sources: [source],
  });

  assert.equal(result.provider, "groq");
  assert.equal(result.model, "openai/gpt-oss-20b");
  assert.ok(result.output.claims.length > 0 || result.output.missing.length > 0);

  console.log(
    `B5 Groq structured-output gate: OK (${result.model}; tokens ${result.inputTokens ?? "n/a"}/${result.outputTokens ?? "n/a"}).`,
  );
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : "B5_GROQ_PROVIDER_GATE_FAILED");
  process.exitCode = 1;
});
