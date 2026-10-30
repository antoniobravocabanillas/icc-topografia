import type { Prisma } from "@prisma/client";

export type EvaluationSourceFieldPolicy = string[] | null;

export function readSnapshotAllowedFields(snapshot: Prisma.JsonValue): EvaluationSourceFieldPolicy | undefined {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return undefined;
  const value = (snapshot as Prisma.JsonObject).allowedFields;
  if (value === null) return null;
  if (!Array.isArray(value) || value.some((field) => typeof field !== "string")) return undefined;
  return [...new Set(value as string[])];
}

/** A later share-policy edit may only narrow a dossier source. It can never
 * reveal a field that was absent when the source was attached. Legacy rows
 * without the snapshot remain constrained by the current live policy. */
export function constrainAllowedFields(
  current: EvaluationSourceFieldPolicy,
  snapshot: Prisma.JsonValue,
): EvaluationSourceFieldPolicy {
  const frozen = readSnapshotAllowedFields(snapshot);
  if (frozen === undefined) return current;
  if (current === null) return frozen;
  if (frozen === null) return current;
  const frozenSet = new Set(frozen);
  return [...new Set(current)].filter((field) => frozenSet.has(field));
}
