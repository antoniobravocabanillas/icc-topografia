import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { addEvaluationNote, listEvaluationDossiers, saveEvaluationAssessment, saveEvaluationQuestion, DiscoveryNeedsError } from "../lib/terraqo/discovery-needs";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.username, "terraqo_s22_test");
  assert.equal(process.env.TERRAQO_LOCAL_S22_TEST, "synthetic-only");
  const actor = await prisma.user.create({ data: { email: "owner@dossier.invalid" } });
  const profile = await prisma.terraqoProfessionalProfile.create({ data: { userId: actor.id } });
  const a = await prisma.terraqoWorkspace.create({ data: { name: "A", slug: "dossier-a" } });
  const b = await prisma.terraqoWorkspace.create({ data: { name: "B", slug: "dossier-b" } });
  for (const workspace of [a,b]) await prisma.terraqoWorkspaceMember.create({ data: { userId: actor.id, workspaceId: workspace.id, role: "ADMIN" } });
  const identity = () => ({ createdById: actor.id, operationKey: randomUUID(), operationFingerprint: "fixture" });
  const need = await prisma.terraqoWorkNeed.create({ data: { workspaceId: a.id, ...identity() } });
  const rev = await prisma.terraqoWorkNeedRevision.create({ data: { needId: need.id, revisionNo: 1, title: "Campo", problem: "Medición", contentHash: "fixture", ...identity() } });
  const dossier = await prisma.terraqoEvaluationDossier.create({ data: { workspaceId: a.id, needRevisionId: rev.id, professionalProfileId: profile.id, ...identity() } });
  const note = randomUUID(), question = randomUUID(), assessment = randomUUID();
  const actions = (workspaceId: string) => {
    const scope = { userId: actor.id, workspaceId, dossierId: dossier.id };
    return [
      () => addEvaluationNote({ ...scope, operationKey: note, payload: { body: "Privada" } }),
      () => saveEvaluationQuestion({ ...scope, operationKey: question, payload: { text: "¿Cómo se verificó?", expectedRevisionNo: 0 } }),
      () => saveEvaluationAssessment({ ...scope, operationKey: assessment, payload: { criterionLabel: "Instrumentación", claimState: "UNKNOWN", sourceIds: [], expectedRevisionNo: 0 } }),
    ];
  };
  const denied = (status: number) => (e: unknown) => e instanceof DiscoveryNeedsError && e.status === status;
  try {
    for (const run of actions(a.id)) assert.equal((await run()).id, (await run()).id);
    for (const run of actions(b.id)) await assert.rejects(run, denied(404));
    assert.equal((await listEvaluationDossiers({ userId: actor.id, workspaceId: a.id })).length, 1);
    await prisma.terraqoWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: a.id, userId: actor.id } }, data: { role: "VIEWER" } });
    for (const run of actions(a.id)) await assert.rejects(run, denied(403));
    await assert.rejects(listEvaluationDossiers({ userId: actor.id, workspaceId: a.id }), denied(403));
    await prisma.terraqoWorkspaceMember.update({ where: { workspaceId_userId: { workspaceId: a.id, userId: actor.id } }, data: { role: "ADMIN" } });
    await prisma.terraqoEvaluationDossier.update({ where: { id: dossier.id }, data: { lifecycle: "ARCHIVED" } });
    for (const run of actions(a.id)) await assert.rejects(run, denied(404));
    console.log("PASS dossier authorization: valid replay, foreign workspace, role loss and archive across notes, questions and assessment.");
  } finally { await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
