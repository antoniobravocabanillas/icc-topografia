import { NextResponse } from "next/server";
import {
  boundedJson,
  billingRateLimit,
} from "@/lib/terraqo/billing/request-security";
import { assertBillingOrigin } from "@/lib/terraqo/billing/authorization";
import { BillingError } from "@/lib/terraqo/billing/provider";
import {
  submitComplaint,
  complaintReceipt,
  hash,
} from "@/lib/server/complaints";
import { ZodError, z } from "zod";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    assertBillingOrigin(request);
    const raw = (await boundedJson(request, 20000)) as Record<string, unknown>;
    const ip =
      request.headers.get("x-nf-client-connection-ip") ||
      request.headers.get("x-forwarded-for")?.split(",")[0] ||
      "unknown";
    await billingRateLimit(`complaint:${hash(ip)}`);
    if (raw.action === "lookup") {
      const { key } = z
        .object({ action: z.literal("lookup"), key: z.string().uuid() })
        .strict()
        .parse(raw);
      const receipt = await complaintReceipt(key);
      return NextResponse.json(
        receipt || { error: "No encontramos una hoja con esa clave." },
        {
          status: receipt ? 200 : 404,
          headers: { "Cache-Control": "no-store" },
        },
      );
    }
    await submitComplaint(raw);
    return NextResponse.json(await complaintReceipt(String(raw.key)), {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof ZodError)
      return NextResponse.json(
        {
          error: "Revisa los campos indicados.",
          fields: e.flatten().fieldErrors,
        },
        { status: 400 },
      );
    if (e instanceof BillingError)
      return NextResponse.json(
        {
          error:
            e.status === 429
              ? "Demasiados intentos. Espera unos minutos o solicita asistencia por teléfono."
              : "Solicitud no válida.",
        },
        { status: e.status },
      );
    if (e instanceof Error && e.message === "KEY_CONFLICT")
      return NextResponse.json(
        {
          error:
            "Esta clave ya registró otra hoja. Consulta tu constancia antes de iniciar una nueva.",
        },
        { status: 409 },
      );
    return NextResponse.json(
      {
        error:
          "No pudimos confirmar el registro. Conserva la clave y reintenta con los mismos datos; no se duplicará la hoja. También puedes solicitar asistencia al +51 925 912 607.",
      },
      { status: 503 },
    );
  }
}
