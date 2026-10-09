import "server-only";

type LegacyFirstSnapshot = Readonly<{
  actorId: string;
  firstNativeCreatedAt: string;
  observedAt: string;
  accountId: string | null;
  contribution: Readonly<{
    id: string; userId: string; sourceKey: string | null; type: string; status: string;
    requestedPoints: number; approvedPoints: number; detail: string;
    createdAt: string; reviewedAt: string | null; availableAt: string | null; releasedAt: string | null;
  }>;
  ledger: readonly Readonly<{
    contributionId: string | null; accountId: string; redemptionId: string | null;
    type: string; pointsDelta: number; scoreDelta: number; idempotencyKey: string;
    createdAt: string;
  }>[];
}>;

function calendar(value: string | null): number | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const millis = Date.parse(value);
  return Number.isFinite(millis) && new Date(millis).toISOString() === value ? millis : null;
}

/** Internal read-only assessment of the legacy automated FIRST award. Legacy review
 * credits directly and does not set releasedAt. Recognizing that history must never
 * normalize dates, create another CREDIT, or infer eligibility for an unfinished award.
 * The future caller must obtain these rows under owner/contribution/account locks and
 * separately verify complete accounting/floors; this observation authorizes no mutation.
 */
export function inspectLegacyFirstWorklogHistory(snapshot: LegacyFirstSnapshot) {
  const report = (disposition: "CREDIT_HISTORY_OBSERVED" | "REVIEW_REQUIRED") => Object.freeze({
    disposition, completionAuthorized: false as const, creditAuthorized: false as const,
  });
  const c = snapshot.contribution;
  const created = calendar(c.createdAt), reviewed = calendar(c.reviewedAt);
  const firstNative = calendar(snapshot.firstNativeCreatedAt), observed = calendar(snapshot.observedAt);
  if (!snapshot.actorId || !c.id || c.userId !== snapshot.actorId ||
      c.sourceKey !== `first-worklog:${snapshot.actorId}` || c.type !== "FIRST_WORKLOG" ||
      !["VALIDATED", "IMPLEMENTED"].includes(c.status) || c.requestedPoints !== 25 || c.approvedPoints !== 25 ||
      c.detail.startsWith("native-first-worklog-v1:") || c.availableAt !== null ||
      created === null || reviewed === null || firstNative === null || observed === null ||
      created >= firstNative || firstNative > observed || reviewed < created || reviewed >= firstNative || reviewed > observed ||
      (c.releasedAt !== null && (calendar(c.releasedAt) === null ||
        calendar(c.releasedAt)! < created || calendar(c.releasedAt)! > observed)) ||
      !snapshot.accountId || snapshot.ledger.length !== 1) return report("REVIEW_REQUIRED");
  const row = snapshot.ledger[0], creditedAt = calendar(row.createdAt);
  if (row.contributionId !== c.id || row.accountId !== snapshot.accountId || row.redemptionId !== null ||
      row.type !== "CREDIT" || row.pointsDelta !== 25 || row.scoreDelta !== 25 ||
      row.idempotencyKey !== `contribution:${c.id}:25` || creditedAt === null ||
      creditedAt < created || creditedAt > reviewed) return report("REVIEW_REQUIRED");
  return report("CREDIT_HISTORY_OBSERVED");
}
