import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, handleApiError } from "@/lib/server/api";
import { getDefaultTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";
import { contactSchema } from "@/lib/validations/crm";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const parsed = contactSchema.parse(Object.fromEntries(formData));
    const terraqoWorkspaceId = await getDefaultTerraqoWorkspaceId();

    const contact = await prisma.contactMessage.create({
      data: {
        ...parsed,
        terraqoWorkspaceId,
        message: parsed.subject ? `[${parsed.subject}] ${parsed.message}` : parsed.message,
        context: parsed.context ?? parsed.subject
      }
    });
    return NextResponse.json({ ok: true, id: contact.id }, { status: 201 });
  } catch (error) {
    return handleApiError(error);
  }
}

export function GET() {
  return fail("Metodo no permitido", 405);
}
