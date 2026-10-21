import type { TerraqoEndorsementStatus } from "@prisma/client";

export type EndorsementFieldDecision =
  | "CONFIRMED"
  | "UNABLE_TO_CONFIRM"
  | "CHANGES_REQUESTED";

export function deriveEndorsementStatus(
  decisions: readonly EndorsementFieldDecision[],
): TerraqoEndorsementStatus {
  if (decisions.length === 0) return "IN_REVIEW";
  if (decisions.includes("CHANGES_REQUESTED")) return "CHANGES_REQUESTED";
  if (decisions.every((decision) => decision === "CONFIRMED")) return "CONFIRMED";
  if (decisions.every((decision) => decision === "UNABLE_TO_CONFIRM")) return "DECLINED";
  return "PARTIAL";
}
