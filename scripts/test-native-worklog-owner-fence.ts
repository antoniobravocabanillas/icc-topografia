import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { advanceNativeWorklogOwnerVersion } from "../lib/server/native-worklog-owner-version";
import { NativeWorklogOperationError } from "../lib/server/native-worklog-http";

function barrier<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Two real clients, only newly created ICC profile/member fixtures. No native rows/points/DDL writes. */
export async function nativeOwnerFenceProof(first: PrismaClient, workspaceId: string) {
  const second = new PrismaClient({ log: [] });
  const marker = randomUUID();
  let actorId: string | undefined, profileId: string | undefined;
  const tasks: Promise<unknown>[] = [];
  try {
    const fixture = await first.$transaction(async tx => {
      const actor = await tx.user.create({ data: { name: `ICC owner-fence own ${marker}`, email: `owner-fence-${marker}@example.invalid`, role: "CUSTOMER" } });
      const profile = await tx.terraqoProfessionalProfile.create({ data: { userId: actor.id, visibility: "PRIVATE", liveCvEnabled: false } });
      await tx.terraqoWorkspaceMember.create({ data: { userId: actor.id, workspaceId, role: "PROFESSIONAL", active: true } });
      return { actor, profile };
    });
    actorId = fixture.actor.id; profileId = fixture.profile.id;
    const owner = { actorId, profileId };
    async function interleave(advance: boolean) {
      const locked = barrier<void>(), readerPid = barrier<number>();
      const writer = first.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '5s'`;
        const [backend] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile"
          WHERE id=${owner.profileId} AND "userId"=${owner.actorId} FOR UPDATE`);
        locked.resolve();
        const waitingPid = await readerPid.promise;
        assert.notEqual(waitingPid, backend.pid);
        const deadline = performance.now() + 5000;
        let blocked = false;
        while (performance.now() < deadline) {
          // Observe only the two fixture transaction PIDs; no inventory of other sessions.
          const [observation] = await tx.$queryRaw<{ blocked: boolean }[]>(Prisma.sql`
            SELECT ${backend.pid}::int=ANY(pg_blocking_pids(${waitingPid}::int)) AS blocked`);
          if (observation.blocked) { blocked = true; break; }
          await new Promise(resolve => setTimeout(resolve, 25));
        }
        assert.ok(blocked, "Own reader must be blocked before the writer commits");
        if (advance) await advanceNativeWorklogOwnerVersion(tx, owner.profileId, owner.actorId, new Date());
      }, { isolationLevel: "ReadCommitted", maxWait: 1000, timeout: 20000 });
      tasks.push(writer);
      void writer.catch(error => locked.reject(error));
      await locked.promise;
      const reader = second.$transaction(async tx => {
        await tx.$executeRaw`SET LOCAL lock_timeout = '10s'`;
        const old = await tx.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: owner.profileId }, select: { updatedAt: true } });
        const [backend] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        readerPid.resolve(backend.pid);
        await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile"
          WHERE id=${owner.profileId} AND "userId"=${owner.actorId} FOR UPDATE`);
        return old.updatedAt;
      }, { isolationLevel: "Serializable", maxWait: 1000, timeout: 20000 });
      tasks.push(reader);
      void reader.catch(error => readerPid.reject(error));
      const [written, read] = await Promise.allSettled([writer, reader]);
      assert.equal(written.status, "fulfilled");
      if (!advance) { assert.equal(read.status, "fulfilled"); return; }
      assert.equal(read.status, "rejected");
      const error = (read as PromiseRejectedResult).reason as unknown;
      assert.ok(error instanceof Prisma.PrismaClientKnownRequestError);
      assert.ok(error.code === "P2034" || (error.code === "P2010" && error.meta?.code === "40001"));
    }
    await interleave(false); // A lock alone allows the earlier snapshot to complete.
    await interleave(true); // The production version write makes that earlier snapshot abort.
    const current = await first.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: owner.profileId } });
    assert.ok(current.updatedAt > fixture.profile.updatedAt);
    const retry = await second.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile" WHERE id=${owner.profileId}
        AND "userId"=${owner.actorId} FOR UPDATE`);
      return tx.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: owner.profileId } });
    }, { isolationLevel: "Serializable", maxWait: 1000, timeout: 10000 });
    assert.equal(retry.updatedAt.getTime(), current.updatedAt.getTime());
    await assert.rejects(first.$transaction(tx => advanceNativeWorklogOwnerVersion(tx, owner.profileId, "own-mismatched-actor", new Date())),
      error => error instanceof NativeWorklogOperationError && error.status === 503);
    assert.equal((await first.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: owner.profileId } })).updatedAt.getTime(), current.updatedAt.getTime());
    assert.equal(current.visibility, "PRIVATE"); assert.equal(current.liveCvEnabled, false);
    assert.equal(await first.terraqoWorklogEntry.count({ where: { authorId: owner.actorId } }), 0);
    assert.equal(await first.terraqoBuilderAccount.count({ where: { userId: owner.actorId } }), 0);
    assert.equal(await first.terraqoBuilderContribution.count({ where: { userId: owner.actorId } }), 0);
    assert.equal(await first.activityLog.count({ where: { actorId: owner.actorId } }), 0);
  } finally {
    await Promise.allSettled(tasks);
    await second.$disconnect();
    if (actorId && profileId) {
      await first.$transaction(async tx => {
        const actor = await tx.user.findUniqueOrThrow({ where: { id: actorId } });
        assert.equal(actor.email, `owner-fence-${marker}@example.invalid`);
        assert.equal(actor.name, `ICC owner-fence own ${marker}`);
        const profile = await tx.terraqoProfessionalProfile.findUniqueOrThrow({ where: { id: profileId } });
        assert.equal(profile.userId, actorId);
        await tx.terraqoWorkspaceMember.deleteMany({ where: { userId: actorId, workspaceId } });
        await tx.terraqoProfessionalProfile.delete({ where: { id: profileId } });
        await tx.user.delete({ where: { id: actorId } });
      });
      assert.equal(await first.user.count({ where: { id: actorId } }), 0);
      assert.equal(await first.terraqoProfessionalProfile.count({ where: { id: profileId } }), 0);
      assert.equal(await first.terraqoWorkspaceMember.count({ where: { userId: actorId } }), 0);
    }
  }
}
