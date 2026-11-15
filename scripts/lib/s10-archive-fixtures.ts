import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

export function archiveFixture() {
  const run = randomUUID();
  const owner = "s10-owner-" + run, profile = "s10-profile-" + run, workspace = "s10-space-" + run;
  const username = "s10-" + run.replaceAll("-", "").slice(0, 24);
  const project = "s10-project-" + run, hiddenProject = "s10-hidden-" + run;
  function record(key: string, time: string, changes: Partial<Prisma.TerraqoWorklogEntryCreateManyInput> = {}) {
    return {
      authorId: owner, professionalProfileId: profile, title: "Poligonal " + key, summary: "Lectura " + key,
      workspaceId: null, projectId: project, visibility: "PUBLIC", lifecycle: "PUBLISHED", type: "DELIVERABLE",
      evidenceStatus: "LINKED", ...changes, occurredAt: new Date(time), id: "s10-" + run + "-" + key,
    } satisfies Prisma.TerraqoWorklogEntryCreateManyInput;
  }
  // Exactly twenty newer entries with no project. The project and both range hits are off page one.
  const newer = Array.from({ length: 20 }, (_, i) => {
    const key = "campo-" + String(20 - i).padStart(2, "0");
    return record(key, "2026-11-01T05:00:00Z", { projectId: null, title: "Lectura " + key });
  });
  // Each near miss differs from the two range hits in just one selected dimension.
  const before = record("antes", "2026-10-28T04:59:59Z");
  const start = record("inicio", "2026-10-29T04:59:59Z");
  const end = record("fin", "2026-10-29T05:00:00Z");
  const after = record("despues", "2026-11-01T04:59:59Z");
  const visible = [...newer, after, end, start,
    record("tipo", "2026-10-28T18:00:00Z", { type: "FIELD_UPDATE" }),
    record("estado", "2026-10-28T17:00:00Z", { evidenceStatus: "DECLARED" }),
    record("proyecto", "2026-10-28T16:00:00Z", { projectId: null }),
    record("texto", "2026-10-28T15:00:00Z", { title: "Nivelación lateral" }),
    before];
  const hidden = [
    record("privado", "2026-10-26T12:00:00Z", { visibility: "PRIVATE" }),
    record("borrador", "2026-10-26T13:00:00Z", { lifecycle: "DRAFT" }),
    record("empresa", "2026-10-26T14:00:00Z", { workspaceId: workspace }),
    record("obra-reservada", "2026-10-26T15:00:00Z", { projectId: hiddenProject }),
  ];
  return { run, owner, username, profile, workspace, project, hiddenProject, visible, hidden, start, end, before, after };
}
export type ArchiveFixture = ReturnType<typeof archiveFixture>;

export async function seedArchive(db: PrismaClient, f: ArchiveFixture) {
  await db.$transaction(async tx => {
    await tx.user.create({ data: { id: f.owner, email: f.owner + "@example.invalid", role: "CUSTOMER" } });
    await tx.terraqoProfessionalProfile.create({ data: { id: f.profile, userId: f.owner, username: f.username,
      visibility: "PUBLIC", liveCvEnabled: true, liveCvVisibility: "PUBLIC" } });
    await tx.terraqoWorkspace.create({ data: { id: f.workspace, slug: f.workspace, name: "Control S10", ownerUserId: f.owner } });
    await tx.project.createMany({ data: [f.project, f.hiddenProject].map(id => ({
      id, terraqoWorkspaceId: f.workspace, slug: id, isPublic: id === f.project, title: "Obra " + id,
      summary: "Control de archivo", description: "Control sintético", servicesApplied: [],
    })) });
    await tx.terraqoWorklogEntry.createMany({ data: [...f.visible, ...f.hidden] });
  }, { timeout: 45_000 });
}

export async function cleanArchive(db: PrismaClient, f: ArchiveFixture) {
  await db.$transaction([
    db.terraqoWorklogEntry.deleteMany({ where: { professionalProfileId: f.profile, authorId: f.owner,
      id: { in: [...f.visible, ...f.hidden].map(row => row.id) } } }),
    db.project.deleteMany({ where: { id: { in: [f.project, f.hiddenProject] }, terraqoWorkspaceId: f.workspace } }),
    db.terraqoWorkspace.deleteMany({ where: { id: f.workspace, ownerUserId: f.owner, slug: f.workspace } }),
    db.terraqoProfessionalProfile.deleteMany({ where: { id: f.profile, userId: f.owner, username: f.username } }),
    db.user.deleteMany({ where: { id: f.owner, email: f.owner + "@example.invalid" } }),
  ]);
}

// Run through a fresh client after the cleanup transaction has committed.
export async function assertArchiveRemoved(db: PrismaClient, f: ArchiveFixture) {
  const remaining = await db.$transaction([
    db.terraqoWorklogEntry.count({ where: { id: { in: [...f.visible, ...f.hidden].map(row => row.id) } } }),
    db.project.count({ where: { id: { in: [f.project, f.hiddenProject] } } }),
    db.terraqoWorkspace.count({ where: { id: f.workspace } }),
    db.terraqoProfessionalProfile.count({ where: { id: f.profile } }),
    db.user.count({ where: { id: f.owner } }),
  ]);
  assert.deepEqual(remaining, [0, 0, 0, 0, 0], "S10 fixture rows survived cleanup");
}
