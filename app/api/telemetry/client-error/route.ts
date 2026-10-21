import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";

const payloadSchema = z.object({
  source: z.string().trim().max(80),
  category: z.enum(["ASSET_VERSION", "NETWORK", "HYDRATION", "CLIENT_EXCEPTION"]),
  messageFingerprint: z.string().regex(/^[a-f0-9]{24}$/).nullable(),
  stackFingerprint: z.string().regex(/^[a-f0-9]{24}$/).nullable(),
  path: z.string().max(500).optional()
});

export async function POST(request: Request) {
  const requestId = randomUUID();
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 8_192) return NextResponse.json({ error: "Reporte demasiado grande." }, { status: 413, headers: { "x-request-id": requestId } });
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
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
