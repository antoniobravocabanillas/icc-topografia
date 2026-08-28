import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { accountPasskeyRegistrationOptions, verifyAccountPasskeyRegistration } from "@/lib/server/account-passkey";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("options") }),
  z.object({ action: z.literal("verify"), challengeId: z.string().min(1), response: z.unknown(), deviceName: z.string().max(100).optional() })
]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  try {
    const data = parsed.data.action === "options"
      ? await accountPasskeyRegistrationOptions(session.user.id, request)
      : await verifyAccountPasskeyRegistration(session.user.id, parsed.data.challengeId, parsed.data.response as never, parsed.data.deviceName);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No pudimos activar el dispositivo." }, { status: 400 });
  }
}
