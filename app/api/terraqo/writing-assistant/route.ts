import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";

const requestSchema = z.object({
  text: z.string().trim().min(3).max(6000),
  purpose: z.enum(["experience", "highlights", "worklog", "post", "profile", "general"]).default("general")
});

type OpenAIResponse = {
  output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
};

function responseText(payload: OpenAIResponse) {
  return payload.output
    ?.flatMap((item) => item.content || [])
    .filter((content) => content.type === "output_text" && typeof content.text === "string")
    .map((content) => content.text)
    .join("\n")
    .trim();
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Debes iniciar sesión." }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Escribe al menos una idea breve para mejorarla." }, { status: 400 });
  if (!process.env.OPENAI_API_KEY) return NextResponse.json({ error: "El asistente de redacción no está configurado." }, { status: 503 });

  const purposeCopy = {
    experience: "una experiencia profesional verificable",
    highlights: "una lista de logros o responsabilidades, conservando un punto por línea",
    worklog: "una bitácora de trabajo y evidencia operativa",
    post: "una publicación profesional para la comunidad",
    profile: "un perfil o extracto profesional",
    general: "un texto profesional"
  }[parsed.data.purpose];

  const upstream = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_TEXT_MODEL || "gpt-5.4-mini",
      store: false,
      max_output_tokens: 1200,
      instructions: `Eres el asistente editorial de Terraqo. Corrige ortografía, gramática, sintaxis y claridad en español para ${purposeCopy}. Conserva estrictamente los hechos, cifras, empresas, cargos y alcance escritos por el usuario. No inventes experiencia, resultados, certificaciones ni responsabilidades. Devuelve únicamente el texto final, sin explicación, encabezados ni comillas.`,
      input: parsed.data.text
    }),
    signal: AbortSignal.timeout(25_000)
  }).catch(() => null);

  if (!upstream?.ok) return NextResponse.json({ error: "No pudimos mejorar el texto en este momento." }, { status: 502 });
  const improved = responseText(await upstream.json() as OpenAIResponse);
  if (!improved) return NextResponse.json({ error: "El asistente no devolvió una corrección utilizable." }, { status: 502 });
  return NextResponse.json({ data: { text: improved } });
}
