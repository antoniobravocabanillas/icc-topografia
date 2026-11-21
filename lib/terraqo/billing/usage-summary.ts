import "server-only";
import { prisma } from "@/lib/prisma";
import { effectivePlan } from "./entitlements";
import { personalRetainedStorageUnits } from "./personal-storage-usage";
import { BillingError } from "./provider";

export type PersonalUsageSummary = {
  plan: { code: string; name: string };
  period: string;
  storage: { used: number; limit: number; unit: "MB" };
  ai: { used: number; limit: number };
  automation: { used: number; limit: number };
};

function checkedUsage(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new BillingError("BILLING_UNAVAILABLE", 503);
  }
  return value;
}

/** Internal read projection. The route supplies billingUser().id, never a
 * requested owner/workspace. No missing bucket or account is initialized here.
 */
export async function personalUsageSummary(authenticatedUserId: string): Promise<PersonalUsageSummary> {
  if (!authenticatedUserId) throw new BillingError("AUTH_REQUIRED", 401);
  // Keep live expiration and legacy grants identical to quota enforcement.
  // This shared resolver uses its own reads; only usage/floor share the snapshot.
  const plan = await effectivePlan(authenticatedUserId);
  if (plan.audience !== "PERSONAL") throw new BillingError("BILLING_UNAVAILABLE", 503);
  const ownerKey = `user:${authenticatedUserId}`;

  return prisma.$transaction(async tx => {
    // Same UTC calendar month as reserveMonthlyUsage, regardless of billing cycle.
    const period = new Date().toISOString().slice(0, 7);
    const [buckets, retainedFloor] = await Promise.all([
      tx.terraqoUsageBucket.findMany({
        where: { ownerKey, OR: [
          { period, metric: { in: ["ai", "automation"] } },
          { period: "retained", metric: "storage-mb" },
        ] },
        select: { period: true, metric: true, used: true },
      }),
      personalRetainedStorageUnits(tx, authenticatedUserId),
    ]);
    const used = (metric: string, bucketPeriod: string) => checkedUsage(
      buckets.find(bucket => bucket.metric === metric && bucket.period === bucketPeriod)?.used ?? 0,
    );
    return {
      plan: { code: plan.code, name: plan.name },
      period,
      // Charged MB units include per-upload rounding and in-flight reservations.
      // The floor includes all retained versions (even withdrawn) and durable
      // pending attempts. It overlaps the bucket: take max, never add/refund.
      storage: { used: Math.max(used("storage-mb", "retained"), checkedUsage(retainedFloor)), limit: plan.storageMb, unit: "MB" },
      ai: { used: used("ai", period), limit: plan.aiActions },
      automation: { used: used("automation", period), limit: plan.automationRuns },
    };
  }, { isolationLevel: "RepeatableRead", maxWait: 15000, timeout: 10000 });
}
