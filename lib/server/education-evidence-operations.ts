import "server-only";
import { timingSafeEqual } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

type Operations = {
  secret: string | undefined;
  health(): Promise<unknown>;
  recover(id: string): Promise<unknown>;
  dispatch(): Promise<unknown>;
};
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const response = (value: unknown, status = 200) => Response.json(value, { status, headers });

/** Read-only aggregate counters. No identifiers or file metadata leave the
 * operational boundary; quarantined work requires explicit investigation. */
export function educationEvidenceCleanupHealth(database: Pick<PrismaClient, "$transaction">) {
  return database.$transaction(async tx => {
    const [row] = await tx.$queryRaw<{ pending: number; overdue: number; quarantined: number; watchesDue: number; orphaned: number }[]>(Prisma.sql`
      SELECT count(*) FILTER (WHERE a.state IN ('PREPARED','RESERVED','CLEANUP_PENDING'))::int AS pending,
      count(*) FILTER (WHERE (a.state IN ('PREPARED','RESERVED') AND a."updatedAt"<=now()-interval '5 minutes')
        OR (a.state='CLEANUP_PENDING' AND (a."nextAttemptAt" IS NULL OR a."nextAttemptAt"<=now())))::int AS overdue,
      count(*) FILTER (WHERE a.state='QUARANTINED')::int AS quarantined,
      count(*) FILTER (WHERE a.state='CLEANED' AND (a."nextAttemptAt" IS NULL OR a."nextAttemptAt"<=now()))::int AS "watchesDue",
      count(*) FILTER (WHERE a.state='COMMITTED' AND NOT EXISTS
        (SELECT 1 FROM icc."TerraqoEducationEvidence" e WHERE e."storageKey"=a."storageKey"))::int AS orphaned
      FROM icc."TerraqoEducationEvidenceAttempt" a`);
    return row;
  }, { maxWait: 5000, timeout: 5000 });
}

export async function handleEducationEvidenceOperations(request: Request, operations: Operations) {
  const expected = Buffer.from(`Bearer ${operations.secret ?? ""}`), presented = Buffer.from(request.headers.get("authorization") ?? "");
  if (!operations.secret || operations.secret.length < 32 || presented.length !== expected.length || !timingSafeEqual(presented, expected))
    return response({ error: "UNAUTHORIZED" }, 401);
  if (new URL(request.url).search) return response({ error: "INVALID_REQUEST" }, 422);
  if (request.method === "GET") {
    try { return response({ backlog: await operations.health() }); }
    catch { return response({ error: "RECOVERY_UNAVAILABLE" }, 503); }
  }
  if (request.method !== "POST") return response({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json" || !request.body)
    return response({ error: "INVALID_REQUEST" }, 422);
  const reader = request.body.getReader(); let timer!: ReturnType<typeof setTimeout>, complete = false;
  let payload: Record<string, unknown>;
  try {
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error("BODY_DEADLINE")), 5000); });
    const chunks: Uint8Array[] = []; let size = 0;
    while (true) {
      const { done, value } = await Promise.race([reader.read(), deadline]);
      if (done) { complete = true; break; }
      size += value.byteLength;
      if (size > 1024) return response({ error: "BODY_TOO_LARGE" }, 413);
      chunks.push(Uint8Array.from(value));
    }
    const decoded: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) return response({ error: "INVALID_REQUEST" }, 422);
    payload = decoded as Record<string, unknown>;
  } catch { return response({ error: "INVALID_REQUEST" }, 422); }
  finally {
    clearTimeout(timer);
    if (!complete) void reader.cancel().catch(() => undefined);
    try { reader.releaseLock(); } catch { /* A stalled source may still be settling. */ }
  }
  try {
    // Global dispatch is always explicit; malformed or empty requests cannot
    // accidentally start a batch. Targeted recovery enables scoped fixtures.
    if (payload.action === "DISPATCH" && Object.keys(payload).length === 1)
      return response(await operations.dispatch());
    if (payload.action === "RECOVER" && Object.keys(payload).length === 2 &&
      typeof payload.attemptId === "string" && /^[A-Za-z0-9_-]{1,100}$/.test(payload.attemptId))
      return response({ result: await operations.recover(payload.attemptId) });
    return response({ error: "INVALID_REQUEST" }, 422);
  } catch { return response({ error: "RECOVERY_UNAVAILABLE" }, 503); }
}
