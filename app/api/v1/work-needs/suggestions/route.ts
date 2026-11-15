import { z } from "zod";
import { fail, handleApiError, ok } from "@/lib/server/api";
import { BoundedRequestBodyError, readBoundedJson } from "@/lib/server/bounded-request-body";
import { requireDiscoveryWorkspaceActor } from "@/lib/server/discovery-needs-auth";
import { DiscoveryNeedsError } from "@/lib/terraqo/discovery-needs";
import { requireWorkspaceNeedsAccess } from "@/lib/terraqo/product-entitlements";
import { hasWorkspaceModule } from "@/lib/terraqo/workspace-scope";
import { generateTerraqoText, hasConfiguredAiProvider } from "@/lib/terraqo/ai-provider";
import { reserveMonthlyUsage } from "@/lib/terraqo/billing/entitlements";
import { BillingError } from "@/lib/terraqo/billing/provider";

const inputSchema = z.object({
  activity: z.string().trim().min(2).max(2400),
  context: z.string().trim().max(1600),
});
const suggestionsSchema = z.object({
  suggestions: z.array(z.object({
    label: z.string().trim().min(2).max(180),
    priority: z.enum(["REQUIRED", "DESIRED"]),
  })).min(1).max(8),
});

function uniqueCriteria<T extends { label: string }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.label.toLocaleLowerCase("es-PE");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

export async function POST(request: Request) {
  if (process.env.TERRAQO_DISCOVERY_NEEDS_V1 !== "true") return fail("Recurso no disponible.", 404);
  try {
    const { workspace, session } = await requireDiscoveryWorkspaceActor();
    await requireWorkspaceNeedsAccess(session.user.id, workspace.id);
    const input = inputSchema.parse(await readBoundedJson(request, 20_000));
    const labels = input.activity.split(/[,;\n]+/).map(label => label.trim()).filter(label => label.length >= 2 && label.length <= 180);
    const local = () => ok({
      source: "local",
      suggestions: uniqueCriteria(labels.map(label => ({ label, priority: "DESIRED" }))),
    });
    if (process.env.TERRAQO_NEED_SUGGESTIONS_LOCAL_WORKSPACE === workspace.id || !hasConfiguredAiProvider() ||
        !await hasWorkspaceModule("AI_WRITING_ASSISTANT", workspace.id)) return local();

    const usage = await reserveMonthlyUsage(session.user.id, "ai", workspace.id).catch(error => {
      if (error instanceof BillingError && error.code === "MONTHLY_QUOTA_REACHED") return null;
      throw error;
    });
    if (!usage) return local();

    // Nothing is written to a draft here. Only an explicit edit can persist a criterion.
    let delivered = false;
    try {
      const result = await generateTerraqoText([
        { role: "system", content: 'Extrae hasta ocho criterios técnicos verificables del trabajo descrito. Usa exclusivamente el texto facilitado. Omite características personales. Marca DESIRED salvo exigencia explícita. Devuelve JSON con {"suggestions":[{"label":"…","priority":"DESIRED"}]}. Las prioridades permitidas son REQUIRED y DESIRED.' },
        { role: "user", content: JSON.stringify(input) },
      ], 600);
      if (result.ok) {
        let proposal: unknown;
        try { proposal = JSON.parse(result.text); } catch { return local(); }
        const parsed = suggestionsSchema.safeParse(proposal);
        if (parsed.success) {
          delivered = true;
          return ok({ source: "ai", suggestions: uniqueCriteria(parsed.data.suggestions) });
        }
      }
      return local();
    } finally {
      if (!delivered) await usage.release();
    }
  } catch (error) {
    if (error instanceof DiscoveryNeedsError) return fail(error.message, error.status);
    if (error instanceof BoundedRequestBodyError) return fail("No se pudo leer la solicitud.", error.status);
    return handleApiError(error);
  }
}
