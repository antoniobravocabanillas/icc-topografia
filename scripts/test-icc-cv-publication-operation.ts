import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";
import { createRevocablePortalToken, verifyWorkspacePortalToken } from "../lib/server/workspace-portal-session";
import { readCvPublication, writeCvPublication, CvPublicationError } from "../lib/server/portal-cv-publication";
import type { WorkspacePortalToken } from "../lib/server/workspace-portal-session";

let phase = "fixture";
let httpStatus: number | undefined;
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  const alias = `cv-op-${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const user = await prisma.user.create({ data: { email: `${alias}@example.test`, name: "Fixture operación CV", role: "CUSTOMER",
    terraqoMemberships: { create: { workspaceId: workspace.id, role: "PROFESSIONAL", active: true } },
    terraqoProfessionalProfile: { create: { username: alias, liveCvEnabled: false, experiences: { create: { title: "Entrada privada sintética", visibility: "PRIVATE" } } } },
  }, select: { id: true, terraqoProfessionalProfile: { select: { id: true } }, terraqoMemberships: { select: { id: true } } } });
  const profileId = user.terraqoProfessionalProfile!.id;
  const identifier = `portal-session:${workspace.id}:${user.id}`;
  const key = () => randomUUID().replaceAll("-", "");
  const errorStatus = (status: number) => (error: unknown) => error instanceof CvPublicationError && error.status === status;
  try {
    const session = await createRevocablePortalToken({ sub: user.id, workspaceId: workspace.id, workspaceSlug: "icc-topografia", role: "PROFESSIONAL" });
    const token = verifyWorkspacePortalToken(session.token, "icc-topografia")!;
    phase = "simultaneous same-key replay";
    const before = await readCvPublication(token);
    assert.equal(before.current.published, false); assert.equal(before.receipt, null);
    const publish = { action: "PUBLISH", consent: true, version: before.current.version, operationKey: key() };
    const results = await Promise.all([writeCvPublication(token, publish), writeCvPublication(token, publish)]);
    assert.deepEqual(results[0], results[1]); assert.equal(results[0].current.published, true);
    assert.equal(await prisma.terraqoCvPublicationOperation.count({ where: { professionalProfileId: profileId } }), 1);
    assert.equal(await prisma.activityLog.count({ where: { actorId: user.id, entityType: "CvPublication" } }), 1);
    assert.ok(results[0].current.version > before.current.version);
    phase = "same key different payload and stale key";
    await assert.rejects(writeCvPublication(token, { action: "WITHDRAW", version: publish.version, operationKey: publish.operationKey }), errorStatus(409));
    await assert.rejects(writeCvPublication(token, { ...publish, operationKey: key() }), errorStatus(409));
    phase = "distinct keys at same version";
    const requests = [0, 1].map(() => ({ action: "WITHDRAW", version: results[0].current.version, operationKey: key() }));
    const contested = await Promise.allSettled(requests.map(input => writeCvPublication(token, input)));
    assert.equal(contested.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(contested.filter(result => result.status === "rejected" && errorStatus(409)(result.reason)).length, 1);
    phase = "historical receipt and current withdrawal";
    const reconciled = await readCvPublication(token, publish.operationKey);
    assert.equal(reconciled.receipt?.published, true); assert.equal(reconciled.current.published, false);
    const replay = await writeCvPublication(token, publish);
    assert.equal(replay.receipt?.published, true); assert.equal(replay.current.published, false);
    assert.equal(await prisma.terraqoCvPublicationOperation.count({ where: { professionalProfileId: profileId } }), 2);
    const entries = await prisma.terraqoProfessionalExperience.findMany({ where: { professionalProfileId: profileId }, select: { visibility: true } });
    assert.deepEqual(entries, [{ visibility: "PRIVATE" }]);
    for (const input of [{ ...token, role: "CLIENT" }, { ...token, exp: 1 }, { ...token, workspaceId: "foreign" }])
      await assert.rejects(readCvPublication(input as WorkspacePortalToken, publish.operationKey), errorStatus(403));
    await assert.rejects(readCvPublication({ ...token, jti: undefined }), errorStatus(401));
    phase = "missing alias and absent receipt";
    await assert.rejects(readCvPublication({ ...token, sub: "foreign" }), errorStatus(404));
    assert.equal((await readCvPublication(token, key())).receipt, null);
    await prisma.terraqoProfessionalProfile.update({ where: { id: profileId }, data: { username: null } });
    const noAlias = await readCvPublication(token);
    await assert.rejects(writeCvPublication(token, { ...publish, version: noAlias.current.version, operationKey: key() }), errorStatus(422));
    await prisma.terraqoProfessionalProfile.update({ where: { id: profileId }, data: { username: alias } });
    phase = "audit failure rolls back state and operation";
    const rollbackBefore = await readCvPublication(token);
    const originalTransaction = prisma.$transaction;
    const injected = Symbol("audit failure");
    prisma.$transaction = ((work: (tx: Prisma.TransactionClient) => Promise<unknown>, options: object) =>
      originalTransaction.call(prisma, async tx => {
        const originalCreate = tx.activityLog.create;
        tx.activityLog.create = (() => { throw injected; }) as typeof originalCreate;
        try { return await work(tx); } finally { tx.activityLog.create = originalCreate; }
      }, options)) as unknown as typeof originalTransaction;
    try {
      await assert.rejects(writeCvPublication(token, { ...publish, version: rollbackBefore.current.version, operationKey: key() }), error => error === injected);
    } finally { prisma.$transaction = originalTransaction; }
    assert.deepEqual((await readCvPublication(token)).current, rollbackBefore.current);
    assert.equal(await prisma.terraqoCvPublicationOperation.count({ where: { professionalProfileId: profileId } }), 2);
    assert.equal(await prisma.activityLog.count({ where: { actorId: user.id, entityType: "CvPublication" } }), 2);
    phase = "bounded private routes";
    const routes = await import("../app/api/public/workspaces/[workspaceSlug]/portal/cv-publication/route");
    phase = "private route requests";
    const remote = process.env.TERRAQO_CV_PUBLICATION_HTTP === "1";
    const url = "https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal/cv-publication";
    const request = async (method: "GET" | "POST", body?: string, query = "", authenticated = true, type = "application/json") => {
      const headers: Record<string, string> = { "Content-Type": type };
      if (authenticated) headers.Authorization = `Bearer ${session.token}`;
      const init = { method, headers, body, redirect: "error" as const, signal: AbortSignal.timeout(90000) };
      phase = `route ${method}, authenticated=${authenticated}, bytes=${body?.length ?? 0}, type=${type}`;
      const response = remote ? await fetch(url + query, init) : await routes[method](new Request(url + query, init), { params: Promise.resolve({ workspaceSlug: "icc-topografia" }) });
      httpStatus = response.status;
      assert.match(response.headers.get("cache-control") ?? "", /private.*no-store/);
      assert.equal(response.headers.get("x-content-type-options"), "nosniff");
      return response;
    };
    assert.equal((await request("GET", undefined, "", false)).status, 401);
    assert.equal((await request("POST", JSON.stringify(publish), "", true, "text/plain")).status, 415);
    assert.equal((await request("POST", "{" )).status, 422);
    assert.equal((await request("POST", "x".repeat(4097))).status, 413);
    assert.equal((await request("POST", JSON.stringify({ ...publish, owner: "foreign" }))).status, 422);
    for (const query of ["?operationKey=", "?operationKey="+key()+"&operationKey="+key(), "?owner=foreign"])
      assert.equal((await request("GET", undefined, query)).status, 422);
    assert.equal(await prisma.terraqoCvPublicationOperation.count({ where: { professionalProfileId: profileId } }), 2);
    const routePublish = { ...publish, version: (await readCvPublication(token)).current.version, operationKey: key() };
    const publicResponse = await request("POST", JSON.stringify(routePublish)); assert.equal(publicResponse.status, 200);
    const publicDto = await publicResponse.json();
    assert.equal(publicDto.data.current.published, true);
    assert.deepEqual(Object.keys(publicDto.data.current).sort(), ["published", "url", "username", "version"]);
    const routeWithdraw = { action: "WITHDRAW", version: publicDto.data.current.version, operationKey: key() };
    assert.equal((await request("POST", JSON.stringify(routeWithdraw))).status, 200);
    const checked = await request("GET", undefined, "?operationKey=" + routePublish.operationKey);
    assert.equal(checked.status, 200);
    const checkedDto = await checked.json(); assert.equal(checkedDto.data.receipt.published, true); assert.equal(checkedDto.data.current.published, false);
    const repeated = await request("POST", JSON.stringify(routePublish)); assert.equal(repeated.status, 200);
    assert.equal((await repeated.json()).data.current.published, false);
    assert.equal(await prisma.terraqoCvPublicationOperation.count({ where: { professionalProfileId: profileId } }), 4);
    phase = "membership demotion and revocation";
    await prisma.terraqoWorkspaceMember.update({ where: { id: user.terraqoMemberships[0].id }, data: { role: "ADMIN" } });
    await assert.rejects(writeCvPublication(token, publish), errorStatus(403));
    await prisma.terraqoWorkspaceMember.update({ where: { id: user.terraqoMemberships[0].id }, data: { role: "PROFESSIONAL" } });
    await prisma.verificationToken.deleteMany({ where: { identifier, token: createHash("sha256").update(token.jti!).digest("hex") } });
    await assert.rejects(readCvPublication(token, publish.operationKey), errorStatus(401));
    await assert.rejects(writeCvPublication(token, publish), errorStatus(401));
    assert.equal((await request("GET")).status, 401);
    console.log(`PASS ${remote ? "deployed HTTP" : "local Request/Response"} private routes: bounded JSON, strict queries/payload, DTO, explicit publish/withdraw, replay, no-store and revoked session.`);
    console.log("PASS real SQL publication: concurrent replay once, distinct-key conflict, persisted reconciliation, historic receipt/current withdrawal, entry visibility unchanged, missing alias, atomic rollback on audit failure, roles/membership/grant revocation.");
  } finally {
    await prisma.activityLog.deleteMany({ where: { actorId: user.id, entityType: "CvPublication" } });
    await prisma.verificationToken.deleteMany({ where: { identifier } });
    await prisma.user.delete({ where: { id: user.id } });
    assert.equal(await prisma.terraqoCvPublicationOperation.count({ where: { professionalProfileId: profileId } }), 0);
    console.log("CLEANUP: only this invocation's synthetic operations/audits/grants/user/profile/membership/experience removed.");
  }
}
main().catch(() => { console.error(`CV operation verification failed at ${phase}, HTTP ${httpStatus ?? "unavailable"}; private diagnostics suppressed.`); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
