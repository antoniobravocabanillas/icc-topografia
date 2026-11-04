import { createHash } from "node:crypto";
/** Git may normalize CRLF to LF. Only accept byte-identical content modulo line endings. */
export function migrationSourceChecksums(source: Buffer) {
 const lf = source.toString("utf8").replace(/\r\n/g, "\n");
 return new Set([source, Buffer.from(lf), Buffer.from(lf.replace(/\n/g, "\r\n"))].map(bytes => createHash("sha256").update(bytes).digest("hex")));
}
