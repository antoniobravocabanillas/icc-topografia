import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handleApiError } from "@/lib/server/api";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { leadSchema } from "@/lib/validations/crm";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const parsed = leadSchema.parse(Object.fromEntries(formData));
    const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();

    const lead = await prisma.lead.create({
      data: {
        terraqoWorkspaceId,
        name: parsed.name,
        email: parsed.email,
        phone: parsed.phone,
        company: parsed.company,
        message: parsed.subject ? `[${parsed.subject}] ${parsed.message}` : parsed.message,
        source: parsed.context ?? parsed.subject ?? parsed.intent ?? "web"
      }
    });

    return NextResponse.json({ ok: true, id: lead.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export function GET() {
  return fail("Metodo no permitido", 405);
}
