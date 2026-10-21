import {
  Prisma,
  TerraqoEvidenceStatus,
  TerraqoWorklogType,
} from "@prisma/client";
import { createHash } from "node:crypto";

const DEFAULT_TIME_ZONE = "America/Lima";
const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
const WORKLOG_TYPES = new Set<string>(Object.values(TerraqoWorklogType));
const EVIDENCE_STATUSES = new Set<string>(Object.values(TerraqoEvidenceStatus));

export type WorklogArchiveInput = {
  q?: string;
  tipo?: string;
  proyecto?: string;
  estado?: string;
  fecha?: string;
  desde?: string;
  hasta?: string;
  mes?: string;
  tz?: string;
  cursor?: string;
  limite?: string;
  alcance?: string;
};

export type WorklogArchiveFilters = {
  query?: string;
  type?: TerraqoWorklogType;
  projectId?: string;
  evidenceStatus?: TerraqoEvidenceStatus;
  date?: string;
  from?: string;
  to?: string;
  month: string;
  timeZone: string;
  limit: number;
  allTime: boolean;
};

type ArchiveCursor = {
  v: 1;
  occurredAt: string;
  id: string;
  scope: string;
};

export class WorklogArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorklogArchiveError";
  }
}

function isValidDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function isValidMonth(value: string) {
  return /^(\d{4})-(0[1-9]|1[0-2])$/.test(value);
}

export function isValidTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("es-PE", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || 0);
  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return representedAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

export function localDateStartUtc(value: string, timeZone: string) {
  if (!isValidDate(value)) {
    throw new WorklogArchiveError("La fecha del archivo no es valida.");
  }
  if (!isValidTimeZone(timeZone)) {
    throw new WorklogArchiveError("La zona horaria del archivo no es valida.");
  }
  const [year, month, day] = value.split("-").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day);
  let instant = localAsUtc;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const adjusted = localAsUtc - timeZoneOffsetMs(new Date(instant), timeZone);
    if (adjusted === instant) break;
    instant = adjusted;
  }
  return new Date(instant);
}

function nextLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

function nextMonth(value: string) {
  const [year, month] = value.split("-").map(Number);
  const next = new Date(Date.UTC(year, month, 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatWorklogDay(date: Date, timeZone: string) {
  const parts = zonedParts(date, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function currentWorklogMonth(now: Date, timeZone: string) {
  return formatWorklogDay(now, timeZone).slice(0, 7);
}

export function parseWorklogArchiveFilters(
  input: WorklogArchiveInput,
  now = new Date(),
): WorklogArchiveFilters {
  const timeZone =
    input.tz && isValidTimeZone(input.tz) ? input.tz : DEFAULT_TIME_ZONE;
  const query = input.q?.trim().replace(/\s+/g, " ").slice(0, 120) || undefined;
  const type =
    input.tipo && WORKLOG_TYPES.has(input.tipo)
      ? (input.tipo as TerraqoWorklogType)
      : undefined;
  const projectId = input.proyecto?.trim().slice(0, 64) || undefined;
  const evidenceStatus =
    input.estado && EVIDENCE_STATUSES.has(input.estado)
      ? (input.estado as TerraqoEvidenceStatus)
      : undefined;
  const date = input.fecha && isValidDate(input.fecha) ? input.fecha : undefined;
  const requestedFrom =
    input.desde && isValidDate(input.desde) ? input.desde : undefined;
  const requestedTo =
    input.hasta && isValidDate(input.hasta) ? input.hasta : undefined;
  const from =
    requestedFrom && requestedTo && requestedFrom > requestedTo
      ? requestedTo
      : requestedFrom;
  const to =
    requestedFrom && requestedTo && requestedFrom > requestedTo
      ? requestedFrom
      : requestedTo;
  const month =
    input.mes && isValidMonth(input.mes)
      ? input.mes
      : date?.slice(0, 7) ||
        from?.slice(0, 7) ||
        currentWorklogMonth(now, timeZone);
  const requestedLimit = Number(input.limite || DEFAULT_PAGE_SIZE);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;
  const allTime = input.alcance === "all";
  return {
    query,
    type,
    projectId,
    evidenceStatus,
    date,
    from,
    to,
    month,
    timeZone,
    limit,
    allTime,
  };
}

function archiveScope(filters: WorklogArchiveFilters) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        q: filters.query || null,
        type: filters.type || null,
        projectId: filters.projectId || null,
        evidenceStatus: filters.evidenceStatus || null,
        date: filters.date || null,
        from: filters.from || null,
        to: filters.to || null,
        month: filters.allTime ? null : filters.month,
        timeZone: filters.allTime ? null : filters.timeZone,
        allTime: filters.allTime,
      }),
    )
    .digest("base64url")
    .slice(0, 24);
}

export function encodeWorklogArchiveCursor(
  occurredAt: Date,
  id: string,
  filters: WorklogArchiveFilters,
) {
  const cursor: ArchiveCursor = {
    v: 1,
    occurredAt: occurredAt.toISOString(),
    id,
    scope: archiveScope(filters),
  };
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

export function decodeWorklogArchiveCursor(
  value: string,
  filters: WorklogArchiveFilters,
) {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<ArchiveCursor>;
    const occurredAt = new Date(parsed.occurredAt || "");
    if (
      parsed.v !== 1 ||
      !parsed.id ||
      !/^[a-zA-Z0-9_-]{8,64}$/.test(parsed.id) ||
      Number.isNaN(occurredAt.getTime()) ||
      parsed.scope !== archiveScope(filters)
    ) {
      throw new Error("invalid cursor");
    }
    return { occurredAt, id: parsed.id };
  } catch {
    throw new WorklogArchiveError(
      "El cursor no pertenece a estos filtros o ya no es valido.",
    );
  }
}

export function worklogArchivePeriod(filters: WorklogArchiveFilters) {
  if (filters.allTime) return undefined;
  if (filters.date) {
    return {
      gte: localDateStartUtc(filters.date, filters.timeZone),
      lt: localDateStartUtc(nextLocalDate(filters.date), filters.timeZone),
    };
  }
  if (filters.from || filters.to) {
    return {
      ...(filters.from
        ? { gte: localDateStartUtc(filters.from, filters.timeZone) }
        : {}),
      ...(filters.to
        ? {
            lt: localDateStartUtc(
              nextLocalDate(filters.to),
              filters.timeZone,
            ),
          }
        : {}),
    };
  }
  return {
    gte: localDateStartUtc(`${filters.month}-01`, filters.timeZone),
    lt: localDateStartUtc(`${nextMonth(filters.month)}-01`, filters.timeZone),
  };
}

export function buildWorklogArchiveWhere(
  professionalProfileId: string,
  filters: WorklogArchiveFilters,
): Prisma.TerraqoWorklogEntryWhereInput {
  const period = worklogArchivePeriod(filters);
  return {
    professionalProfileId,
    deletedAt: null,
    ...(period ? { occurredAt: period } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.evidenceStatus
      ? { evidenceStatus: filters.evidenceStatus }
      : {}),
    ...(filters.query
      ? {
          OR: [
            { title: { contains: filters.query, mode: "insensitive" } },
            { summary: { contains: filters.query, mode: "insensitive" } },
            { outcome: { contains: filters.query, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}
