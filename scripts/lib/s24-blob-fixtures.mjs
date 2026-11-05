import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

export function s24BlobRun(value) {
  if (typeof value !== "string" || value.length !== 36 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value))
    throw new Error("PLATFORM_STAGING_S24_BLOB_RUN must be a lowercase UUID v4");
  return value;
}

// Version 1 used four tiny WebPs. Version 2 uses illustrative survey plans for
// selected media. The operator and hosted HTTP assertion always read the
// same immutable bytes, including when cleaning an older manifest.
const pairs = [
  ["UklGRjgAAABXRUJQVlA4ICwAAACQAQCdASoEAAQAAUAmJaACdLoAA5gA/vQYtzXxAyb/7B3/6Dv/0Hf6cAAAAA==",
   "UklGRi4AAABXRUJQVlA4ICIAAABwAQCdASoEAAQAAUAmJYwCdAFAAAD+9uX5GGjXqqnr79AA"],
  ["UklGRjwAAABXRUJQVlA4IDAAAADwAQCdASoEAAQAAUAmJaACdLoB+AAF9AAA/vFNr/2Vj6Vj6Vj94L/4s5GI7LwAAAA=",
   "UklGRjYAAABXRUJQVlA4ICoAAACQAQCdASoEAAQAAUAmJaACdLoAA5gA/u1N3/z8z96P8D86fyR3nsvgAAA="],
];

export function s24BlobFixtures(runId, mediaVersion = 2) {
  if (![1, 2].includes(mediaVersion)) throw new Error("Unknown S24 media version");
  const prefix = `worklog-evidence/s24-test/${s24BlobRun(runId)}/`;
  return pairs.map((pair, record) => pair.map((base64, index) => {
    const file = record === 0 ? "nivelacion.webp" : "replanteo.webp";
    const bytes = mediaVersion === 2 && index === 0
      ? readFileSync(new URL("../fixtures/public-archive/media/" + file, import.meta.url))
      : Buffer.from(base64, "base64");
    const key = `${prefix}record-${record + 1}-${index === 0 ? "selected" : "excluded"}.webp`;
    return { key, bytes, sha256: createHash("sha256").update(bytes).digest("hex") };
  }));
}
