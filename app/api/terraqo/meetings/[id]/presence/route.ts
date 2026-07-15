import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { TerraqoMeetError, updateMeetingPresence } from "@/lib/terraqo/meet";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    await updateMeetingPresence(id, session.user.id, body.joined !== false);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof TerraqoMeetError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo actualizar la reunion." }, { status });
  }
}
