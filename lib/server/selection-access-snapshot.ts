import { createHash } from "node:crypto";

/** Call only after the selection's existing public/granted authorization loader. */
export function selectionAccessSnapshot(selection: unknown) {
  return { fingerprint: createHash("sha256").update(JSON.stringify(selection)).digest("hex") };
}
