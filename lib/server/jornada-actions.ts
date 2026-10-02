"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { activeCompensation, calculateJornada } from "@/lib/terraqo/jornada";
import { getSessionTerraqoWorkspaceId } from "@/lib/terraqo/workspace-scope";

function text(formData: FormData, key: string) {
  return String(formData.get(key) || "").trim();
}

function integer(formData: FormData, key: string, fallback = 0) {
  const value = Number(text(formData, key));
  return Number.isInteger(value) ? value : fallback;
}

function money(formData: FormData, key: string) {
  const value = Number(text(formData, key));
  if (!Number.isFinite(value) || value <= 0) throw new Error("Monto inválido.");
  return value;
}

function validClock(value: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Horario inválido.");
  return value;
}

function clockMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function limaLocalDateTime(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return new Date(Number.NaN);
  return new Date(`${value}:00-05:00`);
}

async function requireCompanyManager() {
  const session = await auth();
  if (!session?.user?.id || !["ADMIN", "SUPER_ADMIN"].includes(session.user.role || "")) throw new Error("Acceso administrativo requerido.");
  const workspaceId = await getSessionTerraqoWorkspaceId();
  return { userId: session.user.id, workspaceId };
}

export async function configureWorkRelationshipAction(formData: FormData) {
  const { userId, workspaceId } = await requireCompanyManager();
  const memberId = text(formData, "memberId");
  const member = await prisma.terraqoWorkspaceMember.findFirst({ where: { id: memberId, workspaceId, active: true }, select: { id: true } });
  if (!member) throw new Error("El colaborador no pertenece al workspace activo.");

  const startTime = validClock(text(formData, "startTime"));
  const endTime = validClock(text(formData, "endTime"));
  if (clockMinutes(endTime) <= clockMinutes(startTime)) throw new Error("La hora de salida debe ser posterior a la entrada.");
  const workDays = formData.getAll("workDays").map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  if (!workDays.length) throw new Error("Selecciona al menos un día laborable.");
  const saturdayStartRaw = text(formData, "saturdayStartTime");
  const saturdayEndRaw = text(formData, "saturdayEndTime");
  if ((saturdayStartRaw && !saturdayEndRaw) || (!saturdayStartRaw && saturdayEndRaw)) throw new Error("Completa ambas horas del sábado.");
  const saturdayStartTime = saturdayStartRaw ? validClock(saturdayStartRaw) : null;
  const saturdayEndTime = saturdayEndRaw ? validClock(saturdayEndRaw) : null;
  if (saturdayStartTime && saturdayEndTime && clockMinutes(saturdayEndTime) <= clockMinutes(saturdayStartTime)) throw new Error("La salida del sábado debe ser posterior a la entrada.");
  const baseAmount = money(formData, "baseAmount");
  const hourlyReferenceAmount = money(formData, "hourlyReferenceAmount");
  const currentProjectId = text(formData, "currentProjectId") || null;
  if (currentProjectId) {
    const project = await prisma.project.findFirst({ where: { id: currentProjectId, terraqoWorkspaceId: workspaceId, deletedAt: null }, select: { id: true } });
    if (!project) throw new Error("La obra o proyecto seleccionado no pertenece al workspace activo.");
  }
  const additionalHoursPolicy = text(formData, "additionalHoursPolicy") === "REQUIRES_APPROVAL" ? "REQUIRES_APPROVAL" : "AUTOMATIC";
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const relationship = await tx.terraqoWorkRelationship.upsert({
      where: { memberId },
      update: {
        status: "ACTIVE",
        area: text(formData, "area") || null,
        contractType: text(formData, "contractType") || null,
        modality: text(formData, "modality") || null,
        workSite: text(formData, "workSite") || null,
        currentProjectId,
        startDate: text(formData, "startDate") ? new Date(`${text(formData, "startDate")}T12:00:00Z`) : null,
        configuredByUserId: userId,
        confirmedAt: now,
      },
      create: {
        workspaceId,
        memberId,
        status: "ACTIVE",
        area: text(formData, "area") || null,
        contractType: text(formData, "contractType") || null,
        modality: text(formData, "modality") || null,
        workSite: text(formData, "workSite") || null,
        currentProjectId,
        startDate: text(formData, "startDate") ? new Date(`${text(formData, "startDate")}T12:00:00Z`) : null,
        configuredByUserId: userId,
        confirmedAt: now,
      },
    });

    await tx.terraqoWorkSchedule.updateMany({ where: { workRelationshipId: relationship.id, effectiveTo: null }, data: { effectiveTo: now } });
    await tx.terraqoWorkSchedule.create({
      data: {
        workRelationshipId: relationship.id,
        startTime,
        endTime,
        breakMinutes: Math.max(0, integer(formData, "breakMinutes", 60)),
        toleranceMinutes: Math.max(0, integer(formData, "toleranceMinutes", 10)),
        workDays,
        saturdayStartTime,
        saturdayEndTime,
        saturdayBreakMinutes: Math.max(0, integer(formData, "saturdayBreakMinutes")),
        effectiveFrom: now,
      },
    });

    await tx.terraqoCompensationPolicy.updateMany({ where: { workRelationshipId: relationship.id, source: "COMPANY", effectiveTo: null }, data: { effectiveTo: now } });
    await tx.terraqoCompensationPolicy.create({
      data: {
        workRelationshipId: relationship.id,
        source: "COMPANY",
        baseAmount,
        currency: "PEN",
        frequency: text(formData, "frequency") === "HOURLY" ? "HOURLY" : text(formData, "frequency") === "DAILY" ? "DAILY" : "MONTHLY",
        paymentDay: Math.min(31, Math.max(1, integer(formData, "paymentDay", 28))),
        additionalHoursPolicy,
        hourlyReferenceAmount,
        effectiveFrom: now,
        confirmedAt: now,
        createdByUserId: userId,
      },
    });
  }, { isolationLevel: "Serializable" });

  revalidatePath("/admin/jornadas");
  revalidatePath("/portal/relacion-laboral");
  revalidatePath("/portal/jornadas");
  return;
}

export type WorkRelationshipFormState = {
  status: "idle" | "success" | "error";
  message: string;
  submissionId: number;
};

export async function configureWorkRelationshipFormAction(
  _previousState: WorkRelationshipFormState,
  formData: FormData,
): Promise<WorkRelationshipFormState> {
  try {
    await configureWorkRelationshipAction(formData);
    const automatic = text(formData, "additionalHoursPolicy") === "AUTOMATIC";

    return {
      status: "success",
      message: automatic
        ? "Configuración guardada. Las horas extra preautorizadas se clasificarán y aprobarán automáticamente."
        : "Configuración guardada. Las horas extra quedarán pendientes de autorización.",
      submissionId: Date.now(),
    };
  } catch (error) {
    const safeMessages = new Set([
      "Acceso administrativo requerido.",
      "El colaborador no pertenece al workspace activo.",
      "La hora de salida debe ser posterior a la entrada.",
      "Selecciona al menos un día laborable.",
      "Completa ambas horas del sábado.",
      "La salida del sábado debe ser posterior a la entrada.",
      "La obra o proyecto seleccionado no pertenece al workspace activo.",
      "Monto inválido.",
      "Horario inválido.",
    ]);
    const message = error instanceof Error && safeMessages.has(error.message)
      ? error.message
      : "No se pudo guardar la configuración. Revisa los datos e inténtalo nuevamente.";

    return {
      status: "error",
      message,
      submissionId: Date.now(),
    };
  }
}

export async function savePersonalCompensationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Sesión requerida.");
  const relationshipId = text(formData, "relationshipId");
  const member = await prisma.terraqoWorkspaceMember.findFirst({ where: { id: text(formData, "memberId"), userId: session.user.id, active: true }, select: { id: true, workspaceId: true } });
  if (!member) throw new Error("Membresía profesional no disponible.");
  const relationship = relationshipId
    ? await prisma.terraqoWorkRelationship.findFirst({ where: { id: relationshipId, memberId: member.id }, select: { id: true } })
    : await prisma.terraqoWorkRelationship.upsert({ where: { memberId: member.id }, update: {}, create: { memberId: member.id, workspaceId: member.workspaceId, status: "DRAFT" }, select: { id: true } });
  if (!relationship) throw new Error("Relación laboral no disponible.");
  const now = new Date();
  await prisma.$transaction([
    prisma.terraqoCompensationPolicy.updateMany({ where: { workRelationshipId: relationship.id, source: "PERSONAL", effectiveTo: null }, data: { effectiveTo: now } }),
    prisma.terraqoCompensationPolicy.create({ data: { workRelationshipId: relationship.id, source: "PERSONAL", baseAmount: money(formData, "baseAmount"), currency: "PEN", frequency: "MONTHLY", hourlyReferenceAmount: money(formData, "hourlyReferenceAmount"), additionalHoursPolicy: "REQUIRES_APPROVAL", effectiveFrom: now, createdByUserId: session.user.id } }),
  ]);
  revalidatePath("/portal/relacion-laboral");
  revalidatePath("/portal/jornadas");
  redirect("/portal/relacion-laboral?success=personal-reference");
}

export async function requestAttendanceAdjustmentAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Sesión requerida.");
  const relationshipId = text(formData, "relationshipId");
  const relationship = await prisma.terraqoWorkRelationship.findFirst({ where: { id: relationshipId, member: { userId: session.user.id, active: true } }, select: { id: true } });
  if (!relationship) throw new Error("Relación laboral no disponible.");
  const attendanceEventId = text(formData, "attendanceEventId");
  const attendanceEvent = attendanceEventId
    ? await prisma.terraqoAttendanceEvent.findFirst({ where: { id: attendanceEventId, userId: session.user.id, workRelationshipId: relationship.id }, select: { id: true, type: true, capturedAt: true } })
    : null;
  if (attendanceEventId && !attendanceEvent) throw new Error("El registro de jornada no pertenece a tu relación laboral.");
  const reason = text(formData, "reason");
  if (reason.length < 10 || reason.length > 1000) throw new Error("Describe la incidencia con al menos 10 caracteres.");
  const requestedCheckOutRaw = text(formData, "requestedCheckOutAt");
  const requestedCheckOutAt = requestedCheckOutRaw ? limaLocalDateTime(requestedCheckOutRaw) : null;
  if (requestedCheckOutAt && (Number.isNaN(requestedCheckOutAt.getTime()) || !attendanceEvent || requestedCheckOutAt <= attendanceEvent.capturedAt || requestedCheckOutAt.getTime() > Date.now() + 5 * 60_000)) {
    throw new Error("La salida propuesta debe ser posterior a la entrada y no puede estar en el futuro.");
  }
  await prisma.terraqoAttendanceAdjustment.create({
    data: {
      workRelationshipId: relationship.id,
      attendanceEventId: attendanceEvent?.id || null,
      type: text(formData, "type") === "MISSING_CHECK_IN" ? "MISSING_CHECK_IN" : text(formData, "type") === "WRONG_TIME" ? "WRONG_TIME" : text(formData, "type") === "WRONG_PROJECT" ? "WRONG_PROJECT" : text(formData, "type") === "OTHER" ? "OTHER" : "MISSING_CHECK_OUT",
      requestedCheckOutAt,
      reason,
      requestedByUserId: session.user.id,
    },
  });
  revalidatePath("/portal/jornadas");
  redirect(`/portal/jornadas/${text(formData, "attendanceEventId")}?success=incident`);
}

export async function reviewAttendanceAction(formData: FormData) {
  const { userId, workspaceId } = await requireCompanyManager();
  const approvalId = text(formData, "approvalId");
  const approval = await prisma.terraqoAttendanceApproval.findFirst({ where: { id: approvalId, workRelationship: { workspaceId } }, select: { id: true, additionalDetectedMinutes: true } });
  if (!approval) throw new Error("Jornada no disponible.");
  const approved = Math.min(approval.additionalDetectedMinutes, Math.max(0, integer(formData, "additionalApprovedMinutes")));
  await prisma.terraqoAttendanceApproval.update({ where: { id: approval.id }, data: { status: approved === approval.additionalDetectedMinutes ? "APPROVED" : approved > 0 ? "PARTIALLY_APPROVED" : "REJECTED", additionalApprovedMinutes: approved, decisionSource: "MANAGER", requiresReview: false, reviewedByUserId: userId, reviewNote: text(formData, "reviewNote") || null, reviewedAt: new Date() } });
  revalidatePath("/admin/jornadas");
  revalidatePath("/portal/jornadas");
  // Keep the user on the current admin surface. A server-action redirect through
  // the custom admin host could resolve against the wrong deployment route.
  return;
}

export async function reviewAttendanceAdjustmentAction(formData: FormData) {
  const { userId, workspaceId } = await requireCompanyManager();
  const adjustmentId = text(formData, "adjustmentId");
  const adjustment = await prisma.terraqoAttendanceAdjustment.findFirst({
    where: { id: adjustmentId, workRelationship: { workspaceId }, status: "REQUESTED" },
    include: {
      attendanceEvent: true,
      workRelationship: {
        include: {
          schedules: { where: { effectiveTo: null }, orderBy: { effectiveFrom: "desc" }, take: 1 },
          compensationPolicies: { where: { effectiveTo: null }, orderBy: [{ source: "asc" }, { effectiveFrom: "desc" }] },
        },
      },
    },
  });
  if (!adjustment) throw new Error("Incidencia no disponible.");
  const approved = text(formData, "decision") === "APPROVED";
  await prisma.$transaction(async (tx) => {
    await tx.terraqoAttendanceAdjustment.update({ where: { id: adjustment.id }, data: { status: approved ? "APPROVED" : "REJECTED", reviewedByUserId: userId, reviewNote: text(formData, "reviewNote") || null, reviewedAt: new Date() } });
    if (approved && adjustment.attendanceEvent?.type === "CHECK_IN" && adjustment.requestedCheckOutAt) {
      const compensation = activeCompensation(adjustment.workRelationship.compensationPolicies);
      const calculation = calculateJornada({
        entryAt: adjustment.attendanceEvent.capturedAt,
        exitAt: adjustment.requestedCheckOutAt,
        schedule: adjustment.workRelationship.schedules[0] || null,
        compensation,
      });
      const hasAdditional = calculation.additionalDetectedMinutes > 0;
      const automaticAdditional = compensation?.additionalHoursPolicy === "AUTOMATIC";
      const automaticallyApproved = !hasAdditional || automaticAdditional;
      await tx.terraqoAttendanceApproval.upsert({
        where: { checkInEventId: adjustment.attendanceEvent.id },
        update: {
          regularMinutes: calculation.regularMinutes,
          additionalDetectedMinutes: calculation.additionalDetectedMinutes,
          status: automaticallyApproved ? "APPROVED" : "PENDING",
          additionalApprovedMinutes: automaticallyApproved ? calculation.additionalDetectedMinutes : 0,
          decisionSource: "SYSTEM",
          requiresReview: hasAdditional && automaticAdditional,
          reviewedByUserId: null,
          reviewNote: "Recalculada desde una incidencia aprobada.",
          reviewedAt: null,
        },
        create: {
          workRelationshipId: adjustment.workRelationshipId,
          checkInEventId: adjustment.attendanceEvent.id,
          regularMinutes: calculation.regularMinutes,
          additionalDetectedMinutes: calculation.additionalDetectedMinutes,
          status: automaticallyApproved ? "APPROVED" : "PENDING",
          additionalApprovedMinutes: automaticallyApproved ? calculation.additionalDetectedMinutes : 0,
          decisionSource: "SYSTEM",
          requiresReview: hasAdditional && automaticAdditional,
          reviewNote: "Calculada desde una incidencia aprobada.",
        },
      });
    }
  }, { isolationLevel: "Serializable" });
  revalidatePath("/admin/jornadas");
  revalidatePath("/portal/jornadas");
  return;
}

function periodRange(periodKey: string) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(periodKey);
  if (!match) throw new Error("Periodo inválido.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  return {
    from: new Date(Date.UTC(year, month - 1, 1, 5)),
    to: new Date(Date.UTC(year, month, 1, 5)),
  };
}

export async function submitAttendancePeriodAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Sesión requerida.");
  const relationshipId = text(formData, "relationshipId");
  const periodKey = text(formData, "periodKey");
  const relationship = await prisma.terraqoWorkRelationship.findFirst({
    where: { id: relationshipId, member: { userId: session.user.id, active: true } },
    include: { compensationPolicies: { where: { effectiveTo: null }, orderBy: [{ source: "asc" }, { effectiveFrom: "desc" }] } },
  });
  if (!relationship) throw new Error("Relación laboral no disponible.");
  const { from, to } = periodRange(periodKey);
  const entries = await prisma.terraqoAttendanceEvent.findMany({
    where: { workRelationshipId: relationship.id, userId: session.user.id, type: "CHECK_IN", status: "ACCEPTED", capturedAt: { gte: from, lt: to } },
    select: { id: true },
  });
  const approvals = entries.length ? await prisma.terraqoAttendanceApproval.findMany({ where: { checkInEventId: { in: entries.map((entry) => entry.id) } } }) : [];
  const regularMinutes = approvals.reduce((sum, item) => sum + item.regularMinutes, 0);
  const additionalDetectedMinutes = approvals.reduce((sum, item) => sum + item.additionalDetectedMinutes, 0);
  const additionalApprovedMinutes = approvals.reduce((sum, item) => sum + item.additionalApprovedMinutes, 0);
  const compensation = activeCompensation(relationship.compensationPolicies);
  const hourly = compensation?.hourlyReferenceAmount ? Number(compensation.hourlyReferenceAmount) : null;
  const estimatedAdditionalAmount = hourly === null ? null : Number(((additionalApprovedMinutes / 60) * hourly).toFixed(2));
  await prisma.terraqoAttendancePeriod.upsert({
    where: { workRelationshipId_periodKey: { workRelationshipId: relationship.id, periodKey } },
    update: { status: "SUBMITTED", journeyCount: entries.length, regularMinutes, additionalDetectedMinutes, additionalApprovedMinutes, estimatedAdditionalAmount, submittedByUserId: session.user.id, submittedAt: new Date(), reviewedByUserId: null, reviewedAt: null, reviewNote: null },
    create: { workRelationshipId: relationship.id, periodKey, status: "SUBMITTED", journeyCount: entries.length, regularMinutes, additionalDetectedMinutes, additionalApprovedMinutes, estimatedAdditionalAmount, submittedByUserId: session.user.id, submittedAt: new Date() },
  });
  revalidatePath("/portal/jornadas");
  revalidatePath("/admin/jornadas");
  redirect("/portal/jornadas?success=period-submitted");
}

export async function reviewAttendancePeriodAction(formData: FormData) {
  const { userId, workspaceId } = await requireCompanyManager();
  const period = await prisma.terraqoAttendancePeriod.findFirst({ where: { id: text(formData, "periodId"), status: "SUBMITTED", workRelationship: { workspaceId } }, select: { id: true } });
  if (!period) throw new Error("Cierre de período no disponible.");
  await prisma.terraqoAttendancePeriod.update({ where: { id: period.id }, data: { status: "APPROVED", reviewedByUserId: userId, reviewedAt: new Date(), reviewNote: text(formData, "reviewNote") || null } });
  revalidatePath("/admin/jornadas");
  revalidatePath("/portal/jornadas");
  return;
}
