import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deliverComplaintMail } from "@/lib/server/complaints";
import { resolveBillingReconcileSecret } from "@/lib/terraqo/scheduled-job-targets";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = resolveBillingReconcileSecret();
  const actual = Buffer.from(request.headers.get("authorization") || ""),
    expected = Buffer.from(`Bearer ${secret || ""}`);
  if (
    !secret ||
    secret.length < 32 ||
    actual.length !== expected.length ||
    !timingSafeEqual(actual, expected)
  )
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  return NextResponse.json({ processed: await deliverComplaintMail() });
}
