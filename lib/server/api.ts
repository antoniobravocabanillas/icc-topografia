import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { BillingError } from "@/lib/terraqo/billing/provider";

export type ApiListMeta = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function created<T>(data: T) {
  return ok(data, { status: 201 });
}

export function paginated<T>(data: T, meta: ApiListMeta) {
  return NextResponse.json({ data, meta });
}

export function fail(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ error: { message, details } }, { status });
}

export function handleApiError(error: unknown) {
  if(error instanceof BillingError)return fail(error.code==="STORAGE_QUOTA_REACHED"?"Alcanzaste la capacidad de tu plan. Revisa tu membresía para ampliar el espacio.":"No se pudo autorizar esta operación de membresía.",error.status);
  if (error instanceof ZodError) {
    return fail("Datos invalidos", 422, error.flatten());
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") return fail("Ya existe un registro con esos datos", 409, error.meta);
    if (error.code === "P2025") return fail("Registro no encontrado", 404);
  }

  console.error(error);
  return fail("Error interno del servidor", 500);
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
