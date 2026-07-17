import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      service: "Terraqo API",
      status: "ok",
      environment: process.env.CONTEXT ?? process.env.NODE_ENV ?? "unknown",
      timestamp: new Date().toISOString()
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
