import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prisma } from "../lib/prisma";
import { getWorklogEvidenceStore } from "../lib/server/media";

async function main() {
  const media = await prisma.terraqoWorklogMedia.findMany({ where: { sha256: null }, select: { id: true, storageKey: true } });
  let store: ReturnType<typeof getWorklogEvidenceStore> | null = null;
  try { store = getWorklogEvidenceStore(); } catch { store = null; }
  const temporaryDirectory = mkdtempSync(join(tmpdir(), "terraqo-worklog-hashes-"));
  let processed = 0;
  let missing = 0;
  try {
    for (const [index, item] of media.entries()) {
      let bytes: Buffer | null = null;
      if (store) {
        const stored = await store.getWithMetadata(item.storageKey, { type: "arrayBuffer" });
        if (stored) bytes = Buffer.from(stored.data);
      } else {
        const outputPath = join(temporaryDirectory, `${index}.blob`);
        try {
          const executable = process.platform === "win32" ? join(process.cwd(), "node_modules", ".bin", "netlify.cmd") : join(process.cwd(), "node_modules", ".bin", "netlify");
          if (!/^[a-zA-Z0-9/._-]+$/.test(item.storageKey)) throw new Error("Clave de almacenamiento no válida.");
          if (process.platform === "win32") execFileSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", `""${executable}" blobs:get terraqo-worklog-evidence ${item.storageKey} --output "${outputPath}""`], { stdio: "ignore" });
          else execFileSync(executable, ["blobs:get", "terraqo-worklog-evidence", item.storageKey, "--output", outputPath], { stdio: "ignore" });
          bytes = readFileSync(outputPath);
        } catch (error) { if (index === 0) console.warn(error instanceof Error ? error.message : error); bytes = null; }
      }
      if (!bytes) { missing += 1; continue; }
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      await prisma.terraqoWorklogMedia.update({ where: { id: item.id }, data: { sha256 } });
      processed += 1;
    }
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ processed, missing }));
}

main().finally(() => prisma.$disconnect());
