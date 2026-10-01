export type WorkforceAttendanceEvent = {
  id: string;
  userId: string;
  type: "CHECK_IN" | "CHECK_OUT";
  capturedAt: Date;
  projectId: string | null;
  context: "PROJECT" | "PERSONAL_FIELD";
};

export type WorkforceSchedule = {
  timezone: string;
  workDays: number[];
  startTime: string;
  toleranceMinutes: number;
  saturdayStartTime: string | null;
};

export type WorkforceApproval = {
  checkInEventId: string;
  regularMinutes: number;
  additionalDetectedMinutes: number;
  additionalApprovedMinutes: number;
  status: "PENDING" | "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED";
};

export type WorkforceMetric = {
  journeyCount: number;
  completedJourneyCount: number;
  openJourneyCount: number;
  scheduledJourneyCount: number;
  onTimeCount: number;
  lateCount: number;
  lateMinutes: number;
  punctualityRate: number | null;
  regularMinutes: number;
  additionalDetectedMinutes: number;
  additionalApprovedMinutes: number;
  pendingApprovalCount: number;
  recognitionScore: number | null;
};

type Journey = { entry: WorkforceAttendanceEvent; exit: WorkforceAttendanceEvent | null };

function clockToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return Number.isFinite(hours) && Number.isFinite(minutes) ? hours * 60 + minutes : 0;
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const weekday = ({ Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 } as const)[value.weekday as "Sun" | "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat"];
  return { weekday, minutes: Number(value.hour) * 60 + Number(value.minute) };
}

export function pairWorkforceJourneys(events: WorkforceAttendanceEvent[]): Journey[] {
  const openByContext = new Map<string, WorkforceAttendanceEvent>();
  const journeys: Journey[] = [];
  for (const event of [...events].sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime())) {
    const key = `${event.userId}:${event.context}:${event.projectId || "personal"}`;
    if (event.type === "CHECK_IN") {
      const previous = openByContext.get(key);
      if (previous) journeys.push({ entry: previous, exit: null });
      openByContext.set(key, event);
      continue;
    }
    const entry = openByContext.get(key);
    if (entry) {
      journeys.push({ entry, exit: event });
      openByContext.delete(key);
    }
  }
  for (const entry of openByContext.values()) journeys.push({ entry, exit: null });
  return journeys;
}

export function calculateWorkforceMetric(input: {
  events: WorkforceAttendanceEvent[];
  schedule: WorkforceSchedule | null;
  approvals: WorkforceApproval[];
  verifiedEvidenceCount: number;
  incidentCount: number;
}): WorkforceMetric {
  const journeys = pairWorkforceJourneys(input.events);
  const approvalByEntry = new Map(input.approvals.map((approval) => [approval.checkInEventId, approval]));
  let scheduledJourneyCount = 0;
  let onTimeCount = 0;
  let lateCount = 0;
  let lateMinutes = 0;

  for (const journey of journeys) {
    if (!input.schedule) continue;
    const local = zonedParts(journey.entry.capturedAt, input.schedule.timezone);
    if (!input.schedule.workDays.includes(local.weekday)) continue;
    const start = local.weekday === 6 && input.schedule.saturdayStartTime
      ? input.schedule.saturdayStartTime
      : input.schedule.startTime;
    const delay = Math.max(0, local.minutes - clockToMinutes(start) - input.schedule.toleranceMinutes);
    scheduledJourneyCount += 1;
    if (delay > 0) {
      lateCount += 1;
      lateMinutes += delay;
    } else {
      onTimeCount += 1;
    }
  }

  const approvals = journeys.map((journey) => approvalByEntry.get(journey.entry.id)).filter((approval): approval is WorkforceApproval => Boolean(approval));
  const completedJourneyCount = journeys.filter((journey) => journey.exit).length;
  const punctualityRate = scheduledJourneyCount ? Math.round((onTimeCount / scheduledJourneyCount) * 100) : null;
  // A minimum sample prevents a single attendance mark from producing a misleading ranking.
  const recognitionScore = completedJourneyCount >= 3 && punctualityRate !== null
    ? Math.round(
        punctualityRate * 0.55
        + Math.min(100, (completedJourneyCount / Math.max(3, scheduledJourneyCount)) * 100) * 0.2
        + Math.min(100, input.verifiedEvidenceCount * 20) * 0.15
        + Math.max(0, 100 - input.incidentCount * 25) * 0.1,
      )
    : null;

  return {
    journeyCount: journeys.length,
    completedJourneyCount,
    openJourneyCount: journeys.length - completedJourneyCount,
    scheduledJourneyCount,
    onTimeCount,
    lateCount,
    lateMinutes,
    punctualityRate,
    regularMinutes: approvals.reduce((total, approval) => total + approval.regularMinutes, 0),
    additionalDetectedMinutes: approvals.reduce((total, approval) => total + approval.additionalDetectedMinutes, 0),
    additionalApprovedMinutes: approvals.reduce((total, approval) => total + approval.additionalApprovedMinutes, 0),
    pendingApprovalCount: approvals.filter((approval) => approval.status === "PENDING").length,
    recognitionScore,
  };
}

export function estimateApprovedOvertimeAmount(minutes: number, hourlyReferenceAmount: number | null) {
  if (hourlyReferenceAmount === null) return null;
  const firstBand = Math.min(Math.max(0, minutes), 120);
  const secondBand = Math.max(0, minutes - firstBand);
  return Number((((firstBand / 60) * hourlyReferenceAmount * 1.25) + ((secondBand / 60) * hourlyReferenceAmount * 1.35)).toFixed(2));
}
