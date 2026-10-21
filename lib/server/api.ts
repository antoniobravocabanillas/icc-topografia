import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BillingError } from "@/lib/terraqo/billing/provider";
import { NativeWorklogLegacyGuardError } from "./native-worklog-legacy-guard";
import { TerraqoEntitlementError } from "@/lib/terraqo/product-entitlements";

export type ApiListMeta = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

export function ok<T>(data: T, init?: ResponseInit) {
  const requestId = randomUUID();
  const headers = new Headers(init?.headers);
  headers.set("x-request-id", requestId);
  return NextResponse.json({ data }, { ...init, headers });
}

export function created<T>(data: T) {
  return ok(data, { status: 201 });
}

export function paginated<T>(data: T, meta: ApiListMeta) {
  const requestId = randomUUID();
  return NextResponse.json({ data, meta }, { headers: { "x-request-id": requestId } });
}

function defaultErrorCode(status: number) {
  if (status === 400) return "BAD_REQUEST";
  if (status === 401) return "AUTH_REQUIRED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 422) return "VALIDATION_ERROR";
  if (status === 429) return "RATE_LIMITED";
  if (status === 503) return "DEPENDENCY_UNAVAILABLE";
  return status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED";
}

export function fail(message: string, status = 400, details?: unknown, correlationId?: string) {
  const requestId = correlationId || randomUUID();
  const detailRecord = details && typeof details === "object" && !Array.isArray(details) ? details as Record<string, unknown> : null;
  const code = typeof detailRecord?.code === "string" ? detailRecord.code : defaultErrorCode(status);
  const retryable = typeof detailRecord?.retryable === "boolean" ? detailRecord.retryable : status === 429 || status >= 500;
  const fieldErrors = detailRecord && "fieldErrors" in detailRecord ? detailRecord.fieldErrors : undefined;
  const headers = new Headers({ "x-request-id": requestId });
  if (status === 429) {
    const retryAfterSeconds = typeof detailRecord?.retryAfterSeconds === "number" ? detailRecord.retryAfterSeconds : 60;
    headers.set("Retry-After", String(Math.max(1, Math.ceil(retryAfterSeconds))));
  }
  return NextResponse.json({
    error: { code, message, fieldErrors, retryable, requestId, details },
  }, { status, headers });
}

export function handleApiError(error: unknown) {
  if (error instanceof NativeWorklogLegacyGuardError) return fail(error.message, error.status);
  if (error instanceof TerraqoEntitlementError) return fail(error.message, error.status, { code: error.code, retryable: false, retryAfterSeconds: error.retryAfterSeconds });
  if(error instanceof BillingError)return fail(error.code==="STORAGE_QUOTA_REACHED"?"Alcanzaste la capacidad de tu plan. Revisa tu membresía para ampliar el espacio.":"No se pudo autorizar esta operación de membresía.",error.status);
  if (error instanceof ZodError) {
    return fail("Datos invalidos", 422, error.flatten());
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return fail("Ya existe un registro con esos datos", 409, error.meta);
    if (error.code === "P2025") return fail("Registro no encontrado", 404);
  }

  const requestId = randomUUID();
  console.error("Terraqo API error", {
    requestId,
    errorType: error instanceof Error ? error.name : typeof error,
  });
  return fail("Error interno del servidor", 500, undefined, requestId);
}

export function getPagination(searchParams: URLSearchParams) {
  const page = Math.max(Number(searchParams.get("page") || 1), 1);
  const pageSize = Math.min(Math.max(Number(searchParams.get("pageSize") || 12), 1), 100);
  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize
  };
}

export async function parseJson<T>(request: Request, parser: { parse: (value: unknown) => T }) {
  const body = await request.json();
  return parser.parse(body);
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
