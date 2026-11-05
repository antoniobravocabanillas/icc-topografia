import assert from "node:assert/strict";
import type { TerraqoModuleCode } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma";
import { ordinaryWorkspaceMemberRoles, workspaceBrandAuthority } from "../lib/terraqo/workspace-roles";
import { createRequire } from "node:module";
import React from "react";

async function main() {
  const url = new URL(process.env.DATABASE_URL || "");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.username, "terraqo_s22_test");
  assert.equal(process.env.TERRAQO_LOCAL_S22_TEST, "synthetic-only");
  assert.equal(process.env.NODE_ENV, "development");
  assert.notEqual(process.env.NETLIFY, "true");
  assert.deepEqual([...ordinaryWorkspaceMemberRoles].sort(),
    ["ADMIN", "CLIENT", "MANAGER", "MEMBER", "OWNER", "PROFESSIONAL", "VIEWER"]);

  const require = createRequire(import.meta.url);
  const session = { user: { id: "", role: "ADMIN" } };
  const stub = (name: string, exports: object) => {
    const id = require.resolve(name);
    require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
  };
  stub("server-only", {});
  stub("../auth", { auth: async () => session });
  stub("next/navigation", { redirect: (path: string) => { throw new Error(path); } });
  stub("next/cache", { revalidatePath: () => undefined });
  Object.assign(globalThis, { React });
  const { resolveEvidenceReadScope } = await import("../lib/terraqo/evidence-policy");
  const { getExperienceEvidenceFile } = await import("../lib/server/experience-evidence");
  const { getWorklogEvidenceFile } = await import("../lib/server/worklog-evidence");
  const { downloadMessageAttachment } = await import("../lib/server/message-attachments");
  const { getWorkspaceFileStore, getWorklogEvidenceStore } = await import("../lib/server/media");
  const { getForumAccessContext } = await import("../lib/terraqo/forums");
  const { getTeamWorkspaces } = await import("../lib/terraqo/teams");
  const { getMessagingWorkspaces, sendMessage } = await import("../lib/terraqo/messaging");
  const { canViewWorklog } = await import("../lib/terraqo/worklog");
  const { getSessionWorkspaceWithModule } = await import("../lib/terraqo/workspace-scope");
  const { createPrivateNote, deletePrivateNote, deleteWorkspaceFile, listWorkspaceFiles, serveWorkspaceFile } = await import("../lib/server/private-workspace-storage");
  const { default: BrandPage } = await import("../app/(commerce)/portal/workspace/page");
  const suffix = randomUUID();
  const actor = await prisma.user.create({ data: { email: `actor-${suffix}@boundary.invalid`, role: "ADMIN",
    terraqoProfessionalProfile: { create: {} } } });
  const author = await prisma.user.create({ data: { email: `author-${suffix}@boundary.invalid`,
    terraqoProfessionalProfile: { create: {} } }, include: { terraqoProfessionalProfile: true } });
  session.user.id = actor.id;
  const profileId = author.terraqoProfessionalProfile!.id;
  const target = await prisma.terraqoWorkspace.create({ data: { name: "Target", slug: "icc-topografia",
    members: { create: { userId: actor.id, role: "VIEWER" } },
    modules: { create: (["PROFESSIONAL_NETWORK", "PROFESSIONAL_MESSAGING", "FORUMS", "COLLABORATION_TEAMS", "AI_WRITING_ASSISTANT"] satisfies TerraqoModuleCode[]).map(
      code => ({ code, active: true })) } } });
  const elsewhere = await prisma.terraqoWorkspace.create({ data: { name: "Managed", slug: `managed-${suffix}`,
    members: { create: { userId: actor.id, role: "MANAGER" } } } });
  const worklog = await prisma.terraqoWorklogEntry.create({ data: { authorId: author.id, professionalProfileId: profileId,
    workspaceId: target.id, visibility: "WORKSPACE", title: "Internal", summary: "Restricted" } });
  const experience = await prisma.terraqoProfessionalExperience.create({ data: { professionalProfileId: profileId,
    workspaceId: target.id, title: "Evidence" } });
  const key = `boundary-${suffix}`;
  const evidence = await prisma.terraqoExperienceEvidence.create({ data: { experienceId: experience.id, uploadedById: author.id,
    storageKey: key, fileName: "proof.txt", contentType: "text/plain", size: 5 } });
  const file = await prisma.terraqoWorkspaceFile.create({ data: { workspaceId: target.id, userId: actor.id,
    title: "Old file", storageKey: key, fileName: "old.txt", contentType: "text/plain", size: 1 } });
  const conversation = await prisma.terraqoConversation.create({ data: { createdById: author.id, workspaceId: target.id,
    participants: { create: { userId: actor.id } } } });
  const store = getWorklogEvidenceStore();
  const media = await prisma.terraqoWorklogMedia.create({ data: { worklogId: worklog.id,
    storageKey: key, fileName: "worklog.txt", contentType: "text/plain", size: 5 } });
  const original = [...ordinaryWorkspaceMemberRoles];
  try {
    await store.set(key, new TextEncoder().encode("proof").buffer);
    await getWorkspaceFileStore().set(key, new TextEncoder().encode("owned").buffer);
    const brandPage = await BrandPage({ searchParams: Promise.resolve({}) });
    function findAction(node: React.ReactNode): ((data: FormData) => Promise<void>) | undefined {
      if (!React.isValidElement<{ action?: (data: FormData) => Promise<void>; children?: React.ReactNode }>(node)) return;
      if (node.type === "form") return node.props.action;
      return React.Children.toArray(node.props.children).map(findAction).find(Boolean);
    }
    const brandAction = findAction(brandPage);
    assert.ok(brandAction);
    const form = new FormData();
    form.set("brandName", "Forged");
    form.set("workspaceId", elsewhere.id);
    await assert.rejects(brandAction(form), /status=permission/);
    assert.equal((await prisma.terraqoWorkspace.findUniqueOrThrow({ where: { id: target.id } })).brandName, null);
    // Begin with target management authority, then revoke it while the logo bytes are read.
    const seat = { workspaceId_userId: { workspaceId: target.id, userId: actor.id } };
    await prisma.terraqoWorkspaceMember.update({ where: seat, data: { role: "MANAGER" } });
    form.set("brandName", "Authorized");
    await assert.rejects(brandAction(form), /success=brand/);
    const logo = new File(["local-logo"], "brand.png", { type: "image/png" });
    const readLogo = logo.arrayBuffer.bind(logo);
    logo.arrayBuffer = async () => {
      await prisma.terraqoWorkspaceMember.update({ where: seat, data: { role: "VIEWER" } });
      return readLogo();
    };
    form.set("logoFile", logo);
    form.set("brandName", "Revoked");
    await assert.rejects(brandAction(form), /status=permission/);
    const saved = await prisma.terraqoWorkspace.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(saved.brandName, "Authorized");
    assert.equal(saved.logoUrl, null);
    assert.equal((await getSessionWorkspaceWithModule("AI_WRITING_ASSISTANT"))?.id, target.id);
    assert.ok(await canViewWorklog(actor.id, worklog.id));
    assert.equal(await (await getExperienceEvidenceFile(actor.id, evidence.id)).text(), "proof");
    assert.equal((await listWorkspaceFiles(actor.id, target.id)).status, 200);
    assert.equal(await (await serveWorkspaceFile(new Request("http://localhost/files"), actor.id, file.id)).text(), "owned");
    const note = await createPrivateNote(new Request("http://localhost/notes", {
      method: "POST", body: JSON.stringify({ title: "Owned", body: "Private" }),
    }), actor.id, target.id);
    assert.equal(note.status, 201);
    const storedNote = await prisma.terraqoPrivateNote.findFirstOrThrow({ where: { userId: actor.id, workspaceId: target.id } });
    const operationKey = randomUUID();
    const message = { userId: actor.id, conversationId: conversation.id, body: "Existing message", operationKey };
    const sent = await sendMessage(message);
    const attachment = await prisma.terraqoMessageAttachment.create({ data: { messageId: sent.id, storageKey: key,
      fileName: "attachment.txt", contentType: "text/plain", size: 5 } });
    assert.equal(await (await getWorklogEvidenceFile(actor.id, media.id)).text(), "proof");
    assert.equal((await prisma.terraqoWorkspace.updateMany({ where: workspaceBrandAuthority(actor.id, target.id),
      data: { brandName: "Unauthorized" } })).count, 0);
    assert.equal((await prisma.terraqoWorkspace.updateMany({ where: workspaceBrandAuthority(actor.id, elsewhere.id),
      data: { brandName: "Authorized" } })).count, 1);

    // Test-only simulation of an active role outside the allowlist without extending the DB enum.
    ordinaryWorkspaceMemberRoles.splice(ordinaryWorkspaceMemberRoles.indexOf("VIEWER"), 1);
    assert.equal(await getSessionWorkspaceWithModule("AI_WRITING_ASSISTANT"), null);
    assert.equal(await canViewWorklog(actor.id, worklog.id), null);
    assert.equal((await getWorklogEvidenceFile(actor.id, media.id)).status, 403);
    await assert.rejects(downloadMessageAttachment(actor.id, attachment.id), { status: 404 });
    const scope = await resolveEvidenceReadScope({ actorUserId: actor.id, professionalProfileId: profileId });
    assert.deepEqual(scope?.workspaceIds, [elsewhere.id]);
    assert.equal((await getExperienceEvidenceFile(actor.id, evidence.id)).status, 403);
    await prisma.terraqoProfessionalExperience.update({ where: { id: experience.id }, data: { validatorUserId: actor.id } });
    assert.equal(await (await getExperienceEvidenceFile(actor.id, evidence.id)).text(), "proof");
    assert.equal((await listWorkspaceFiles(actor.id, target.id)).status, 403);
    assert.equal((await serveWorkspaceFile(new Request("http://localhost/files"), actor.id, file.id)).status, 404);
    assert.equal((await deletePrivateNote(actor.id, storedNote.id)).status, 404);
    assert.equal((await deleteWorkspaceFile(actor.id, file.id)).status, 404);
    assert.ok(await prisma.terraqoWorkspaceFile.findUnique({ where: { id: file.id } }));
    assert.deepEqual(await getTeamWorkspaces(actor.id), []);
    assert.deepEqual(await getMessagingWorkspaces(actor.id), []);
    await assert.rejects(getForumAccessContext(actor.id), { status: 403 });
    await assert.rejects(sendMessage(message), { status: 403 });
    console.log("PASS ordinary workspace boundary, scoped validator bytes, stale participant replay and cross-tenant brand authority");
  } finally {
    ordinaryWorkspaceMemberRoles.splice(0, ordinaryWorkspaceMemberRoles.length, ...original);
    await Promise.all([store.delete(key), getWorkspaceFileStore().delete(key)]);
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
