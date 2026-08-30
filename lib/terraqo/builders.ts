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

export function terraqoTrustLevel(score: number) {
  if (score >= 300) return { name: "Referente técnico", level: 5, next: null as number | null };
  if (score >= 150) return { name: "Confiable", level: 4, next: 300 };
  if (score >= 60) return { name: "Verificado", level: 3, next: 150 };
  if (score >= 15) return { name: "Activo", level: 2, next: 60 };
  return { name: "Inicial", level: 1, next: 15 };
}

export async function releasePendingBuilderPoints(userId: string) {
  const ready = await prisma.terraqoBuilderContribution.findMany({
    where: { userId, releasedAt: null, availableAt: { lte: new Date() }, approvedPoints: { gt: 0 }, status: { not: "REJECTED" } },
    select: { id: true, approvedPoints: true, title: true, ledgerEntries: { where: { type: "CREDIT" }, select: { pointsDelta: true } } }
  });
  for (const item of ready) {
    const previouslyReleased = item.ledgerEntries.reduce((sum, entry) => sum + Math.max(0, entry.pointsDelta), 0);
    const releaseAmount = Math.max(0, item.approvedPoints - previouslyReleased);
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.terraqoBuilderContribution.updateMany({ where: { id: item.id, releasedAt: null }, data: { releasedAt: new Date() } });
      if (!claimed.count) return;
      if (!releaseAmount) return;
      const account = await tx.terraqoBuilderAccount.update({ where: { userId }, data: { pendingPoints: { decrement: releaseAmount }, availablePoints: { increment: releaseAmount }, lifetimeEarned: { increment: releaseAmount }, contributionScore: { increment: releaseAmount } } });
      await tx.terraqoBuilderLedger.create({ data: { accountId: account.id, contributionId: item.id, type: "CREDIT", pointsDelta: releaseAmount, scoreDelta: releaseAmount, balanceAfter: account.availablePoints, description: `Puntos liberados: ${item.title}`, idempotencyKey: `release:${item.id}:${item.approvedPoints}` } });
    }, { isolationLevel: "Serializable" });
  }
}

export async function ensureBuilders(userId: string) {
  await prisma.$transaction(
    BUILDER_REWARDS.map((reward) => prisma.terraqoBuilderReward.upsert({
      where: { slug: reward.slug },
      update: { ...reward, active: true },
      create: reward
    }))
  );
  await prisma.terraqoBuilderAccount.upsert({ where: { userId }, update: {}, create: { userId } });
  await releasePendingBuilderPoints(userId);
  return prisma.terraqoBuilderAccount.findUniqueOrThrow({ where: { userId } });
}

export async function syncWorklogReputation(worklogId: string) {
  const worklog = await prisma.terraqoWorklogEntry.findUnique({
    where: { id: worklogId },
    include: { media: { select: { id: true } }, validations: { where: { status: "APPROVED" }, select: { id: true } } }
  });
  if (!worklog || worklog.deletedAt) return null;
  const hasEvidence = worklog.media.length > 0 || worklog.evidenceUrls.length > 0;
  const confirmed = worklog.evidenceStatus === "CONFIRMED" || worklog.evidenceStatus === "VERIFIED" || worklog.validations.length > 0;
  const strong = confirmed && hasEvidence && Boolean(worklog.projectId && worklog.outcome && worklog.summary.length >= 80);
  const duplicateCount = worklog.contentFingerprint ? await prisma.terraqoWorklogEntry.count({ where: { authorId: worklog.authorId, contentFingerprint: worklog.contentFingerprint, id: { not: worklog.id }, createdAt: { lt: worklog.createdAt }, deletedAt: null } }) : 0;
  const dayStart = new Date(worklog.createdAt); dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart); dayEnd.setDate(dayEnd.getDate() + 1);
  const rewardedToday = await prisma.terraqoWorklogEntry.count({ where: { authorId: worklog.authorId, createdAt: { gte: dayStart, lt: dayEnd }, tqPointsAwarded: { gt: 0 }, id: { not: worklog.id } } });
  const weekStart = new Date(worklog.createdAt); weekStart.setDate(weekStart.getDate() - 7);
  const trustedThisWeek = await prisma.terraqoWorklogEntry.count({ where: { authorId: worklog.authorId, createdAt: { gte: weekStart, lte: worklog.createdAt }, trustScoreAwarded: { gt: 0 }, id: { not: worklog.id } } });
  let targetTq = strong ? 10 : confirmed ? (hasEvidence ? 7 : 4) : hasEvidence ? 2 : 1;
  let targetTrust = strong ? 15 : confirmed ? (hasEvidence ? 10 : 6) : hasEvidence ? 2 : 1;
  let moderationStatus = strong ? "STRONG_VERIFIED" : confirmed ? (worklog.visibility === "PRIVATE" ? "PRIVATE_VALIDATED" : "VALIDATED") : hasEvidence ? "COMPLETE" : "DECLARED";
  let moderationNote: string | null = null;
  let riskScore = 0;
  if (duplicateCount) { targetTq = 0; targetTrust = 0; moderationStatus = "DUPLICATE"; moderationNote = "Posible contenido duplicado. Requiere revisión."; riskScore = 90; }
  else if (!confirmed && rewardedToday >= 3) { targetTq = 0; moderationNote = "Límite diario alcanzado. La bitácora conserva evidencia, pero no genera TQ."; riskScore = 20; }
  if (trustedThisWeek >= 10) { targetTrust = 0; moderationNote = moderationNote || "Límite semanal de impacto en ranking alcanzado."; riskScore = Math.max(riskScore, 15); }
  const qualityScore = Math.min(100, (worklog.title.length >= 8 ? 15 : 5) + (worklog.summary.length >= 80 ? 25 : 10) + (worklog.outcome ? 15 : 0) + (worklog.projectId ? 15 : 0) + (hasEvidence ? 20 : 0) + (confirmed ? 10 : 0));
  const tqDelta = targetTq - worklog.tqPointsAwarded;
  const trustDelta = targetTrust - worklog.trustScoreAwarded;
  const availableAt = new Date(Date.now() + 7 * 86_400_000);
  return prisma.$transaction(async (tx) => {
    const account = await tx.terraqoBuilderAccount.upsert({ where: { userId: worklog.authorId }, update: tqDelta || trustDelta ? { pendingPoints: { increment: tqDelta }, trustScore: { increment: trustDelta } } : {}, create: { userId: worklog.authorId, pendingPoints: tqDelta, trustScore: trustDelta } });
    await tx.terraqoBuilderContribution.upsert({
      where: { sourceKey: `worklog:${worklog.id}` },
      update: { requestedPoints: targetTq, approvedPoints: targetTq, availableAt, ...(tqDelta > 0 ? { releasedAt: null } : {}), riskScore, status: confirmed ? "VALIDATED" : "IN_REVIEW", title: `Trabajo documentado: ${worklog.title}` },
      create: { userId: worklog.authorId, workspaceId: worklog.workspaceId, type: "BETA_PARTICIPATION", sourceKey: `worklog:${worklog.id}`, title: `Trabajo documentado: ${worklog.title}`, detail: "Puntaje incremental por evidencia técnica documentada.", requestedPoints: targetTq, approvedPoints: targetTq, availableAt, riskScore, status: confirmed ? "VALIDATED" : "IN_REVIEW" }
    });
    await tx.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { qualityScore, tqPointsAwarded: targetTq, trustScoreAwarded: targetTrust, moderationStatus, moderationNote } });
    return { account, targetTq, targetTrust, qualityScore, moderationStatus };
  }, { isolationLevel: "Serializable" });
}

export async function moderateWorklogReputation(input: { worklogId: string; status: "OBSERVED" | "REJECTED" | "DECLARED"; note?: string }) {
  if (input.status === "DECLARED") {
    await prisma.terraqoWorklogEntry.update({ where: { id: input.worklogId }, data: { moderationStatus: "DECLARED", moderationNote: input.note?.trim().slice(0, 1000) || null } });
    return syncWorklogReputation(input.worklogId);
  }
  return prisma.$transaction(async (tx) => {
    const worklog = await tx.terraqoWorklogEntry.findUniqueOrThrow({ where: { id: input.worklogId } });
    const contribution = await tx.terraqoBuilderContribution.findUnique({ where: { sourceKey: `worklog:${worklog.id}` }, include: { ledgerEntries: { where: { type: "CREDIT" }, select: { pointsDelta: true } } } });
    const released = contribution?.ledgerEntries.reduce((sum, entry) => sum + Math.max(0, entry.pointsDelta), 0) || 0;
    const pendingRemoval = contribution && !contribution.releasedAt ? Math.max(0, contribution.approvedPoints - released) : 0;
    const account = await tx.terraqoBuilderAccount.findUnique({ where: { userId: worklog.authorId } });
    const reversal = input.status === "REJECTED" && account ? Math.min(account.availablePoints, released) : 0;
    if (account) {
      const updated = await tx.terraqoBuilderAccount.update({ where: { id: account.id }, data: { pendingPoints: { decrement: pendingRemoval }, availablePoints: { decrement: reversal }, contributionScore: { decrement: Math.min(account.contributionScore, released) }, trustScore: { decrement: Math.min(account.trustScore, worklog.trustScoreAwarded) }, rewardsFrozenUntil: input.status === "REJECTED" ? new Date(Date.now() + 30 * 86_400_000) : new Date(Date.now() + 7 * 86_400_000) } });
      if (reversal > 0 && contribution) await tx.terraqoBuilderLedger.create({ data: { accountId: account.id, contributionId: contribution.id, type: "REVERSAL", pointsDelta: -reversal, scoreDelta: -Math.min(account.contributionScore, released), balanceAfter: updated.availablePoints, description: "Reversión por bitácora rechazada", idempotencyKey: `worklog-reversal:${worklog.id}` } });
    }
    if (contribution) await tx.terraqoBuilderContribution.update({ where: { id: contribution.id }, data: { status: input.status === "REJECTED" ? "REJECTED" : "IN_REVIEW", approvedPoints: 0, availableAt: null, reviewNote: input.note?.trim().slice(0, 1000) || null } });
    return tx.terraqoWorklogEntry.update({ where: { id: worklog.id }, data: { moderationStatus: input.status, moderationNote: input.note?.trim().slice(0, 1000) || null, tqPointsAwarded: 0, trustScoreAwarded: 0 } });
  }, { isolationLevel: "Serializable" });
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
  await releasePendingBuilderPoints(input.userId);
  const key = input.idempotencyKey || randomUUID();
  return prisma.$transaction(async (tx) => {
    const duplicate = await tx.terraqoBuilderRedemption.findUnique({ where: { idempotencyKey: key }, include: { reward: true } });
    if (duplicate) return duplicate;
    const account = await tx.terraqoBuilderAccount.upsert({ where: { userId: input.userId }, update: {}, create: { userId: input.userId } });
    if (account.rewardsFrozenUntil && account.rewardsFrozenUntil > new Date()) throw new Error("Tus canjes están temporalmente en revisión por seguridad.");
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
