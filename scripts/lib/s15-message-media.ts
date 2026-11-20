import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { getStore } from "@netlify/blobs";
import type { PrismaClient } from "@prisma/client";
import type { BrowserContext } from "playwright";
import type { ConversationFixture } from "./s15-conversation-fixture";

type Entry = { data: ArrayBuffer; metadata: Record<string, unknown> };
type TestStore = { read(key: string): Promise<Entry | null>; remove(key: string): Promise<unknown> };

export function messageFixtureStore(local: boolean): TestStore {
  if (!local) {
    assert.equal(process.env.SITE_ID, "6b8c43fb-6083-450a-9b85-46a820fb6358");
    assert.equal(process.env.NETLIFY, "true");
    const store = getStore({ name: "terraqo-message-attachments", consistency: "strong" });
    return { read: key => store.getWithMetadata(key, { type: "arrayBuffer", consistency: "strong" }), remove: key => store.delete(key) };
  }
  assert.equal(process.env.TERRAQO_LOCAL_S22_TEST, "synthetic-only");
  const root = path.resolve(process.env.S15_LOCAL_MEDIA_DIRECTORY || "");
  const relative = path.relative(os.tmpdir(), root);
  assert.ok(!relative.startsWith("..") && !path.isAbsolute(relative));
  assert.match(relative.replaceAll("\\", "/"), /^terraqo-s15-[^/]+\/app\/\.next\/local-media$/);
  const storeRoot = path.join(root, "terraqo-message-attachments");
  function file(key: string) {
    const result = path.resolve(storeRoot, key);
    assert.ok(result.startsWith(storeRoot + path.sep));
    return result;
  }
  return {
    async read(key) {
      try {
        const bytes = await readFile(file(key));
        const metadata = JSON.parse(await readFile(file(key) + ".metadata.json", "utf8"));
        return { data: Uint8Array.from(bytes).buffer, metadata: metadata.metadata ?? {} };
      } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; }
    },
    async remove(key) { await rm(file(key), { force: true }); await rm(file(key) + ".metadata.json", { force: true }); },
  };
}

/** Verify storage access before any upload; only exact fixture-owned keys can be removed. */
export async function preflightMessageMedia(local: boolean) {
  const store = messageFixtureStore(local);
  assert.equal(await store.read("message-attachments/s15-preflight/" + randomUUID()), null);
}

export async function uploadMessageJourney(contexts: { company: BrowserContext; professional: BrowserContext; other: BrowserContext; anonymous: BrowserContext },
  db: PrismaClient, f: ConversationFixture, conversationId: string, origin: string) {
  const operationKey = randomUUID();
  const multipart = { conversationId, operationKey, body: "S15 uploaded evidence " + f.run,
    file: { name: `s15-${f.run}.webp`, mimeType: "image/webp", buffer: f.plan.bytes } };
  const endpoint = "/api/terraqo/messages/attachments";
  const options = { maxRedirects: 0, timeout: 60000, headers: { Origin: origin } };
  const first = await contexts.professional.request.post(endpoint, { ...options, multipart });
  assert.equal(first.status(), 200, "Real synthetic attachment upload failed");
  const message = (await first.json()).data;
  assert.equal(message.attachmentItems.length, 1);
  const attachment = message.attachmentItems[0];
  const replay = await contexts.professional.request.post(endpoint, { ...options, multipart });
  assert.equal(replay.status(), 200);
  assert.equal((await replay.json()).data.id, message.id);
  const conflict = await contexts.professional.request.post(endpoint, { ...options, multipart: { ...multipart, body: "Different content" } });
  assert.equal(conflict.status(), 409);
  assert.equal(await db.terraqoMessageOperation.count({ where: { actorId: f.author, operationKey } }), 1);
  for (const context of [contexts.company, contexts.professional]) {
    const response = await context.request.get(endpoint + "/" + attachment.id, options);
    assert.equal(response.status(), 200);
    assert.equal(response.headers()["x-content-type-options"], "nosniff");
    assert.equal(createHash("sha256").update(await response.body()).digest("hex"), f.plan.sha256);
  }
  for (const [context, status] of [[contexts.other, 404], [contexts.anonymous, 401]] as const)
    assert.equal((await context.request.get(endpoint + "/" + attachment.id, options)).status(), status);
  return { upload: "real-multipart", replay: "same-message", read: "exact-bytes-both-parties", isolation: true };
}

export async function cleanMessageMedia(db: PrismaClient, f: ConversationFixture, local: boolean) {
  const rows = await db.terraqoMessageAttachment.findMany({ where: { message: { senderId: f.author,
    conversation: { workspaceId: f.workspace, createdById: f.owner } } }, select: { storageKey: true, message: { select: { conversationId: true } } } });
  const store = messageFixtureStore(local);
  const pending: Array<{ storageKey: string; conversationId: string; uploadedBy: string; sha256: string }> = [];
  for (const row of rows) {
    console.log(JSON.stringify({ gate: "s15", phase: "media-cleanup-ownership" }));
    assert.ok(row.storageKey.startsWith(`message-attachments/${row.message.conversationId}/`));
    assert.ok(row.storageKey.endsWith(`-s15-${f.run}.webp`));
    console.log(JSON.stringify({ gate: "s15", phase: "media-cleanup-read" }));
    const entry = await store.read(row.storageKey);
    if (entry) {
      console.log(JSON.stringify({ gate: "s15", phase: "media-cleanup-integrity" }));
      assert.equal(entry.metadata.uploadedBy, f.author);
      assert.equal(entry.metadata.conversationId, row.message.conversationId);
      assert.equal(createHash("sha256").update(Buffer.from(entry.data)).digest("hex"), f.plan.sha256);
      if (!local) {
        // Build credentials cannot mutate a site-wide store. Preserve a verified
        // ownership receipt for the local operator; never inject a PAT into builds.
        pending.push({ storageKey: row.storageKey, conversationId: row.message.conversationId,
          uploadedBy: f.author, sha256: f.plan.sha256 });
        continue;
      }
      console.log(JSON.stringify({ gate: "s15", phase: "media-cleanup-delete" }));
      await store.remove(row.storageKey);
    }
    console.log(JSON.stringify({ gate: "s15", phase: "media-cleanup-readback" }));
    assert.equal(await store.read(row.storageKey), null);
  }
  return { state: pending.length ? "operator-required" as const : "absent" as const, run: f.run, objects: pending };
}
