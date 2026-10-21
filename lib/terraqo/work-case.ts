import { Prisma } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  terraqoWorkCaseCreateSchema,
  terraqoWorkCaseRecordSchema,
} from "@/lib/validations/terraqo";

export class WorkCaseError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = "WorkCaseError";
  }
}

const workCaseInclude = {
  workspace: { select: { id: true, name: true, brandName: true } },
  project: { select: { id: true, title: true, slug: true } },
  records: {
    orderBy: { worklog: { occurredAt: "asc" } },
    include: {
      worklog: {
        select: {
          id: true,
          title: true,
          summary: true,
          occurredAt: true,
          workspaceId: true,
          projectId: true,
          visibility: true,
        },
      },
    },
  },
} satisfies Prisma.TerraqoWorkCaseInclude;

async function profileFor(userId: string) {
  const profile = await prisma.terraqoProfessionalProfile.findUnique({
    where: { userId },
    select: { id: true },
  });
  if (!profile) throw new WorkCaseError("Completa tu perfil profesional.", 409);
  return profile;
}

export async function listWorkCases(userId: string) {
  const profile = await profileFor(userId);
  return prisma.terraqoWorkCase.findMany({
    where: { professionalProfileId: profile.id, lifecycle: { not: "ARCHIVED" } },
    include: workCaseInclude,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  });
}

export async function createWorkCase(input: {
  userId: string;
  payload: z.infer<typeof terraqoWorkCaseCreateSchema>;
}) {
  const profile = await profileFor(input.userId);
  const ids = [...new Set(input.payload.records.map((record) => record.worklogId))];
  if (ids.length !== input.payload.records.length)
    throw new WorkCaseError("Cada bitácora puede seleccionarse una sola vez.", 422);
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile" WHERE id=${profile.id} FOR UPDATE`);
    const records = await tx.terraqoWorklogEntry.findMany({
      where: {
        id: { in: ids },
        professionalProfileId: profile.id,
        authorId: input.userId,
        deletedAt: null,
      },
      select: { id: true, workspaceId: true, projectId: true },
    });
    if (records.length !== ids.length)
      throw new WorkCaseError("Alguna bitácora no existe o ya no está disponible.", 404);
    if (records.some((record) => record.workspaceId !== (input.payload.workspaceId || null)))
      throw new WorkCaseError("Las bitácoras y el trabajo deben pertenecer al mismo contexto.", 422);
    if (input.payload.projectId && records.some((record) => record.projectId !== input.payload.projectId))
      throw new WorkCaseError("Las bitácoras seleccionadas no pertenecen al proyecto indicado.", 422);
    const occupied = await tx.terraqoWorkCaseRecord.findFirst({
      where: { worklogId: { in: ids } },
      select: { worklogId: true },
    });
    if (occupied)
      throw new WorkCaseError("Una bitácora seleccionada ya pertenece a otro trabajo.", 409);
    return tx.terraqoWorkCase.create({
      data: {
        professionalProfileId: profile.id,
        workspaceId: input.payload.workspaceId,
        projectId: input.payload.projectId,
        title: input.payload.title,
        description: input.payload.description,
        lifecycle: "ACTIVE",
        createdById: input.userId,
        records: {
          create: input.payload.records.map((record) => ({
            worklogId: record.worklogId,
            phase: record.phase,
            relationshipStatus: "CONFIRMED",
            confirmedById: input.userId,
            confirmedAt: new Date(),
          })),
        },
      },
      include: workCaseInclude,
    });
  }, { isolationLevel: "Serializable" });
}

export async function addWorkCaseRecord(input: {
  userId: string;
  workCaseId: string;
  payload: z.infer<typeof terraqoWorkCaseRecordSchema>;
}) {
  const profile = await profileFor(input.userId);
  return prisma.$transaction(async (tx) => {
    const workCase = await tx.terraqoWorkCase.findFirst({
      where: { id: input.workCaseId, professionalProfileId: profile.id, lifecycle: { not: "ARCHIVED" } },
      select: { id: true, version: true, workspaceId: true, projectId: true },
    });
    if (!workCase) throw new WorkCaseError("Trabajo no disponible.", 404);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoWorkCase" WHERE id=${workCase.id} FOR UPDATE`);
    const locked = await tx.terraqoWorkCase.findUnique({ where: { id: workCase.id }, select: { version: true } });
    if (!locked || locked.version !== input.payload.expectedVersion)
      throw new WorkCaseError("El trabajo cambió en otra sesión. Recarga antes de continuar.", 409);
    const record = await tx.terraqoWorklogEntry.findFirst({
      where: {
        id: input.payload.worklogId,
        professionalProfileId: profile.id,
        authorId: input.userId,
        workspaceId: workCase.workspaceId,
        ...(workCase.projectId ? { projectId: workCase.projectId } : {}),
        deletedAt: null,
      },
      select: { id: true },
    });
    if (!record) throw new WorkCaseError("La bitácora no pertenece al contexto de este trabajo.", 422);
    await tx.terraqoWorkCaseRecord.create({
      data: {
        workCaseId: workCase.id,
        worklogId: record.id,
        phase: input.payload.phase,
        relationshipStatus: "CONFIRMED",
        confirmedById: input.userId,
        confirmedAt: new Date(),
      },
    });
    return tx.terraqoWorkCase.update({
      where: { id: workCase.id },
      data: { version: { increment: 1 } },
      include: workCaseInclude,
    });
  }, { isolationLevel: "Serializable" });
}

export async function removeWorkCaseRecord(input: {
  userId: string;
  workCaseId: string;
  worklogId: string;
  expectedVersion: number;
}) {
  const profile = await profileFor(input.userId);
  return prisma.$transaction(async (tx) => {
    const workCase = await tx.terraqoWorkCase.findFirst({
      where: { id: input.workCaseId, professionalProfileId: profile.id, lifecycle: { not: "ARCHIVED" } },
      select: { id: true, version: true },
    });
    if (!workCase) throw new WorkCaseError("Trabajo no disponible.", 404);
    await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoWorkCase" WHERE id=${workCase.id} FOR UPDATE`);
    const locked = await tx.terraqoWorkCase.findUnique({
      where: { id: workCase.id },
      select: { version: true },
    });
    if (!locked || locked.version !== input.expectedVersion)
      throw new WorkCaseError("El trabajo cambió en otra sesión. Recarga antes de continuar.", 409);
    const deleted = await tx.terraqoWorkCaseRecord.deleteMany({
      where: { workCaseId: workCase.id, worklogId: input.worklogId },
    });
    if (!deleted.count) throw new WorkCaseError("La relación ya no existe.", 404);
    return tx.terraqoWorkCase.update({
      where: { id: workCase.id },
      data: { version: { increment: 1 } },
      include: workCaseInclude,
    });
  }, { isolationLevel: "Serializable" });
}
