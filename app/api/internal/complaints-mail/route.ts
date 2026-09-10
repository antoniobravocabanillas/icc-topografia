import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { deliverComplaintMail } from "@/lib/server/complaints";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function POST(request: Request) {
  const secret = process.env.BILLING_RECONCILE_SECRET;
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
