import assert from "node:assert/strict";
import { prisma } from "../lib/prisma";
import { uploadProfessionalDocuments } from "../lib/server/professional-document-upload";
import { MAX_PROFESSIONAL_DOCUMENT_SIZE } from "../lib/server/media";

async function main() {
  const original = prisma.terraqoProfessionalProfile.findUnique;
  let profileReads = 0;
  prisma.terraqoProfessionalProfile.findUnique = (async () => { profileReads++; return null; }) as unknown as typeof original;
  try {
    for (const native of [false, true]) {
      const limit = (native ? 4 * 1024 * 1024 : 2 * MAX_PROFESSIONAL_DOCUMENT_SIZE) + 65536;
      for (const declared of [undefined, "1"]) {
        let cancelled = false;
        let produced = 0;
        const body = new ReadableStream<Uint8Array>({
          pull(controller) { produced += 65536; controller.enqueue(new Uint8Array(65536)); },
          cancel() { cancelled = true; },
        }, { highWaterMark: 0 });
        const headers = new Headers({ "content-type": "multipart/form-data; boundary=test" });
        if (native) headers.set("x-terraqo-native-upload", "1");
        if (declared !== undefined) headers.set("content-length", declared);
        const request = new Request("https://example.invalid/upload", { method: "POST", headers, body, duplex: "half" } as RequestInit);
        const response = await uploadProfessionalDocuments(request, "synthetic-owner", native ? "synthetic-workspace" : undefined);
        assert.equal(response.status, 413);
        assert.equal(cancelled, true, "oversize stream must be cancelled");
        assert.ok(produced <= limit + 65536, "stop at the first exceeding chunk");
        assert.equal(profileReads, 0, "reject before profile, quota or storage work");
      }
      const headers = new Headers();
      if (native) headers.set("x-terraqo-native-upload", "1");
      const malformed = new Request("https://example.invalid/upload", { method: "POST", headers, body: "not multipart" });
      assert.equal((await uploadProfessionalDocuments(malformed, "synthetic-owner", native ? "synthetic-workspace" : undefined)).status, 400);
      assert.equal(profileReads, 0);
    }
    const form = new FormData(); form.set("purpose", "document");
    assert.equal((await uploadProfessionalDocuments(new Request("https://example.invalid/upload", { method: "POST", body: form }), "synthetic-owner")).status, 404);
    assert.equal(profileReads, 1, "valid bounded multipart reaches normal authorization");
    console.log("PASS private upload body: web/native actual byte limits, missing/false length, bounded cancellation, malformed input, no pre-validation DB work.");
  } finally { prisma.terraqoProfessionalProfile.findUnique = original; await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
