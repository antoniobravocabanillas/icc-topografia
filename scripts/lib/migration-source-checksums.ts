import { createHash } from "node:crypto";
/** Git may normalize CRLF to LF. Only accept byte-identical content modulo line endings. */
export function migrationSourceChecksums(source: Buffer) {
 const lf = source.toString("utf8").replace(/\r\n/g, "\n");
 const hashes = new Set([source, Buffer.from(lf), Buffer.from(lf.replace(/\n/g, "\r\n"))].map(bytes => createHash("sha256").update(bytes).digest("hex")));
 // The already-applied followup artifact used mixed LF/CRLF. Its normalized
 // content was compared byte-for-byte to this exact committed migration.
 if (createHash("sha256").update(lf).digest("hex") === "e6364fd6a788ace33b7442d5e3b18cfb815f049e7b02f6ecacf89b144e1de68a") hashes.add("a7f498f903d18ce459c2f12e32cb4dde3a36006e6a92480831f9b787ba8cde57");
 return hashes;
}
