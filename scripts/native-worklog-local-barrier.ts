import assert from "node:assert/strict";
import { Prisma, PrismaClient } from "@prisma/client";

/** Test-only barrier: drain both transactions and prove own PID blocking before first commit. */
export async function blockedNativePair<T>(a: PrismaClient, b: PrismaClient, action: (db: Pick<PrismaClient, "$transaction">, index: number) => Promise<T>) {
  let firstPid = 0, secondPid = 0;
  let firstReady!: () => void, secondReady!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { firstReady = resolve; });
  const entering = new Promise<void>(resolve => { secondReady = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  function boundary(client: PrismaClient, index: number): Pick<PrismaClient, "$transaction"> {
    return new Proxy(client, { get(target, field) {
      if (field !== "$transaction") return Reflect.get(target, field);
      return (callback: (tx: Prisma.TransactionClient) => Promise<T>, options: { maxWait: number; timeout: number }) =>
        target.$transaction(async tx => {
          const [pid] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
          if (index === 0) firstPid = pid.pid;
          else { secondPid = pid.pid; secondReady(); }
          const result = await callback(tx);
          if (index === 0) { firstReady(); await held; }
          return result;
        }, options);
    } });
  }
  const first = action(boundary(a, 0), 0);
  // Attach handlers immediately: a callback failure must not become an unhandled rejection.
  const firstObserved = first.then(value => ({ value }), error => ({ error }));
  let secondObserved: Promise<{ value: T } | { error: unknown }> | undefined;
  try {
    await Promise.race([ready, firstObserved.then(value => { if ("error" in value) throw value.error; })]);
    const second = action(boundary(b, 1), 1);
    secondObserved = second.then(value => ({ value }), error => ({ error }));
    await Promise.race([entering, secondObserved.then(value => { if ("error" in value) throw value.error; })]);
    assert.notEqual(firstPid, secondPid);
    let blocked = false;
    const deadline = performance.now() + 2000;
    while (performance.now() < deadline) {
      const [row] = await a.$queryRaw<{ blocked: boolean }[]>(Prisma.sql`SELECT ${firstPid}::int = ANY(pg_blocking_pids(${secondPid}::int)) AS blocked`);
      if (row.blocked) { blocked = true; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(blocked, true, "Own second connection must actually block before first commit");
  } finally {
    release();
    // Drain both transactions before cleanup, including a failed blocking assertion.
    await Promise.all([firstObserved, ...(secondObserved ? [secondObserved] : [])]);
  }
  const results = await Promise.all([firstObserved, secondObserved!]);
  for (const value of results) if ("error" in value) throw value.error;
  return results.map(value => (value as { value: T }).value);
}
