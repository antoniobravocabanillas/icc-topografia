import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { generateTerraqoText, hasConfiguredAiProvider } from "@/lib/terraqo/ai-provider";
import { getSessionTerraqoWorkspace, hasWorkspaceModule } from "@/lib/terraqo/workspace-scope";

const requestSchema = z.object({
  text: z.string().trim().min(3).max(6000),
  purpose: z.enum(["experience", "highlights", "worklog", "post", "profile", "general"]).default("general")
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });

  const workspace = await getSessionTerraqoWorkspace().catch(() => null);
  if (!workspace || !(await hasWorkspaceModule("AI_WRITING_ASSISTANT", workspace.id))) {
    return NextResponse.json({ error: "El módulo Asistente de escritura con IA no está activo en este workspace." }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Escribe al menos una idea breve para mejorarla." }, { status: 400 });
  if (!hasConfiguredAiProvider()) return NextResponse.json({ error: "El asistente de redacción no está configurado." }, { status: 503 });

  const purposeCopy = {
    experience: "una experiencia profesional verificable",
    highlights: "una lista de logros o responsabilidades, conservando un punto por línea",
    worklog: "una bitácora de trabajo y evidencia operativa",
    post: "una publicación profesional para la comunidad",
    profile: "un perfil o extracto profesional",
    general: "un texto profesional"
  }[parsed.data.purpose];

  const result = await generateTerraqoText([
    {
      role: "system",
      content: `Eres el asistente editorial de Terraqo. Corrige ortografía, gramática, sintaxis y claridad en español para ${purposeCopy}. Conserva estrictamente los hechos, cifras, empresas, cargos y alcance escritos por el usuario. No inventes experiencia, resultados, certificaciones ni responsabilidades. Devuelve únicamente el texto final, sin explicación, encabezados ni comillas.`
    },
    { role: "user", content: parsed.data.text }
  ]);

  if (!result.ok) {
    console.warn("Terraqo writing assistant upstream error", { status: result.status, code: result.code, provider: result.provider || "none" });
    if (result.code === "insufficient_quota") return NextResponse.json({ error: "El asistente está temporalmente sin cuota disponible." }, { status: 503 });
    if (result.status === 401 || result.status === 403) return NextResponse.json({ error: "La credencial del asistente necesita ser renovada." }, { status: 503 });
    if (result.status === 429) return NextResponse.json({ error: "El asistente está recibiendo demasiadas solicitudes. Espera unos segundos." }, { status: 429 });
    if (result.status === 504) return NextResponse.json({ error: "El asistente tardó demasiado. Inténtalo nuevamente." }, { status: 504 });
    return NextResponse.json({ error: "No pudimos mejorar el texto en este momento." }, { status: 502 });
  }
  return NextResponse.json({ data: { text: result.text } });
}
