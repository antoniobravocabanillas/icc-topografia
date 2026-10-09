import "server-only";

type LegacyValidationSnapshot = Readonly<{
  actorId: string; accountId: string | null; firstNativeCreatedAt: string; observedAt: string;
  contribution: Readonly<{
    id: string; userId: string; sourceKey: string | null; type: string; status: string;
    requestedPoints: number; approvedPoints: number; createdAt: string; reviewedAt: string | null;
    availableAt: string | null; releasedAt: string | null;
  }>;
  validation: Readonly<{
    id: string; worklogId: string; workspaceId: string; requestedByUserId: string;
    validatorUserId: string; status: string; credentialId: string | null;
    createdAt: string; requestedAt: string; resolvedAt: string | null;
  }> | null;
  worklog: Readonly<{
    id: string; authorId: string; workspaceId: string; createdAt: string;
    nativeTarget: boolean; deletedAt: string | null;
  }> | null;
  ledger: readonly Readonly<{
    contributionId: string | null; accountId: string; redemptionId: string | null;
    type: string; pointsDelta: number; scoreDelta: number; idempotencyKey: string; createdAt: string;
  }>[];
}>;

function calendar(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value ? millis : null;
}

/** Observe a complete legacy validator reward; never recalculate pair counters or award
 * an unfinished validation. The caller must obtain the source, target, contribution,
 * native target history, and account/ledger under locks. Metadata is not a WebAuthn
 * signature proof, account floor proof, or authority to mark accounting APPLIED.
 */
export function inspectLegacyWorklogValidationHistory(snapshot: LegacyValidationSnapshot) {
  const report = (disposition: "CREDIT_HISTORY_OBSERVED" | "REVIEW_REQUIRED") => Object.freeze({
    disposition, creditAuthorized: false as const, completionAuthorized: false as const,
  });
  const c = snapshot.contribution, v = snapshot.validation, w = snapshot.worklog;
  const firstNative = calendar(snapshot.firstNativeCreatedAt), observed = calendar(snapshot.observedAt);
  const created = calendar(c.createdAt), reviewed = calendar(c.reviewedAt);
  // Automated legacy review credits directly. Preserve its saved amount (5 or 20)
  // and releasedAt=NULL; no normalization or inference from today's validation count.
  if (!snapshot.actorId || !snapshot.accountId || !c.id || c.userId !== snapshot.actorId ||
      c.type !== "EXPERIENCE_VALIDATION" || !["VALIDATED", "IMPLEMENTED"].includes(c.status) ||
      ![5, 20].includes(c.approvedPoints) || c.requestedPoints !== c.approvedPoints ||
      c.availableAt !== null || c.releasedAt !== null || !v || !w ||
      !v.id || c.sourceKey !== `worklog-validation:${v.id}` ||
      v.validatorUserId !== snapshot.actorId || !v.requestedByUserId || v.requestedByUserId === snapshot.actorId ||
      v.status !== "APPROVED" || !v.credentialId?.trim() ||
      !w.id || v.worklogId !== w.id || w.authorId !== v.requestedByUserId ||
      !v.workspaceId || v.workspaceId !== w.workspaceId || w.nativeTarget !== false || w.deletedAt !== null ||
      firstNative === null || observed === null || firstNative > observed ||
      created === null || reviewed === null || created >= firstNative || reviewed < created || reviewed >= firstNative ||
      snapshot.ledger.length !== 1) return report("REVIEW_REQUIRED");
  const requested = calendar(v.requestedAt), validationCreated = calendar(v.createdAt);
  const resolved = calendar(v.resolvedAt), worklogCreated = calendar(w.createdAt);
  if (requested === null || validationCreated === null || resolved === null || worklogCreated === null ||
      worklogCreated > requested || requested > validationCreated || validationCreated > resolved ||
      resolved > created) return report("REVIEW_REQUIRED");
  const row = snapshot.ledger[0], credited = calendar(row.createdAt);
  if (row.contributionId !== c.id || row.accountId !== snapshot.accountId || row.redemptionId !== null ||
      row.type !== "CREDIT" || row.pointsDelta !== c.approvedPoints || row.scoreDelta !== c.approvedPoints ||
      row.idempotencyKey !== `contribution:${c.id}:${c.approvedPoints}` || credited === null ||
      credited < created || credited > reviewed) return report("REVIEW_REQUIRED");
  return report("CREDIT_HISTORY_OBSERVED");
}
