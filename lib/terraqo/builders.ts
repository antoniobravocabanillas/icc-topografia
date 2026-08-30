import { randomUUID } from "crypto";
import type { Prisma, TerraqoBuilderContributionStatus, TerraqoBuilderContributionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const BUILDER_REWARDS = [
  { slug: "premium-30", title: "Terraqo Premium", description: "Activa 30 días de beneficios Premium en tu perfil personal.", category: "PREMIUM" as const, pointsCost: 500, benefitCode: "PREMIUM_DAYS", durationDays: 30, quantity: 1 },
  { slug: "validation-credit", title: "Validación profesional", description: "Obtén un crédito para una validación profesional sin costo.", category: "VALIDATION" as const, pointsCost: 800, benefitCode: "VALIDATION_CREDIT", durationDays: null, quantity: 1 },
  { slug: "profile-boost-7", title: "Perfil destacado", description: "Mejora la visibilidad de tu perfil durante 7 días.", category: "VISIBILITY" as const, pointsCost: 400, benefitCode: "PROFILE_BOOST", durationDays: 7, quantity: 1 },
  { slug: "profile-boost-14", title: "Aumento de visibilidad", description: "Prioridad en resultados y sugerencias durante 14 días.", category: "VISIBILITY" as const, pointsCost: 650, benefitCode: "PROFILE_BOOST", durationDays: 14, quantity: 1 },
  { slug: "early-access-30", title: "Acceso anticipado", description: "Prueba durante 30 días funciones Beta seleccionadas.", category: "EARLY_ACCESS" as const, pointsCost: 600, benefitCode: "EARLY_ACCESS", durationDays: 30, quantity: 1 },
  { slug: "validation-pack-2", title: "Pack de validaciones", description: "Dos créditos para fortalecer la confianza de tu CV vivo.", category: "VALIDATION" as const, pointsCost: 1400, benefitCode: "VALIDATION_CREDIT", durationDays: null, quantity: 2 }
];

export const CONTRIBUTION_POINTS: Record<TerraqoBuilderContributionType, number> = {
  BUG_REPORT: 50,
  SUGGESTION: 100,
  RESEARCH: 30,
  REFERRAL: 75,
  COMPANY_REFERRAL: 200,
  FIRST_WORKLOG: 25,
  EXPERIENCE_VALIDATION: 20,
  BETA_PARTICIPATION: 50
};

export function builderLevel(score: number, founding = false) {
  if (founding) return { name: "Founding Builder", level: 5, min: 3000, next: null as number | null };
  if (score >= 1500) return { name: "Pioneer", level: 4, min: 1500, next: 3000 };
  if (score >= 750) return { name: "Builder", level: 3, min: 750, next: 1500 };
  if (score >= 250) return { name: "Contributor", level: 2, min: 250, next: 750 };
  return { name: "Explorer", level: 1, min: 0, next: 250 };
}

export async function ensureBuilders(userId: string) {
  await prisma.$transaction(
    BUILDER_REWARDS.map((reward) => prisma.terraqoBuilderReward.upsert({
      where: { slug: reward.slug },
      update: { ...reward, active: true },
      create: reward
    }))
  );
  return prisma.terraqoBuilderAccount.upsert({ where: { userId }, update: {}, create: { userId } });
}

export async function submitBuilderContribution(input: { userId: string; workspaceId?: string | null; type: TerraqoBuilderContributionType; title: string; detail: string }) {
  const title = input.title.trim().slice(0, 140);
  const detail = input.detail.trim().slice(0, 4000);
  if (!title || title.length < 5 || detail.length < 20) throw new Error("Describe el aporte con suficiente detalle.");
  if (!["BUG_REPORT", "SUGGESTION", "RESEARCH"].includes(input.type)) throw new Error("Tipo de aporte no permitido.");
  await ensureBuilders(input.userId);
  return prisma.terraqoBuilderContribution.create({ data: {
    userId: input.userId,
    workspaceId: input.workspaceId || null,
    type: input.type,
    title,
    detail,
    requestedPoints: CONTRIBUTION_POINTS[input.type]
  } });
}

export async function awardAutomatedBuilderContribution(input: { userId: string; type: TerraqoBuilderContributionType; sourceKey: string; title: string; detail: string; points?: number }) {
  const existing = await prisma.terraqoBuilderContribution.findUnique({ where: { sourceKey: input.sourceKey }, select: { id: true } });
  if (existing) return existing;
  const contribution = await prisma.terraqoBuilderContribution.create({ data: {
    userId: input.userId,
    type: input.type,
    title: input.title,
    detail: input.detail,
    sourceKey: input.sourceKey,
    requestedPoints: input.points ?? CONTRIBUTION_POINTS[input.type],
    status: "VALIDATED"
  } });
  await reviewBuilderContribution({ contributionId: contribution.id, reviewerId: "system", status: "VALIDATED", points: input.points ?? CONTRIBUTION_POINTS[input.type], note: "Aporte verificado automáticamente por Terraqo." });
  return contribution;
}

export async function reviewBuilderContribution(input: { contributionId: string; reviewerId: string; status: TerraqoBuilderContributionStatus; points: number; note?: string }) {
  if (!["VALIDATED", "IMPLEMENTED", "REJECTED", "IN_REVIEW"].includes(input.status)) throw new Error("Estado inválido.");
  const safePoints = Math.max(0, Math.min(1000, Math.round(input.points)));
  return prisma.$transaction(async (tx) => {
    const contribution = await tx.terraqoBuilderContribution.findUnique({ where: { id: input.contributionId } });
    if (!contribution) throw new Error("Aporte no encontrado.");
    const targetTotal = ["VALIDATED", "IMPLEMENTED"].includes(input.status) ? safePoints : contribution.approvedPoints;
    const delta = Math.max(0, targetTotal - contribution.approvedPoints);
    let account = await tx.terraqoBuilderAccount.upsert({ where: { userId: contribution.userId }, update: {}, create: { userId: contribution.userId } });
    if (delta > 0) {
      account = await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: { availablePoints: { increment: delta }, lifetimeEarned: { increment: delta }, contributionScore: { increment: delta } } });
      await tx.terraqoBuilderLedger.create({ data: {
        accountId: account.id,
        contributionId: contribution.id,
        type: "CREDIT",
        pointsDelta: delta,
        scoreDelta: delta,
        balanceAfter: account.availablePoints,
        description: input.status === "IMPLEMENTED" ? "Mejora implementada en Terraqo" : "Aporte validado por Terraqo",
        idempotencyKey: `contribution:${contribution.id}:${targetTotal}`
      } });
    }
    return tx.terraqoBuilderContribution.update({ where: { id: contribution.id }, data: {
      status: input.status,
      approvedPoints: targetTotal,
      reviewerId: input.reviewerId,
      reviewNote: input.note?.trim().slice(0, 1000) || null,
      reviewedAt: new Date(),
      implementedAt: input.status === "IMPLEMENTED" ? new Date() : contribution.implementedAt
    } });
  }, { isolationLevel: "Serializable" });
}

function extendDate(current: Date | null, days: number) {
  const base = current && current > new Date() ? current : new Date();
  return new Date(base.getTime() + days * 86_400_000);
}

export async function redeemBuilderReward(input: { userId: string; rewardId: string; idempotencyKey?: string }) {
  const key = input.idempotencyKey || randomUUID();
  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.terraqoBuilderRedemption.findUnique({ where: { idempotencyKey: key }, include: { reward: true } });
    if (duplicate) return duplicate;
    const account = await tx.terraqoBuilderAccount.upsert({ where: { userId: input.userId }, update: {}, create: { userId: input.userId } });
    const reward = await tx.terraqoBuilderReward.findFirst({ where: { id: input.rewardId, active: true } });
    if (!reward) throw new Error("La recompensa ya no está disponible.");
    if (reward.inventory !== null && reward.inventory <= 0) throw new Error("La recompensa se agotó.");
    const debited = await tx.terraqoBuilderAccount.updateMany({ where: { id: account.id, availablePoints: { gte: reward.pointsCost } }, data: { availablePoints: { decrement: reward.pointsCost } } });
    if (debited.count !== 1) throw new Error("No tienes suficientes puntos TQ.");
    const updated = await tx.terraqoBuilderAccount.findUniqueOrThrow({ where: { id: account.id } });
    const benefitEndsAt = reward.durationDays ? extendDate(
      reward.benefitCode === "PREMIUM_DAYS" ? updated.premiumUntil : reward.benefitCode === "PROFILE_BOOST" ? updated.profileBoostUntil : updated.earlyAccessUntil,
      reward.durationDays
    ) : null;
    const redemption = await tx.terraqoBuilderRedemption.create({ data: { accountId: account.id, rewardId: reward.id, pointsCost: reward.pointsCost, idempotencyKey: key, benefitEndsAt } });
    const accountData: Prisma.TerraqoBuilderAccountUpdateInput = {};
    if (reward.benefitCode === "PREMIUM_DAYS") accountData.premiumUntil = benefitEndsAt;
    if (reward.benefitCode === "PROFILE_BOOST") accountData.profileBoostUntil = benefitEndsAt;
    if (reward.benefitCode === "EARLY_ACCESS") accountData.earlyAccessUntil = benefitEndsAt;
    if (reward.benefitCode === "VALIDATION_CREDIT") accountData.validationCredits = { increment: reward.quantity };
    if (Object.keys(accountData).length) await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: accountData });
    if (reward.inventory !== null) await tx.terraqoBuilderReward.update({ where: { id: reward.id }, data: { inventory: { decrement: 1 } } });
    await tx.terraqoBuilderLedger.create({ data: { accountId: account.id, redemptionId: redemption.id, type: "REDEMPTION", pointsDelta: -reward.pointsCost, balanceAfter: updated.availablePoints, description: `Canje: ${reward.title}`, idempotencyKey: `redemption:${redemption.id}` } });
    return tx.terraqoBuilderRedemption.findUniqueOrThrow({ where: { id: redemption.id }, include: { reward: true } });
  }, { isolationLevel: "Serializable" });
}

export async function consumeBuilderValidationCredit(userId: string, validationId: string) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.terraqoBuilderAccount.findUnique({ where: { userId } });
    if (!account?.validationCredits) return false;
    const consumed = await tx.terraqoBuilderAccount.updateMany({ where: { id: account.id, validationCredits: { gt: 0 } }, data: { validationCredits: { decrement: 1 } } });
    if (!consumed.count) return false;
    await tx.terraqoBuilderLedger.create({ data: { accountId: account.id, type: "ADJUSTMENT", pointsDelta: 0, balanceAfter: account.availablePoints, description: "Crédito aplicado a una solicitud de validación", idempotencyKey: `validation-credit:${validationId}` } });
    return true;
  }, { isolationLevel: "Serializable" });
}
