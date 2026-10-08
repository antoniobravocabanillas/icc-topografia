import "server-only";
import { createHash } from "node:crypto";
/** Legacy-compatible documented content key; independent from exact replay digest. */
export function nativeWorklogContentKey(input: Readonly<{ title: string; summary: string; projectId: string }>) {
  return createHash("sha256").update(`${input.title}|${input.summary}|${input.projectId}`.normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()).digest("hex");
}
