import "server-only";
import { isParsedNativeWorklogSnapshot, nativeWorklogFingerprint, type parseNativeWorklogPayload } from "./native-worklog-payload";

type Parsed = Awaited<ReturnType<typeof parseNativeWorklogPayload>>;
const dayMs = 86_400_000;
export class NativeWorklogBaseDecisionError extends Error {
  readonly status = 503;
  constructor() { super("La decisión de reputación no está disponible."); }
}
const invalid = (): never => { throw new NativeWorklogBaseDecisionError(); };

/** Internal only: counts must be read under the owner lock, including earlier durable
 * allocations still PENDING. This pure policy does not establish their SQL provenance.
 */
export function decideNativeDeclaredWorklog(parsed: Parsed, createdAt: string, counts: Readonly<{
  priorDuplicates: number; rewardedInDay: number; trustedInWindow: number;
}>) {
  if (!isParsedNativeWorklogSnapshot(parsed) || !Object.isFrozen(parsed.payload) ||
      nativeWorklogFingerprint(parsed.payload) !== parsed.fingerprint) invalid();
  const stamp = Date.parse(createdAt);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(createdAt) ||
      !Number.isFinite(stamp) || new Date(stamp).toISOString() !== createdAt ||
      stamp < Date.UTC(2000, 0, 1) || stamp > Date.UTC(9998, 11, 31)) invalid();
  for (const value of [counts.priorDuplicates, counts.rewardedInDay, counts.trustedInWindow])
    if (!Number.isInteger(value) || value < 0 || value > 2_147_483_647) invalid();
  // Fixed product calendar: independent of the host TZ. Windows are returned as ISO
  // strings so a caller cannot mutate Dates after the decision has been frozen.
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Lima",
    year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(stamp));
  const part = (kind: string) => parts.find(item => item.type === kind)?.value ?? invalid();
  const start = Date.parse(`${part("year")}-${part("month")}-${part("day")}T00:00:00-05:00`);
  const duplicate = counts.priorDuplicates > 0;
  const dailyLimited = !duplicate && counts.rewardedInDay >= 3;
  const weeklyLimited = !duplicate && counts.trustedInWindow >= 10;
  const payload = parsed.payload;
  // The native create protocol accepts text only, with no confirmed evidence or
  // validation. It cannot promote this decision to COMPLETE/VALIDATED/STRONG.
  return Object.freeze({
    policyVersion: "native-declared-lima-v1" as const,
    fingerprint: parsed.fingerprint,
    createdAt,
    dayStart: new Date(start).toISOString(),
    dayEndExclusive: new Date(start + dayMs).toISOString(),
    trustStartInclusive: new Date(stamp - 7 * dayMs).toISOString(),
    trustEndInclusive: createdAt,
    availableAt: new Date(stamp + 7 * dayMs).toISOString(),
    priorDuplicates: counts.priorDuplicates,
    rewardedInDay: counts.rewardedInDay,
    trustedInWindow: counts.trustedInWindow,
    tqPoints: duplicate || dailyLimited ? 0 : 1,
    trustScore: duplicate || weeklyLimited ? 0 : 1,
    qualityScore: (payload.title.length >= 8 ? 15 : 5) +
      (payload.summary.length >= 80 ? 25 : 10) + (payload.outcome ? 15 : 0) +
      (payload.projectId ? 15 : 0),
    moderationStatus: duplicate ? "DUPLICATE" as const : "DECLARED" as const,
    riskScore: duplicate ? 90 : dailyLimited ? 20 : weeklyLimited ? 15 : 0,
    duplicate, dailyLimited, weeklyLimited,
  });
}
