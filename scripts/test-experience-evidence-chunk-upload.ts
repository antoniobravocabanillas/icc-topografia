import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

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
    finishFinal: async () => true,
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
  let chunkWrites = 0;
  let consumeBeforeFinish = false;
  const activeWrites = new Map<string, Set<number>>();
  const chunkGuard = {
    assertPending: async (_userId: string, uploadId: string) => {
      if (!pending.has(uploadId)) throw new upload.ExperienceEvidenceUploadError("La reserva fue consumida.", 409);
    },
    beginWrite: async (_userId: string, uploadId: string, index: number) => {
      if (!pending.has(uploadId)) throw new upload.ExperienceEvidenceUploadError("La reserva fue consumida.", 409);
      const writes = activeWrites.get(uploadId) || new Set<number>();
      if (writes.has(index)) throw new upload.ExperienceEvidenceUploadError("El fragmento ya se está escribiendo.", 409);
      writes.add(index);
      activeWrites.set(uploadId, writes);
      chunkWrites += 1;
    },
    finishWrite: async (_userId: string, uploadId: string, index: number) => {
      if (consumeBeforeFinish) pending.delete(uploadId);
      if (!pending.has(uploadId)) return false;
      activeWrites.get(uploadId)?.delete(index);
      return true;
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
    upload.storeExperienceEvidenceChunk({ userId: "user-other", uploadId: initialized.uploadId, index: 0, token: initialized.token, bytes: Uint8Array.from(pdf.subarray(0, initialized.chunkSize)).buffer }, chunkGuard),
    /sesión|pertenece/i,
  );

  const first = Uint8Array.from(pdf.subarray(0, initialized.chunkSize)).buffer;
  const second = Uint8Array.from(pdf.subarray(initialized.chunkSize)).buffer;
  await upload.authorizeExperienceEvidenceChunk({ userId: "user-owner", uploadId: initialized.uploadId, index: 0, token: initialized.token }, chunkGuard);
  await upload.storeExperienceEvidenceChunk({ userId: "user-owner", uploadId: initialized.uploadId, index: 0, token: initialized.token, bytes: first }, chunkGuard);
  await upload.storeExperienceEvidenceChunk({ userId: "user-owner", uploadId: initialized.uploadId, index: 0, token: initialized.token, bytes: first }, chunkGuard);
  await upload.storeExperienceEvidenceChunk({ userId: "user-owner", uploadId: initialized.uploadId, index: 1, token: initialized.token, bytes: second }, chunkGuard);
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
  pending.delete(initialized.uploadId);
  const writesBeforeConsumedReplay = chunkWrites;
  await assert.rejects(
    upload.storeExperienceEvidenceChunk({ userId: "user-owner", uploadId: initialized.uploadId, index: 0, token: initialized.token, bytes: first }, chunkGuard),
    /consumida/i,
  );
  assert.equal(chunkWrites, writesBeforeConsumedReplay, "Un claim consumido debe fallar antes de recrear el blob.");

  const raced = await upload.createExperienceEvidenceUpload({ userId: "user-owner", fileName: "race.pdf", contentType: "application/pdf", size: first.byteLength }, budget);
  consumeBeforeFinish = true;
  await assert.rejects(
    upload.storeExperienceEvidenceChunk({ userId: "user-owner", uploadId: raced.uploadId, index: 0, token: raced.token, bytes: first }, chunkGuard),
    /consumida/i,
  );
  consumeBeforeFinish = false;
  const media = await import("../lib/server/media");
  const ownerPrefix = createHash("sha256").update("user-owner").digest("hex").slice(0, 32);
  const racedKey = `${media.EXPERIENCE_EVIDENCE_PREFIX}/pending/${ownerPrefix}/${raced.uploadId}/chunks/0`;
  assert.equal(await media.getWorklogEvidenceUploadStore().getMetadata(racedKey), null, "A write that loses its durable reservation must remove the blob.");

  // Exercise the production reservation transitions against an isolated,
  // serialized transaction adapter, including a PUT held across finalize.
  const { prisma } = await import("../lib/prisma");
  const originalTransaction = prisma.$transaction;
  const originalDeleteTokens = prisma.verificationToken.deleteMany;
  const originalFindEvidence = prisma.terraqoExperienceEvidence.findMany;
  type Marker = { identifier: string; token: string; expires: Date };
  let markers: Marker[] = [];
  let transactionTail = Promise.resolve();
  const transaction = {
    $executeRaw: async () => 1,
    verificationToken: {
      findMany: async ({ where }: { where: { identifier: string; expires?: { gt: Date } } }) =>
        markers.filter((row) => row.identifier === where.identifier && (!where.expires || row.expires > where.expires.gt)),
      delete: async ({ where }: { where: { token: string } }) => {
        const previous = markers.find((row) => row.token === where.token);
        assert.ok(previous);
        markers = markers.filter((row) => row.token !== where.token);
        return previous;
      },
      create: async ({ data }: { data: Marker }) => { markers.push(data); return data; },
      deleteMany: async ({ where }: { where: { identifier?: string; token: { in: string[] }; expires?: { lte: Date } } }) => {
        const before = markers.length;
        markers = markers.filter((row) => !((!where.identifier || row.identifier === where.identifier) && where.token.in.includes(row.token) && (!where.expires || row.expires <= where.expires.lte)));
        return { count: before - markers.length };
      },
    },
  };
  prisma.$transaction = ((operation: (tx: typeof transaction) => Promise<unknown>) => {
    const result = transactionTail.then(async () => {
      const snapshot = [...markers];
      try { return await operation(transaction); }
      catch (error) { markers = snapshot; throw error; }
    });
    transactionTail = result.then(() => undefined, () => undefined);
    return result;
  }) as unknown as typeof originalTransaction;
  prisma.verificationToken.deleteMany = transaction.verificationToken.deleteMany as unknown as typeof originalDeleteTokens;
  prisma.terraqoExperienceEvidence.findMany = (async () => []) as unknown as typeof originalFindEvidence;
  try {
    const localStore = media.getWorklogEvidenceUploadStore();
    const smallPdf = Uint8Array.from(Buffer.from("%PDF-1.7\n%%EOF\n")).buffer;
    const live = await upload.createExperienceEvidenceUpload({ userId: "user-owner", fileName: "fenced.pdf", contentType: "application/pdf", size: smallPdf.byteLength });
    let releaseWrite!: () => void;
    let signalStarted!: () => void;
    const started = new Promise<void>((resolve) => { signalStarted = resolve; });
    const held = new Promise<void>((resolve) => { releaseWrite = resolve; });
    const heldStore = {
      getMetadata: localStore.getMetadata.bind(localStore),
      getWithMetadata: localStore.getWithMetadata.bind(localStore),
      delete: localStore.delete.bind(localStore),
      set: async (...args: Parameters<typeof localStore.set>) => {
        const result = await localStore.set(...args);
        signalStarted();
        await held;
        return result;
      },
    };
    const writing = upload.storeExperienceEvidenceChunk({ userId: "user-owner", uploadId: live.uploadId, index: 0, token: live.token, bytes: smallPdf }, { store: heldStore });
    await started;
    try {
      await assert.rejects(upload.finalizeExperienceEvidenceUpload({ userId: "user-owner", token: live.token }), /escritura/i);
      await assert.rejects(upload.storeExperienceEvidenceChunk({ userId: "user-owner", uploadId: live.uploadId, index: 0, token: live.token, bytes: smallPdf }), /escribiendo/i);
    } finally {
      releaseWrite();
      await writing;
    }
    const settledRecord = JSON.parse(Buffer.from(markers[0].token, "base64url").toString("utf8"));
    assert.equal(settledRecord.activeWrites, undefined, "A confirmed PUT must release its durable marker.");
    await upload.finalizeExperienceEvidenceUpload({ userId: "user-owner", token: live.token });
    await assert.rejects(upload.storeExperienceEvidenceChunk({ userId: "user-owner", uploadId: live.uploadId, index: 0, token: live.token, bytes: smallPdf }), /finalizada/i);

    const uncertain = await upload.createExperienceEvidenceUpload({ userId: "user-owner", fileName: "uncertain.pdf", contentType: "application/pdf", size: smallPdf.byteLength });
    const uncertainStore = {
      ...heldStore,
      set: async (...args: Parameters<typeof localStore.set>) => {
        await localStore.set(...args);
        throw new Error("simulated transport rejection after remote commit");
      },
    };
    await assert.rejects(upload.storeExperienceEvidenceChunk({ userId: "user-owner", uploadId: uncertain.uploadId, index: 0, token: uncertain.token, bytes: smallPdf }, { store: uncertainStore }), /transport rejection/);
    const uncertainRecord = markers.map((row) => JSON.parse(Buffer.from(row.token, "base64url").toString("utf8"))).find((row) => row.uploadId === uncertain.uploadId);
    assert.equal(uncertainRecord.activeWrites.length, 1, "An ambiguous remote failure must retain its durable marker.");
    await assert.rejects(upload.finalizeExperienceEvidenceUpload({ userId: "user-owner", token: uncertain.token }), /escritura/i);

    const recordOf = (row: Marker) => JSON.parse(Buffer.from(row.token, "base64url").toString("utf8"));
    const expire = (id: string) => { markers.find((row) => recordOf(row).uploadId === id)!.expires = new Date(0); };
    const initialize = () => upload.createExperienceEvidenceUpload({ userId: "user-owner", fileName: "next.pdf", contentType: "application/pdf", size: smallPdf.byteLength });
    expire(uncertain.uploadId);
    await initialize();
    assert.ok(markers.some((row) => recordOf(row).uploadId === uncertain.uploadId), "Expiry cleanup must preserve an unresolved write ledger.");

    // Simulate a PUT whose remote commit arrives only after expiry cleanup.
    const delayed = await initialize();
    let lateCommit!: () => Promise<void>;
    const delayedStore = { ...heldStore, set: async (...args: Parameters<typeof localStore.set>) => {
      lateCommit = async () => { await localStore.set(...args); };
      throw new Error("unacknowledged remote PUT");
    } };
    await assert.rejects(upload.storeExperienceEvidenceChunk({ userId: "user-owner", uploadId: delayed.uploadId, index: 0, token: delayed.token, bytes: smallPdf }, { store: delayedStore }), /unacknowledged/);
    expire(delayed.uploadId);
    await initialize();
    await lateCommit();
    const delayedKey = `${media.EXPERIENCE_EVIDENCE_PREFIX}/pending/${ownerPrefix}/${delayed.uploadId}/chunks/0`;
    assert.ok(await localStore.getMetadata(delayedKey));
    await initialize();
    assert.equal(await localStore.getMetadata(delayedKey), null, "The retained ledger must let later cleanup remove a late commit.");
    assert.ok(markers.some((row) => recordOf(row).uploadId === delayed.uploadId));

    // A confirmed late write can clear its marker, but cannot become usable.
    const expiredConfirmed = await initialize();
    const expiredStore = { ...heldStore, set: async (...args: Parameters<typeof localStore.set>) => {
      expire(expiredConfirmed.uploadId);
      return localStore.set(...args);
    } };
    await assert.rejects(upload.storeExperienceEvidenceChunk({ userId: "user-owner", uploadId: expiredConfirmed.uploadId, index: 0, token: expiredConfirmed.token, bytes: smallPdf }, { store: expiredStore }), /consumida/);
    assert.equal(recordOf(markers.find((row) => recordOf(row).uploadId === expiredConfirmed.uploadId)!).activeWrites, undefined);
    await initialize();
    assert.equal(markers.some((row) => recordOf(row).uploadId === expiredConfirmed.uploadId), false);

    // Final assembled PUTs need the same durable protection as chunk PUTs.
    const finalUncertain = await initialize();
    await upload.storeExperienceEvidenceChunk({ userId: "user-owner", uploadId: finalUncertain.uploadId, index: 0, token: finalUncertain.token, bytes: smallPdf });
    await assert.rejects(upload.finalizeExperienceEvidenceUpload({ userId: "user-owner", token: finalUncertain.token }, { store: delayedStore }), /unacknowledged/);
    const finalRecord = recordOf(markers.find((row) => recordOf(row).uploadId === finalUncertain.uploadId)!);
    assert.ok(finalRecord.finalWrite);
    expire(finalUncertain.uploadId);
    await initialize();
    await lateCommit();
    assert.ok(await localStore.getMetadata(finalRecord.storageKey));
    await initialize();
    assert.equal(await localStore.getMetadata(finalRecord.storageKey), null);
    assert.ok(markers.some((row) => recordOf(row).uploadId === finalUncertain.uploadId));

    // Eight unresolved 8 MiB reservations fill the budget even after expiry.
    const identifier = markers[0].identifier;
    markers = Array.from({ length: 8 }, (_, index) => ({ identifier, expires: new Date(0), token: Buffer.from(JSON.stringify({ v: 1, uploadId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`, size: 8 * 1024 * 1024, chunks: 3, activeWrites: [{ index: 0, nonce: "00000000-0000-4000-8000-000000000099" }] })).toString("base64url") }));
    const fullBudgetKey = `${media.EXPERIENCE_EVIDENCE_PREFIX}/pending/${ownerPrefix}/00000000-0000-4000-8000-000000000000/chunks/0`;
    await localStore.set(fullBudgetKey, smallPdf);
    await assert.rejects(initialize(), (error: unknown) => error instanceof upload.ExperienceEvidenceUploadError && error.status === 429);
    assert.equal(await localStore.getMetadata(fullBudgetKey), null, "Cleanup must still run when the pending budget is full.");
    assert.equal(markers.length, 8);
  } finally {
    prisma.$transaction = originalTransaction;
    prisma.verificationToken.deleteMany = originalDeleteTokens;
    prisma.terraqoExperienceEvidence.findMany = originalFindEvidence;
  }

  const boundedBody = await import("../lib/server/bounded-request-body");
  const oversizedStream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(33 * 1024));
      controller.close();
    },
  });
  const lyingLength = new Request("https://example.invalid/upload", {
    method: "POST",
    headers: { "content-length": "1" },
    body: oversizedStream,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(
    boundedBody.readBoundedRequestBytes(lyingLength, 32 * 1024),
    (error: unknown) => error instanceof boundedBody.BoundedRequestBodyError && error.status === 413,
  );
  const bodyWithoutLength = new Request("https://example.invalid/upload", { method: "POST", body: JSON.stringify({ action: "init" }) });
  assert.deepEqual(await boundedBody.readBoundedJson(bodyWithoutLength, 1024), { action: "init" });

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
  assert.match(serverUpload, /beginPendingUploadWrite/);
  assert.match(serverUpload, /finishPendingUploadWrite/);
  assert.match(serverUpload, /activeWrites/);
  assert.match(serverUpload, /await store\.delete\(key\)/);
  assert.match(serverUpload, /await import\(["']@\/lib\/server\/worklog-media-security["']\)/);
  assert.match(initRoute, /32\s*\*\s*1024/);
  assert.match(initRoute, /application\/json/);
  assert.match(chunkRoute, /application\/octet-stream/);
  assert.match(chunkRoute, /authorizeExperienceEvidenceChunk/);
  assert.match(chunkRoute, /readBoundedRequestBytes/);
  assert.doesNotMatch(chunkRoute, /request\.arrayBuffer\(\)/);
  assert.doesNotMatch(initRoute, /request\.json\(\)/);

  console.log("Experience evidence chunk upload contract: OK (gateway-safe chunks, ownership, integrity, bounded pending budget, atomic retained quota, receipt flow, 4 MB Server Action limit).");
  } finally {
    process.chdir(originalCwd);
    await removeSandbox(sandbox);
  }
}

void main();
