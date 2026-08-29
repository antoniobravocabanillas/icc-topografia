import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";

const payloadSchema = z.object({
  source: z.string().trim().max(80),
  message: z.string().trim().max(1000),
  stack: z.string().max(5000).optional(),
  digest: z.string().max(200).optional(),
  path: z.string().max(500).optional()
});

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Reporte inválido." }, { status: 400 });
  const session = await auth().catch(() => null);
  console.error("Terraqo client exception", {
    ...parsed.data,
    userId: session?.user?.id || null,
    userRole: session?.user?.role || null
  });
  return new NextResponse(null, { status: 204 });
}
