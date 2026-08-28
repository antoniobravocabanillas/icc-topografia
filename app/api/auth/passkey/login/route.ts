import { NextResponse } from "next/server";
import { z } from "zod";
import { accountPasskeyLoginOptions, verifyAccountPasskeyLogin } from "@/lib/server/account-passkey";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("options"), email: z.string().email() }),
  z.object({ action: z.literal("verify"), challengeId: z.string().min(1), response: z.unknown() })
]);

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  try {
    if (parsed.data.action === "options") {
      const data = await accountPasskeyLoginOptions(parsed.data.email, request);
      if (!data) return NextResponse.json({ error: "Esta cuenta todavía no tiene un acceso seguro activado en este dominio." }, { status: 404 });
      return NextResponse.json({ data });
    }
    return NextResponse.json({ data: await verifyAccountPasskeyLogin(parsed.data.challengeId, parsed.data.response as never) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No pudimos validar el dispositivo." }, { status: 400 });
  }
}
