import "server-only";
import { Prisma, type TerraqoNativeWorklogOperation } from "@prisma/client";
import { NativeWorklogOperationError } from "./native-worklog-http";

type Authority = {
  operationId: string; actorId: string; workspaceId: string; professionalProfileId: string;
  createdAt: Date; fingerprint: string; policyVersion: string; grantHash: string;
  tokenIssuedAt: Date; tokenExpiresAt: Date; grantExpiresAt: Date; paidThrough: Date | null;
  role: string; modules: string[];
};
/** Historical proof only. This never authenticates a caller or renews a grant.
 * Current access must be checked independently before any owner-facing read. */
export async function requireNativeCreationAuthority(tx: Prisma.TransactionClient, receipt: TerraqoNativeWorklogOperation) {
  const [a] = await tx.$queryRaw<Authority[]>(Prisma.sql`SELECT * FROM icc."TerraqoNativeWorklogAuthority"
    WHERE "operationId"=${receipt.id} FOR SHARE`);
  const validDate = (value: Date) => value instanceof Date && Number.isFinite(value.getTime()) &&
    value.getTime() >= Date.UTC(2000, 0, 1) && value.getTime() <= Date.UTC(9998, 11, 31);
  if (!a || a.actorId !== receipt.actorId || a.workspaceId !== receipt.workspaceId ||
    a.professionalProfileId !== receipt.professionalProfileId || a.fingerprint !== receipt.fingerprint ||
    a.createdAt.getTime() !== receipt.createdAt.getTime() || a.policyVersion !== "native-creation-authority-v1" ||
    a.role !== "PROFESSIONAL" || !/^[a-f0-9]{64}$/.test(a.grantHash) ||
    a.modules.length !== 2 || a.modules[0] !== "LIVE_CV" || a.modules[1] !== "PROFESSIONAL_NETWORK" ||
    ![a.createdAt, a.tokenIssuedAt, a.tokenExpiresAt, a.grantExpiresAt].every(validDate) ||
    a.tokenIssuedAt > a.createdAt || a.tokenExpiresAt <= a.createdAt || a.grantExpiresAt <= a.createdAt ||
    (a.paidThrough !== null && (!validDate(a.paidThrough) || a.paidThrough <= a.createdAt))) {
    throw new NativeWorklogOperationError(503);
  }
  // No identity/hash/token dates enter the public DTO. Worker authorization is separate.
}
