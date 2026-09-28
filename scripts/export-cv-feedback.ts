import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

function outputPath() {
  const index = process.argv.indexOf("--out");
  const requested = index >= 0 ? process.argv[index + 1] : "tmp/ml/cv-feedback.jsonl";
  const resolved = path.resolve(process.cwd(), requested);
  const root = path.resolve(process.cwd());
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error("La salida debe permanecer dentro del proyecto.");
  return resolved;
}

async function main() {
  const corrections = await prisma.terraqoCvImportCorrection.findMany({
    where: { useForTraining: true },
    include: { cvImportItem: { select: { type: true, confidence: true, cvImport: { select: { parserVersion: true, professionalProfileId: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  const lines = corrections.map((entry) => JSON.stringify({
    subject: createHash("sha256").update(entry.cvImportItem.cvImport.professionalProfileId).digest("hex").slice(0, 20),
    parserVersion: entry.cvImportItem.cvImport.parserVersion,
    itemType: entry.cvImportItem.type,
    field: entry.field,
    confidence: entry.cvImportItem.confidence,
    predicted: entry.predictedValue,
    corrected: entry.correctedValue,
    accepted: entry.accepted,
  }));
  const target = outputPath();
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, lines.length ? `${lines.join("\n")}\n` : "", { encoding: "utf8", mode: 0o600 });
  console.log(`Exportados ${lines.length} ejemplos consentidos a ${target}`);
}

main().finally(() => prisma.$disconnect());
