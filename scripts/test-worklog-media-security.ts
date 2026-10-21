import assert from "node:assert/strict";
import sharp from "sharp";
import {
  sanitizeWorklogEvidenceImage,
  WorklogMediaSecurityError,
} from "../lib/server/worklog-media-security";

async function main() {
const png = await sharp({
  create: {
    width: 24,
    height: 16,
    channels: 3,
    background: { r: 12, g: 80, b: 110 },
  },
})
  .png()
  .toBuffer();

const sanitized = await sanitizeWorklogEvidenceImage({
  bytes: png,
  claimedContentType: "image/png",
  fileName: "Campo 01.png",
});
assert.equal(sanitized.contentType, "image/webp");
assert.equal(sanitized.fileName, "Campo-01.webp");
assert.equal(sanitized.width, 24);
assert.equal(sanitized.height, 16);
assert.equal((await sharp(sanitized.bytes).metadata()).format, "webp");

await assert.rejects(
  sanitizeWorklogEvidenceImage({
    bytes: png,
    claimedContentType: "image/jpeg",
    fileName: "disfraz.jpg",
  }),
  (error: unknown) =>
    error instanceof WorklogMediaSecurityError &&
    error.message.includes("no coincide"),
);

await assert.rejects(
  sanitizeWorklogEvidenceImage({
    bytes: Buffer.from("not-an-image"),
    claimedContentType: "image/jpeg",
    fileName: "corrupta.jpg",
  }),
  WorklogMediaSecurityError,
);

console.log("Worklog media signature, decode and derivative checks passed.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
