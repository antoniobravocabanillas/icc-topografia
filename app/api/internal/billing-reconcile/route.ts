import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { configuredBillingMode } from "@/lib/terraqo/billing/provider";
import { reconcileAccount } from "@/lib/terraqo/billing/service";
import { resolveBillingReconcileSecret } from "@/lib/terraqo/scheduled-job-targets";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = resolveBillingReconcileSecret();
  const presented = request.headers.get("authorization") || "";
  const expected = `Bearer ${secret || ""}`;
  if (
    !secret ||
    secret.length < 32 ||
    presented.length !== expected.length ||
    !timingSafeEqual(Buffer.from(presented), Buffer.from(expected))
  ) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const mode = configuredBillingMode();
  if (!mode) {
    return NextResponse.json(
      { status: "disabled", checked: 0, retry: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const now = new Date();
  const due = await prisma.terraqoBillingAccount.findMany({
    where: {
      mode,
      currentAttemptId: { not: null },
      OR: [{ nextReconcileAt: null }, { nextReconcileAt: { lte: now } }],
    },
    orderBy: { nextReconcileAt: "asc" },
    take: 5,
    select: { id: true, updatedAt: true },
  });
  const result = await Promise.all(due.map(async account => {
    // Lease only schedules work; service reconciliation has its own optimistic fence.
    const lease = await prisma.terraqoBillingAccount.updateMany({
      where: { id: account.id, updatedAt: account.updatedAt },
      data: { nextReconcileAt: new Date(Date.now() + 5 * 60_000) },
    });
    if (!lease.count) return "busy";
    try {
      await reconcileAccount(account.id);
      return "checked";
    } catch {
      return "retry";
    }
  }));
  return NextResponse.json(
    {
      checked: result.filter(value => value === "checked").length,
      retry: result.filter(value => value === "retry").length,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
