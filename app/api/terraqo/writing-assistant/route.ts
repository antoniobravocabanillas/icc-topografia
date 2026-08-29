import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { generateTerraqoText, hasConfiguredAiProvider } from "@/lib/terraqo/ai-provider";
import { getSessionWorkspaceWithModule } from "@/lib/terraqo/workspace-scope";

const requestSchema = z.object({
  text: z.string().trim().min(3).max(6000),
  purpose: z.enum(["experience", "highlights", "worklog", "post", "profile", "general"]).default("general")
});

const assistantResultSchema = z.object({
  language: z.string().trim().min(2).max(80),
  corrected: z.string().trim().min(1).max(12000),
  improved: z.string().trim().min(1).max(12000)
});

function parseAssistantResult(text: string) {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const parsed = assistantResultSchema.safeParse(JSON.parse(normalized.slice(start, end + 1)));
  return parsed.success ? parsed.data : null;
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });

  const workspace = await getSessionWorkspaceWithModule("AI_WRITING_ASSISTANT").catch(() => null);
  if (!workspace) {
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
      content: `Eres el asistente editorial de Terraqo para ${purposeCopy}. Detecta el idioma del texto y responde en ese mismo idioma. Conserva estrictamente los hechos, cifras, empresas, cargos, intención y alcance escritos por el usuario. No inventes experiencia, resultados, certificaciones ni responsabilidades. Genera dos versiones: "corrected", que sólo corrige ortografía, gramática, puntuación y sintaxis manteniendo al máximo las palabras y extensión originales; e "improved", que reescribe como un experto de forma más clara, profesional y, cuando aporte valor, ligeramente más amplia, sin exagerar ni perder la esencia. Devuelve exclusivamente JSON válido con esta forma exacta: {"language":"idioma detectado","corrected":"texto corregido","improved":"texto mejorado"}. No uses Markdown ni bloques de código.`
    },
    { role: "user", content: parsed.data.text }
  ], 2400);

  if (!result.ok) {
    console.warn("Terraqo writing assistant upstream error", { status: result.status, code: result.code, provider: result.provider || "none" });
    if (result.code === "insufficient_quota") return NextResponse.json({ error: "El asistente está temporalmente sin cuota disponible." }, { status: 503 });
    if (result.status === 401 || result.status === 403) return NextResponse.json({ error: "La credencial del asistente necesita ser renovada." }, { status: 503 });
    if (result.status === 429) return NextResponse.json({ error: "El asistente está recibiendo demasiadas solicitudes. Espera unos segundos." }, { status: 429 });
    if (result.status === 504) return NextResponse.json({ error: "El asistente tardó demasiado. Inténtalo nuevamente." }, { status: 504 });
    return NextResponse.json({ error: "No pudimos mejorar el texto en este momento." }, { status: 502 });
  }
  let suggestions = null;
  try {
    suggestions = parseAssistantResult(result.text);
  } catch {
    suggestions = null;
  }
  if (!suggestions) return NextResponse.json({ error: "El asistente no devolvió alternativas válidas. Inténtalo nuevamente." }, { status: 502 });
  return NextResponse.json({ data: suggestions });
}
