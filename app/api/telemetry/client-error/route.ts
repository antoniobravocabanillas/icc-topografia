import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { BoundedRequestBodyError, readBoundedJson } from "@/lib/server/bounded-request-body";

const payloadSchema = z.object({
  source: z.string().trim().max(80),
  category: z.enum(["ASSET_VERSION", "NETWORK", "HYDRATION", "CLIENT_EXCEPTION"]),
  messageFingerprint: z.string().regex(/^[a-f0-9]{24}$/).nullable(),
  stackFingerprint: z.string().regex(/^[a-f0-9]{24}$/).nullable(),
  path: z.string().max(500).optional()
});

export async function POST(request: Request) {
  const requestId = randomUUID();
  let raw: unknown;
  try {
    raw = await readBoundedJson(request, 8_192);
  } catch (error) {
    if (error instanceof BoundedRequestBodyError) {
      const message = error.code === "BODY_TOO_LARGE" ? "Reporte demasiado grande." : "Reporte inválido.";
      return NextResponse.json({ error: message }, { status: error.status, headers: { "x-request-id": requestId } });
    }
    throw error;
  }
  const parsed = payloadSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Reporte inválido." }, { status: 400, headers: { "x-request-id": requestId } });
  const session = await auth().catch(() => null);
  console.error("Terraqo client exception", {
    requestId,
    source: parsed.data.source,
    category: parsed.data.category,
    messageFingerprint: parsed.data.messageFingerprint,
    stackFingerprint: parsed.data.stackFingerprint,
    path: parsed.data.path?.split(/[?#]/, 1)[0] || null,
    userId: session?.user?.id || null,
    userRole: session?.user?.role || null
  });
  return new NextResponse(null, { status: 204, headers: { "x-request-id": requestId } });
}
