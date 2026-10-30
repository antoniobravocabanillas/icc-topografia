import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createHash, randomUUID } from "node:crypto";
import ts from "typescript";

// Execute the real service with in-memory dependencies: no database, real users or blobs.
const require = createRequire(import.meta.url);
function load(relative, dependencies = {}) {
  const source = readFileSync(new URL(relative, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  });
  const loaded = { exports: {} };
  new Function("require", "module", "exports", outputText)(
    (name) => dependencies[name] ?? require(name),
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}
class BillingError extends Error {}
let rows, blobs, reserved, released, failStore, authorized, txFailure, decoded;
const matches = (row, where) =>
  (!where.worklogId ||
    (typeof where.worklogId === "string"
      ? row.worklogId === where.worklogId
      : row.worklogId !== where.worklogId.not)) &&
  (!where.sha256 || where.sha256.in.includes(row.sha256));
const prisma = {
  terraqoWorklogEntry: {
    findFirst: async ({ where }) =>
      authorized && where.authorId === "owner"
        ? {
            id: "entry",
            authorId: "owner",
            workspaceId: null,
            _count: {
              media: rows.filter((row) => row.worklogId === "entry").length,
            },
          }
        : null,
  },
  terraqoWorklogMedia: {
    findMany: async ({ where }) => rows.filter((row) => matches(row, where)),
    findFirst: async ({ where }) => rows.find((row) => matches(row, where)),
    count: async ({ where }) =>
      rows.filter((row) => matches(row, where)).length,
    create: async ({ data }) => {
      const row = { ...data, id: randomUUID() };
      rows.push(row);
      return row;
    },
  },
  $executeRaw: async () => 1,
  $transaction: async (callback) => {
    if (txFailure) throw new Error(txFailure);
    return callback(prisma);
  },
};
const boundedRequestBody = load("../lib/server/bounded-request-body.ts");
const { uploadWorklogEvidence } = load("../lib/server/worklog-evidence.ts", {
  "@/lib/prisma": { prisma },
  "@/lib/terraqo/billing/storage-quota": {
    reserveStorage: async () => {
      reserved++;
      return {
        release: async () => {
          released++;
        },
      };
    },
  },
  "@/lib/terraqo/billing/provider": { BillingError },
  "@/lib/server/api": {
    ok: (data) => Response.json({ data }),
    fail: (message, status = 400) =>
      Response.json({ error: { message } }, { status }),
    handleApiError: () => Response.json({}, { status: 429 }),
  },
  "@/lib/server/media": {
    ALLOWED_WORKLOG_EVIDENCE_TYPES: new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/avif",
    ]),
    MAX_WORKLOG_EVIDENCE_SIZE: 8 * 1024 * 1024,
    createWorklogEvidenceKey: () => randomUUID(),
    getWorklogEvidenceStore: () => ({
      set: async (key, bytes) => {
        if (failStore) throw new Error("simulated storage outage");
        blobs.set(key, bytes);
      },
      delete: async (key) => blobs.delete(key),
    }),
  },
  "@/lib/terraqo/worklog": { canViewWorklog: async () => true },
  "@/lib/terraqo/builders": { syncWorklogReputation: async () => {} },
  "./native-worklog-legacy-guard": {
    NativeWorklogLegacyGuardError: class NativeWorklogLegacyGuardError extends Error {},
    assertLegacyWorklogs: async () => {},
  },
  "./bounded-request-body": boundedRequestBody,
  "./worklog-media-security": {
    WorklogMediaSecurityError: class WorklogMediaSecurityError extends Error {},
    sanitizeWorklogEvidenceImage: async ({ bytes, claimedContentType, fileName }) => {
      decoded++;
      return {
        bytes: Buffer.from(bytes),
        fileName,
        contentType: claimedContentType,
        sourceFormat: "jpeg",
        width: 1,
        height: 1,
      };
    },
  },
});
function reset() {
  rows = [];
  blobs = new Map();
  reserved = released = 0;
  failStore = txFailure = false;
  authorized = true;
  decoded = 0;
}
function photo(content = "isolated test photo", type = "image/jpeg") {
  return new File([content], "test.jpg", { type });
}
function request(files) {
  const body = new FormData();
  files.forEach((file) => body.append("photos", file));
  return new Request("https://test.invalid/evidence", { method: "POST", body });
}
let passed = 0;
async function test(name, run) {
  reset();
  await run();
  console.log(`PASS ${name}`);
  passed++;
}
await test("upload and retry return the same media without extra storage charge", async () => {
  assert.equal(
    (await uploadWorklogEvidence(request([photo()]), "owner", "entry")).status,
    200,
  );
  assert.equal(
    (await uploadWorklogEvidence(request([photo()]), "owner", "entry")).status,
    200,
  );
  assert.equal(rows.length, 1);
  assert.equal(blobs.size, 1);
  assert.equal(reserved, 1);
});
await test("same image twice in a request is stored once", async () => {
  assert.equal(
    (await uploadWorklogEvidence(request([photo(), photo()]), "owner", "entry"))
      .status,
    200,
  );
  assert.equal(rows.length, 1);
});
await test("raw photo cardinality is rejected before image decoding", async () => {
  const response = await uploadWorklogEvidence(
    request(Array.from({ length: 7 }, (_, index) => photo(String(index)))),
    "owner",
    "entry",
  );
  assert.equal(response.status, 400);
  assert.equal(decoded, 0);
  assert.equal(reserved, 0);
  assert.equal(rows.length, 0);
});
await test("remaining worklog quota is enforced before image decoding", async () => {
  rows.push(...Array.from({ length: 5 }, (_, index) => ({
    id: `existing-${index}`,
    worklogId: "entry",
    sha256: createHash("sha256").update(`existing-${index}`).digest("hex"),
  })));
  const response = await uploadWorklogEvidence(
    request([photo("new-a"), photo("new-b")]),
    "owner",
    "entry",
  );
  assert.equal(response.status, 400);
  assert.equal(decoded, 0);
  assert.equal(reserved, 0);
  assert.equal(rows.length, 5);
});
await test("unknown multipart fields are rejected before image decoding", async () => {
  const body = new FormData();
  body.append("photos", photo());
  body.append("workspaceId", "not-allowed");
  const response = await uploadWorklogEvidence(
    new Request("https://test.invalid/evidence", { method: "POST", body }),
    "owner",
    "entry",
  );
  assert.equal(response.status, 400);
  assert.equal(decoded, 0);
  assert.equal(reserved, 0);
});
await test("foreign author cannot attach", async () => {
  assert.equal(
    (await uploadWorklogEvidence(request([photo()]), "outsider", "entry"))
      .status,
    403,
  );
  assert.equal(reserved, 0);
});
await test("unsupported type and oversized photos fail before reserving storage", async () => {
  for (const file of [
    photo("text", "text/plain"),
    photo(new Uint8Array(8 * 1024 * 1024 + 1)),
  ])
    assert.equal(
      (await uploadWorklogEvidence(request([file]), "owner", "entry")).status,
      400,
    );
  assert.equal(reserved, 0);
});
await test("six-photo limit permits retry but not a seventh unique photo", async () => {
  for (let index = 0; index < 6; index++)
    assert.equal(
      (
        await uploadWorklogEvidence(
          request([photo(String(index))]),
          "owner",
          "entry",
        )
      ).status,
      200,
    );
  assert.equal(
    (await uploadWorklogEvidence(request([photo("0")]), "owner", "entry"))
      .status,
    200,
  );
  assert.equal(
    (await uploadWorklogEvidence(request([photo("7")]), "owner", "entry"))
      .status,
    400,
  );
  assert.equal(rows.length, 6);
});
await test("cross-worklog evidence reuse still rejected", async () => {
  rows.push({
    worklogId: "other",
    sha256: createHash("sha256").update("isolated test photo").digest("hex"),
  });
  assert.equal(
    (await uploadWorklogEvidence(request([photo()]), "owner", "entry")).status,
    409,
  );
  assert.equal(reserved, 0);
});
await test("failed finalization cleans blobs and releases quota", async () => {
  txFailure = "EVIDENCE_LIMIT";
  assert.equal(
    (await uploadWorklogEvidence(request([photo()]), "owner", "entry")).status,
    409,
  );
  assert.equal(released, 1);
  assert.equal(blobs.size, 0);
  assert.equal(rows.length, 0);
});
await test("storage outage preserves retry and releases quota", async () => {
  failStore = true;
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(
      (await uploadWorklogEvidence(request([photo()]), "owner", "entry"))
        .status,
      503,
    );
  } finally {
    console.error = original;
  }
  assert.equal(released, 1);
  assert.equal(rows.length, 0);
  failStore = false;
  assert.equal(
    (await uploadWorklogEvidence(request([photo()]), "owner", "entry")).status,
    200,
  );
});
const client = load("../lib/terraqo/worklog-photo-upload.ts");
await test("client validates all selected sources before creating worklog", async () => {
  assert.throws(() =>
    client.validateWorklogPhotos(Array.from({ length: 7 }, () => photo())),
  );
  assert.throws(() => client.validateWorklogPhotos([photo("", "image/jpeg")]));
  assert.throws(() =>
    client.validateWorklogPhotos([photo("bad", "image/heic")]),
  );
  assert.equal(
    await client.prepareWorklogPhoto(photo()).then((file) => file.size),
    photo().size,
  );
});
await test("client sends exactly one bounded photo and handles gateway HTML", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (_url, options) => {
    assert.equal(options.body.getAll("photos").length, 1);
    return new Response("Payload too large", { status: 413 });
  };
  try {
    await assert.rejects(client.uploadWorklogPhoto("entry", photo()), /tamaño/);
  } finally {
    globalThis.fetch = original;
  }
});
const serverSource = readFileSync(new URL("../lib/server/worklog-evidence.ts", import.meta.url), "utf8");
assert.match(serverSource, /readBoundedRequestBytes/);
assert.match(serverSource, /MAX_WORKLOG_EVIDENCE_MULTIPART_BYTES/);
assert.match(serverSource, /name !== ["']photos["']/);
assert.doesNotMatch(serverSource, /await request\.formData\(\)/);
console.log(`${passed} isolated regression checks passed.`);
