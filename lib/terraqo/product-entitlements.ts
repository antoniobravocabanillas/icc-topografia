import "server-only";
import { prisma } from "@/lib/prisma";
import { effectivePlan } from "@/lib/terraqo/billing/entitlements";

export type TerraqoPilotFeature = "employer_needs" | "collaboration_closure" | "evidence_analysis";

export class TerraqoEntitlementError extends Error {
  constructor(public readonly code: "FEATURE_NOT_ENTITLED" | "FEATURE_LIMIT_REACHED", message: string, public readonly status: 403 | 429, public readonly retryAfterSeconds?: number) {
    super(message);
  }
}

function positiveLimit(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function pilotAllows(workspaceId: string) {
  const allowed = new Set((process.env.TERRAQO_B5_PILOT_WORKSPACE_IDS || "").split(",").map((value) => value.trim()).filter(Boolean));
  return allowed.has("*") || allowed.has(workspaceId);
}

function flagEnabled(feature: TerraqoPilotFeature) {
  if (feature === "employer_needs") return process.env.TERRAQO_DISCOVERY_NEEDS_V1 === "true";
  if (feature === "collaboration_closure") return process.env.TERRAQO_COLLABORATION_V1 === "true" && process.env.TERRAQO_CLOSURE_V1 === "true";
  return process.env.TERRAQO_EVIDENCE_ANALYSIS_V1 === "true";
}

export function featureMonthlyLimit(feature: TerraqoPilotFeature) {
  if (feature === "employer_needs") return positiveLimit(process.env.TERRAQO_EMPLOYER_NEEDS_MONTHLY_LIMIT, 25);
  if (feature === "evidence_analysis") return positiveLimit(process.env.TERRAQO_EVIDENCE_ANALYSIS_MONTHLY_LIMIT, 100);
  return null;
}

function monthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function secondsUntilNextMonth() {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

async function featureUsage(workspaceId: string, feature: TerraqoPilotFeature) {
  const since = monthStart();
  if (feature === "employer_needs") return prisma.terraqoWorkNeed.count({ where: { workspaceId, createdAt: { gte: since } } });
  if (feature === "evidence_analysis") return prisma.terraqoAnalysisJob.count({ where: { workspaceId, createdAt: { gte: since } } });
  return 0;
}

export async function getWorkspaceProductEntitlements(userId: string, workspaceId: string) {
  const plan = await effectivePlan(userId, workspaceId);
  const pilot = pilotAllows(workspaceId);
  const features = await Promise.all((["employer_needs", "collaboration_closure", "evidence_analysis"] as const).map(async (feature) => {
    const enabled = flagEnabled(feature);
    const limit = featureMonthlyLimit(feature);
    const active = enabled && pilot;
    const used = active && limit !== null ? await featureUsage(workspaceId, feature) : 0;
    return {
      feature,
      status: !enabled ? "DISABLED" as const : !pilot ? "PENDING_PILOT" as const : limit !== null && used >= limit ? "LIMIT_REACHED" as const : "ACTIVE" as const,
      active: active && (limit === null || used < limit),
      readPreserved: true,
      limit,
      used,
      remaining: limit === null ? null : Math.max(0, limit - used),
      source: pilot ? "PILOT_ALLOWLIST" as const : "NOT_GRANTED" as const,
    };
  }));
  return {
    workspaceId,
    plan: { code: plan.code, tier: plan.tier, audience: plan.audience },
    features,
  };
}

export async function requireWorkspacePilotFeature(userId: string, workspaceId: string, feature: TerraqoPilotFeature) {
  const entitlement = (await getWorkspaceProductEntitlements(userId, workspaceId)).features.find((item) => item.feature === feature)!;
  if (entitlement.status === "LIMIT_REACHED") throw new TerraqoEntitlementError("FEATURE_LIMIT_REACHED", "Alcanzaste el límite operativo del piloto. El historial permanece disponible.", 429, secondsUntilNextMonth());
  if (!entitlement.active) throw new TerraqoEntitlementError("FEATURE_NOT_ENTITLED", "Esta función no está habilitada para el workspace. El historial permanece disponible.", 403);
  return entitlement;
}
