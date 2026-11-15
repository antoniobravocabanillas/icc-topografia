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
    findUnique: async ({ where }) => { const item = rows.find(row => row.id === where.id); return item && { ...item, worklog: { workspaceId: "fixture" } }; },
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
const boundedMultipart = load("../lib/server/bounded-multipart.ts");
const clipTypes = load("../lib/terraqo/worklog-clip-types.ts");
const mediaResponse = load("../lib/server/worklog-media-response.ts");
const security = load("../lib/server/worklog-media-security.ts", { sharp: { default: require("sharp") } });
const clip = load("../lib/server/worklog-clip.ts", {
  "../terraqo/worklog-clip-types": clipTypes, "./worklog-media-security": security,
});
const { uploadWorklogEvidence, getWorklogEvidenceFile } = load("../lib/server/worklog-evidence.ts", {
  "./worklog-clip": clip,
  "./worklog-media-response": mediaResponse,
  "../terraqo/worklog-clip-types": clipTypes,
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
      ...clipTypes.WORKLOG_CLIP_TYPES,
    ]),
    MAX_WORKLOG_EVIDENCE_SIZE: 8 * 1024 * 1024,
    createWorklogEvidenceKey: () => randomUUID(),
    getWorklogEvidenceStore: () => ({
      set: async (key, bytes) => {
        if (failStore) throw new Error("simulated storage outage");
        blobs.set(key, bytes);
      },
      getWithMetadata: async key => blobs.has(key) ? { data: blobs.get(key) } : null,
      delete: async (key) => blobs.delete(key),
    }),
  },
  "@/lib/terraqo/worklog": { canViewWorklog: async userId => userId === "owner" },
  "@/lib/terraqo/builders": { syncWorklogReputation: async () => {} },
  "./native-worklog-legacy-guard": {
    NativeWorklogLegacyGuardError: class NativeWorklogLegacyGuardError extends Error {},
    assertLegacyWorklogs: async () => {},
  },
  "./bounded-request-body": boundedRequestBody,
  "./bounded-multipart": boundedMultipart,
  "./worklog-media-security": {
    WorklogMediaSecurityError: security.WorklogMediaSecurityError,
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
  const originalParse = Request.prototype.formData;
  let parsed = 0;
  Request.prototype.formData = function () { parsed++; return originalParse.call(this); };
  try {
  const response = await uploadWorklogEvidence(
    request(Array.from({ length: 7 }, (_, index) => photo(String(index)))),
    "owner",
    "entry",
  );
  assert.equal(response.status, 400);
  assert.equal(decoded, 0);
  assert.equal(reserved, 0);
  assert.equal(rows.length, 0);
  assert.equal(parsed, 0, "Excess parts must fail before the native parser allocates any File objects.");
  } finally { Request.prototype.formData = originalParse; }
});
await test("multipart preflight handles quoted boundaries and limits tiny or empty parts", async () => {
  const boundary = "test-boundary";
  const raw = (count, header = 'Content-Disposition: form-data; name="photos"; filename="a.jpg"') =>
    Buffer.from(Array.from({ length: count }, () => `--${boundary}\r\n${header}\r\n\r\n\r\n`).join("") + `--${boundary}--\r\n`);
  const type = `multipart/form-data; boundary="${boundary}"`;
  assert.equal(boundedMultipart.assertMultipartPartLimits(raw(6), type, 6), 6);
  const withPreamble = Buffer.concat([Buffer.from("MIME preamble\r\n"), raw(1), Buffer.from("epilogue")]);
  const extendedType = `multipart/form-data; charset=utf-8; boundary="${boundary}"; extra="a;b"`;
  assert.equal(boundedMultipart.assertMultipartPartLimits(withPreamble, extendedType, 6), 1);
  assert.equal([...await new Request("https://test.invalid", { method: "POST", body: withPreamble, headers: { "content-type": extendedType } }).formData()].length, 1);
  assert.throws(() => boundedMultipart.assertMultipartPartLimits(raw(1000), type, 6), /Too many/);
  assert.throws(() => boundedMultipart.assertMultipartPartLimits(raw(1, "X:" + "x".repeat(8193)), type, 6), /headers/);
  assert.throws(() => boundedMultipart.assertMultipartPartLimits(raw(1), `${type}; boundary=other`, 6), /boundary/);
  const binary = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="photos"; filename="binary.jpg"\r\n\r\nbinary\r\n--${boundary}Xstill-binary\r\n--${boundary}--\r\n`);
  assert.equal(boundedMultipart.assertMultipartPartLimits(binary, type, 6), 1);
  const file = photo(`binary\r\n--${boundary}Xstill-binary`);
  const encoded = request([file]);
  const bytes = new Uint8Array(await encoded.arrayBuffer());
  assert.equal(boundedMultipart.assertMultipartPartLimits(bytes, encoded.headers.get("content-type"), 6), 1);
  const valid = await uploadWorklogEvidence(request(Array.from({ length: 6 }, (_, i) => photo(`valid-${i}`))), "owner", "entry");
  assert.equal(valid.status, 200);
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
const client = load("../lib/terraqo/worklog-photo-upload.ts", { "./worklog-clip-types": clipTypes });
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
for (const [kind, format] of [["audio", "webm"], ["video", "webm"], ["audio", "mp4"], ["video", "mp4"]]) {
  await test(`real ${kind}/${format} upload, retry, private read and ranges`, async () => {
    const bytes = readFileSync(new URL(`./fixtures/worklog-clips/${kind}.${format}`, import.meta.url));
    const file = new File([bytes], `fixture.${format}`, { type: `${kind}/${format}` });
    const send = () => uploadWorklogEvidence(request([file]), "owner", "entry");
    assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 200);
    assert.equal(rows.length, 1);
    assert.equal(reserved, 1);
    const { id } = rows[0];
    const range = value => new Request("https://test.invalid/evidence", { headers: { Range: value } });
    assert.equal((await getWorklogEvidenceFile("other", id, undefined, range("bytes=0-7"))).status, 403);
    assert.equal((await getWorklogEvidenceFile("owner", id, "other")).status, 403);
    const full = await getWorklogEvidenceFile("owner", id, "fixture");
    assert.equal(full.status, 200);
    assert.equal(full.headers.get("content-type"), file.type);
    const stored = Buffer.from(await full.arrayBuffer());
    for (const [header, expected] of [["bytes=0-7", stored.subarray(0, 8)], ["bytes=-12", stored.subarray(-12)], ["bytes=10-", stored.subarray(10)]]) {
      const partial = await getWorklogEvidenceFile("owner", id, "fixture", range(header));
      assert.equal(partial.status, 206);
      assert.deepEqual(Buffer.from(await partial.arrayBuffer()), expected);
    }
    assert.equal((await getWorklogEvidenceFile("owner", id, "fixture", range("bytes=9999999-"))).status, 416);
    for (const bad of [new File([bytes], "wrong", { type: kind === "video" ? "audio/webm" : "video/mp4" }),
      new File([bytes.subarray(0, 24)], "truncated", { type: file.type })]) {
      const result = await uploadWorklogEvidence(request([bad]), "owner", "entry");
      assert.equal(result.status, 422);
    }
    assert.equal(blobs.size, 1);
    assert.equal(reserved, 1);
  });
}
await test("public CV media checks the exact profile, publication and deletion before and after blob read", async () => {
  let reads = 0, stillPublished = true, visibility = "PRIVATE", deletedAt = null, cvEnabled = true;
  const row = { id: "clip-id", contentType: "audio/webm", fileName: "audio.webm", storageKey: "private-key" };
  const { GET } = load("../app/api/public/cv/[username]/worklogs/[mediaId]/route.ts", {
    "@/lib/server/worklog-media-response": mediaResponse,
    "@/lib/prisma": { prisma: { terraqoWorklogMedia: { findFirst: async ({ where }) => {
      assert.equal(where.worklog.visibility, "PUBLIC");
      assert.equal(where.worklog.deletedAt, null);
      assert.equal(where.worklog.professionalProfile.liveCvEnabled, true);
      if (where.id !== row.id || where.worklog.professionalProfile.username !== "fixture" ||
          visibility !== where.worklog.visibility || deletedAt !== null || !cvEnabled) return null;
      return !where.storageKey || (stillPublished && where.storageKey === row.storageKey) ? row : null;
    } } } },
    "@/lib/server/media": { getWorklogEvidenceStore: () => ({ getWithMetadata: async () => {
      reads++; return { data: Uint8Array.of(1, 2, 3).buffer };
    } }) },
  });
  const request = (username = "fixture") => GET(new Request("https://test.invalid/public", { headers: { Range: "bytes=0-1" } }),
    { params: Promise.resolve({ username, mediaId: row.id }) });
  assert.equal((await request()).status, 404);
  visibility = "WORKSPACE"; assert.equal((await request()).status, 404);
  visibility = "PUBLIC"; deletedAt = new Date(); assert.equal((await request()).status, 404);
  deletedAt = null; cvEnabled = false; assert.equal((await request()).status, 404);
  cvEnabled = true; assert.equal((await request("different")).status, 404);
  assert.equal(reads, 0);
  assert.equal((await request()).status, 206);
  stillPublished = false; assert.equal((await request()).status, 404);
});
const serverSource = readFileSync(new URL("../lib/server/worklog-evidence.ts", import.meta.url), "utf8");
assert.match(serverSource, /readBoundedRequestBytes/);
assert.match(serverSource, /MAX_WORKLOG_EVIDENCE_MULTIPART_BYTES/);
assert.match(serverSource, /name !== ["']photos["']/);
assert.doesNotMatch(serverSource, /await request\.formData\(\)/);
console.log(`${passed} isolated regression checks passed.`);
