import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

async function removeSandbox(directory: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      await rm(directory, { recursive: true, force: true });
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EBUSY" || attempt === 9) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
}

async function main() {
  const originalCwd = process.cwd();
  const sandbox = await mkdtemp(path.join(os.tmpdir(), "terraqo-experience-upload-"));
  Object.assign(process.env, {
    AUTH_SECRET: "terraqo-test-secret-that-is-longer-than-thirty-two-bytes",
    NODE_ENV: "development",
    NETLIFY: "false",
  });
  process.chdir(sandbox);

  try {
  const upload = await import("../lib/server/experience-evidence-upload");
  const pending = new Map<string, { size: number; chunks: number; storageKey?: string }>();
  const budget = {
    reserve: async (_userId: string, record: { uploadId: string; size: number; chunks: number; storageKey?: string }) => {
      const used = [...pending.values()].reduce((sum, item) => sum + item.size, 0);
      if (used + record.size > 64 * 1024 * 1024) throw new upload.ExperienceEvidenceUploadError("Tienes demasiadas evidencias pendientes.", 429);
      pending.set(record.uploadId, record);
    },
    refresh: async (_userId: string, record: { uploadId: string; size: number; chunks: number; storageKey?: string }) => {
      if (!pending.has(record.uploadId)) throw new upload.ExperienceEvidenceUploadError("La reserva temporal de esta carga venció.", 409);
      pending.set(record.uploadId, record);
    },
  };
  const total = upload.EXPERIENCE_EVIDENCE_CHUNK_SIZE + 257;
  const pdf = Buffer.alloc(total, 0x20);
  pdf.write("%PDF-1.7\n", 0, "ascii");
  pdf.write("\n%%EOF\n", total - 8, "ascii");
  const initialized = await upload.createExperienceEvidenceUpload({ userId: "user-owner", fileName: "respaldo.pdf", contentType: "application/pdf", size: total }, budget);

  assert.equal(initialized.chunks, 2, "Files above the gateway-safe chunk size must be split.");
  assert.equal(initialized.chunkSize, upload.EXPERIENCE_EVIDENCE_CHUNK_SIZE);
  await assert.rejects(
    upload.storeExperienceEvidenceChunk({ userId: "user-other", uploadId: initialized.uploadId, index: 0, token: initialized.token, bytes: Uint8Array.from(pdf.subarray(0, initialized.chunkSize)).buffer }),
    /sesión|pertenece/i,
  );

  const first = Uint8Array.from(pdf.subarray(0, initialized.chunkSize)).buffer;
  const second = Uint8Array.from(pdf.subarray(initialized.chunkSize)).buffer;
  await upload.storeExperienceEvidenceChunk({ userId: "user-owner", uploadId: initialized.uploadId, index: 0, token: initialized.token, bytes: first });
  await upload.storeExperienceEvidenceChunk({ userId: "user-owner", uploadId: initialized.uploadId, index: 0, token: initialized.token, bytes: first });
  await upload.storeExperienceEvidenceChunk({ userId: "user-owner", uploadId: initialized.uploadId, index: 1, token: initialized.token, bytes: second });
  const finalized = await upload.finalizeExperienceEvidenceUpload({ userId: "user-owner", token: initialized.token }, budget);
  assert.ok(finalized.receipt.length > 80);
  assert.equal(finalized.contentType, "application/pdf");
  assert.equal(finalized.size, total);
  const retriedFinalize = await upload.finalizeExperienceEvidenceUpload({ userId: "user-owner", token: initialized.token }, budget);
  assert.equal(retriedFinalize.receipt, finalized.receipt, "A lost finalize response must be safely retryable.");

  await assert.rejects(
    upload.finalizeExperienceEvidenceUpload({ userId: "user-other", token: initialized.token }, budget),
    /sesión|pertenece/i,
  );
  await assert.rejects(
    upload.finalizeExperienceEvidenceUpload({ userId: "user-owner", token: `${initialized.token}x` }, budget),
    /autorización/i,
  );

  const root = originalCwd;
  const [nextConfig, createForm, editForm, actions, serverUpload, initRoute, chunkRoute] = await Promise.all([
    readFile(path.join(root, "next.config.ts"), "utf8"),
    readFile(path.join(root, "components/portal/profile-entry-forms.tsx"), "utf8"),
    readFile(path.join(root, "components/portal/experience-maintenance-editor.tsx"), "utf8"),
    readFile(path.join(root, "lib/server/professional-actions.ts"), "utf8"),
    readFile(path.join(root, "lib/server/experience-evidence-upload.ts"), "utf8"),
    readFile(path.join(root, "app/api/terraqo/experience-evidence/uploads/route.ts"), "utf8"),
    readFile(path.join(root, "app/api/terraqo/experience-evidence/uploads/[uploadId]/chunks/[index]/route.ts"), "utf8"),
  ]);
  assert.match(nextConfig, /bodySizeLimit:\s*["']4mb["']/);
  assert.doesNotMatch(nextConfig, /bodySizeLimit:\s*["']50mb["']/);
  assert.match(nextConfig, /sharp-wasm32\/lib\/\*\.wasm/);
  assert.match(createForm, /ExperienceEvidenceForm/);
  assert.match(editForm, /ExperienceEvidenceForm/);
  assert.doesNotMatch(actions, /evidenceFilesFromForm|storeExperienceEvidenceFiles/);
  assert.match(actions, /attachExperienceEvidenceReceipts/);
  assert.match(serverUpload, /maxWait:\s*5_000/);
  assert.match(serverUpload, /timeout:\s*20_000/);
  assert.match(serverUpload, /MAX_PENDING_UPLOAD_BYTES\s*=\s*64\s*\*\s*1024\s*\*\s*1024/);
  assert.match(serverUpload, /pg_advisory_xact_lock/);
  assert.match(serverUpload, /personalRetainedStorageUnits\(tx, userId\)/);
  assert.match(serverUpload, /charged\.count !== 1/);
  assert.match(serverUpload, /verificationToken\.deleteMany/);
  assert.match(serverUpload, /await import\(["']@\/lib\/server\/worklog-media-security["']\)/);
  assert.match(initRoute, /32\s*\*\s*1024/);
  assert.match(initRoute, /application\/json/);
  assert.match(chunkRoute, /application\/octet-stream/);

  console.log("Experience evidence chunk upload contract: OK (gateway-safe chunks, ownership, integrity, bounded pending budget, atomic retained quota, receipt flow, 4 MB Server Action limit).");
  } finally {
    process.chdir(originalCwd);
    await removeSandbox(sandbox);
  }
}

void main();
