import type {
  TerraqoAttendanceReviewStatus,
  TerraqoCompensationPolicy,
  TerraqoWorkSchedule,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type JornadaCalculation = {
  registeredMinutes: number;
  regularMinutes: number;
  additionalDetectedMinutes: number;
  additionalApprovedMinutes: number;
  estimatedAdditionalAmount: number | null;
};

function minutesFromClock(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return 0;
  return hours * 60 + minutes;
}

export function expectedMinutesForDay(schedule: TerraqoWorkSchedule | null, date: Date) {
  if (!schedule) return null;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: schedule.timezone,
    weekday: "short",
  }).format(date);
  const day = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as const)[weekday as "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat"];

  if (!schedule.workDays.includes(day)) return 0;
  if (day === 6 && schedule.saturdayStartTime && schedule.saturdayEndTime) {
    return Math.max(0, minutesFromClock(schedule.saturdayEndTime) - minutesFromClock(schedule.saturdayStartTime) - schedule.saturdayBreakMinutes);
  }
  return Math.max(0, minutesFromClock(schedule.endTime) - minutesFromClock(schedule.startTime) - schedule.breakMinutes);
}

function breakMinutesForDay(schedule: TerraqoWorkSchedule | null, date: Date) {
  if (!schedule) return 0;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: schedule.timezone,
    weekday: "short",
  }).format(date);
  return weekday === "Sat" ? schedule.saturdayBreakMinutes : schedule.breakMinutes;
}

export function calculateJornada(input: {
  entryAt: Date;
  exitAt: Date | null;
  schedule: TerraqoWorkSchedule | null;
  compensation: TerraqoCompensationPolicy | null;
  approval?: { status: TerraqoAttendanceReviewStatus; additionalApprovedMinutes: number } | null;
}): JornadaCalculation {
  if (!input.exitAt) {
    return { registeredMinutes: 0, regularMinutes: 0, additionalDetectedMinutes: 0, additionalApprovedMinutes: 0, estimatedAdditionalAmount: null };
  }
  const elapsed = Math.max(0, Math.floor((input.exitAt.getTime() - input.entryAt.getTime()) / 60_000));
  const expected = expectedMinutesForDay(input.schedule, input.entryAt);
  const breakMinutes = input.schedule && expected !== 0 ? breakMinutesForDay(input.schedule, input.entryAt) : 0;
  const registeredMinutes = Math.max(0, elapsed - breakMinutes);
  const regularMinutes = expected === null ? registeredMinutes : Math.min(registeredMinutes, expected);
  const additionalDetectedMinutes = expected === null ? 0 : Math.max(0, registeredMinutes - expected);
  const additionalApprovedMinutes = input.approval?.status === "APPROVED" || input.approval?.status === "PARTIALLY_APPROVED"
    ? input.approval.additionalApprovedMinutes
    : 0;
  const hourly = input.compensation?.hourlyReferenceAmount ? Number(input.compensation.hourlyReferenceAmount) : null;
  const estimatedAdditionalAmount = hourly === null ? null : Number(((additionalApprovedMinutes / 60) * hourly).toFixed(2));
  return { registeredMinutes, regularMinutes, additionalDetectedMinutes, additionalApprovedMinutes, estimatedAdditionalAmount };
}

export async function getWorkRelationshipForUser(userId: string, workspaceId?: string) {
  return prisma.terraqoWorkRelationship.findFirst({
    where: {
      workspaceId,
      member: { userId, active: true },
      status: { in: ["ACTIVE", "DRAFT"] },
    },
    include: {
      workspace: { select: { id: true, name: true, brandName: true, logoUrl: true, country: true } },
      member: { select: { id: true, title: true, user: { select: { id: true, name: true, image: true } } } },
      schedules: { where: { effectiveTo: null }, orderBy: { effectiveFrom: "desc" }, take: 1 },
      compensationPolicies: { where: { effectiveTo: null }, orderBy: [{ source: "asc" }, { effectiveFrom: "desc" }] },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export function activeCompensation<T extends { source: "COMPANY" | "PERSONAL" }>(policies: T[]) {
  return policies.find((policy) => policy.source === "COMPANY") || policies.find((policy) => policy.source === "PERSONAL") || null;
}

export function formatMinutes(minutes: number) {
  const hours = Math.floor(Math.max(0, minutes) / 60);
  const remainder = Math.max(0, minutes) % 60;
  return `${hours} h ${remainder.toString().padStart(2, "0")} min`;
}

export function isCompanyWorklogWithinJourney(input: {
  worklog: { workspaceId: string | null; authorId: string; occurredAt: Date };
  journey: { workspaceId: string; userId: string; entryAt: Date; exitAt: Date | null };
}) {
  if (input.worklog.workspaceId !== input.journey.workspaceId) return false;
  if (input.worklog.authorId !== input.journey.userId) return false;
  if (input.worklog.occurredAt < input.journey.entryAt) return false;
  if (input.journey.exitAt && input.worklog.occurredAt > input.journey.exitAt) return false;
  return true;
}
