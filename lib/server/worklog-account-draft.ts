import { createHash } from "node:crypto";
import { getStore } from "@netlify/blobs";
import { z } from "zod";
import { draftCommand, draftFields, sameDraft } from "../terraqo/worklog-account-draft";

const store = () => getStore({ name: "terraqo-private-worklog-drafts", consistency: "strong" });
const draftKey = (profileId: string) => createHash("sha256").update(profileId).digest("hex");
const revisionId = z.string().regex(/^[a-f0-9]{64}$/);
const record = z.union([
  z.strictObject({ revision: revisionId, fields: draftFields, copies: z.array(draftFields).max(8) }),
  z.strictObject({ revision: revisionId }),
]);

async function read(profileId: string) {
  const entry = await store().getWithMetadata(draftKey(profileId), { type: "json" });
  if (!entry) return null;
  if (!entry.etag) throw new Error("El almacén no proporcionó ETag.");
  return { record: record.parse(entry.data), etag: entry.etag };
}

function snapshot(value: z.output<typeof record> | null) {
  return { revision: value?.revision ?? null, draft: value && "fields" in value ? value : null };
}

export async function openAccountDraft(profileId: string) {
  return snapshot((await read(profileId))?.record ?? null);
}

export async function writeAccountDraft(profileId: string, command: z.output<typeof draftCommand>) {
  const key = draftKey(profileId);
  // The validated command has canonical key order. Replaying a lost acknowledgement is a no-op.
  const revision = createHash("sha256").update(key).update(JSON.stringify(command)).digest("hex");
  const entry = await read(profileId);
  const before = snapshot(entry?.record ?? null);
  if (before.revision === revision) return { status: 200, ...before };
  if (before.revision !== command.base) return { status: 409, ...before };

  async function commit(value: z.output<typeof record>) {
    // A single conditional write commits the primary and every retained alternative together.
    const result = await store().setJSON(
      key,
      value,
      entry ? { onlyIfMatch: entry.etag } : { onlyIfNew: true },
    );
    if (result.modified && result.etag) return { status: 200, ...snapshot(value) };
    const winner = await openAccountDraft(profileId);
    if (result.modified && winner.revision !== revision) throw new Error("Escritura sin confirmación.");
    return { status: winner.revision === revision ? 200 : 409, ...winner };
  }
  // A content-free tombstone prevents delayed retries from resurrecting discarded fields.
  if (command.action === "discard") return commit({ revision });
  const current = before.draft;
  if (command.action !== "save" && !current) return { status: 409, ...before };
  let copies = current?.copies ?? [];
  let fields: z.output<typeof draftFields>;
  if (command.action === "remove-copy") {
    if (!current || !copies[command.index - 1]) return { status: 422, ...before };
    copies = copies.filter((_, i) => i !== command.index - 1);
    fields = current.fields;
  } else {
    fields = command.fields;
    if (command.action !== "save" && current) {
      const versions = [current.fields, ...copies];
      if (command.action === "open") {
        fields = versions[command.index];
        if (!fields) return { status: 422, ...before };
      }
      copies = [];
      for (const version of [...versions, command.fields]) {
        if (!sameDraft(fields, version) && !copies.some((copy) => sameDraft(copy, version)))
          copies.push(version);
      }
      if (copies.length > 8) return { status: 422, ...before };
    } else {
      copies = copies.filter((copy) => !sameDraft(copy, fields));
    }
  }
  return commit({ revision, fields, copies });
}
