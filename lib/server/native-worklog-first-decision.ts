import "server-only";
import { Prisma } from "@prisma/client";
import { NativeWorklogOperationError } from "./native-worklog-http";

type Choice = Readonly<{ disposition: "RESERVED" | "EXISTING" | "INELIGIBLE";
  contributionId: string | null; priorReceipts: number; priorEntries: number }>;
const choices = new WeakMap<object, { tx: Prisma.TransactionClient; actorId: string; profileId: string; operationId: string; createdAt: number }>();
function fail(): never { throw new NativeWorklogOperationError(503); }

/** Run before inserting the new entry/receipt, inside the creation transaction.
 * Owner lock and counts belong to the server; no request can supply this choice.
 * Existing allocation is preserved regardless of its review/payment state.
 */
export async function chooseNativeFirstWorklogInTransaction(tx: Prisma.TransactionClient,
  actorId: string, operationId: string, createdAt: Date): Promise<Choice> {
  if (!/^[a-f0-9]{64}$/.test(operationId) || !Number.isFinite(createdAt.getTime())) fail();
  const [owner] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile"
    WHERE "userId"=${actorId} FOR UPDATE`);
  if (!owner) fail();
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderContribution"
    WHERE "sourceKey"=${`first-worklog:${actorId}`} FOR UPDATE`);
  const existing = await tx.terraqoBuilderContribution.findUnique({ where: { sourceKey: `first-worklog:${actorId}` } });
  const priorReceipts = await tx.terraqoNativeWorklogOperation.count({ where: { actorId } });
  const priorEntries = await tx.terraqoWorklogEntry.count({ where: { authorId: actorId } });
  if (![priorReceipts, priorEntries].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 2147483647)) fail();
  let choice: Choice;
  if (existing) {
    if (existing.userId !== actorId || existing.type !== "FIRST_WORKLOG" || existing.requestedPoints !== 25) fail();
    choice = { disposition: "EXISTING", contributionId: existing.id, priorReceipts, priorEntries };
  } else if (priorReceipts || priorEntries) {
    choice = { disposition: "INELIGIBLE", contributionId: null, priorReceipts, priorEntries };
  } else {
    const reserved = await tx.terraqoBuilderContribution.create({ data: { userId: actorId, type: "FIRST_WORKLOG",
      sourceKey: `first-worklog:${actorId}`, title: "Primera bitácora útil", detail: `native-first-worklog-v1:${operationId}`,
      status: "IN_REVIEW", requestedPoints: 25, approvedPoints: 0, createdAt } });
    choice = { disposition: "RESERVED", contributionId: reserved.id, priorReceipts: 0, priorEntries: 0 };
  }
  Object.freeze(choice); choices.set(choice, { tx, actorId, profileId: owner.id, operationId, createdAt: createdAt.getTime() }); return choice;
}

/** Receipt insertion must precede this write in the SAME creation transaction.
 * Composite FKs retain the exact receipt/owner and allocation even after entry deletion.
 */
export async function saveNativeFirstWorklogDecision(tx: Prisma.TransactionClient, operationId: string, choice: Choice) {
  const binding = choices.get(choice);
  if (!binding || binding.tx !== tx || binding.operationId !== operationId || !Object.isFrozen(choice)) fail();
  const receipt = await tx.terraqoNativeWorklogOperation.findUnique({ where: { id: operationId } });
  if (!receipt || receipt.actorId !== binding.actorId || receipt.professionalProfileId !== binding.profileId ||
      receipt.createdAt.getTime() !== binding.createdAt) fail();
  await tx.$executeRaw(Prisma.sql`INSERT INTO icc."TerraqoNativeWorklogFirstDecision"
    ("operationId","actorId","workspaceId","professionalProfileId","createdAt",fingerprint,"policyVersion",
     disposition,"contributionId","priorReceipts","priorEntries")
    VALUES (${receipt.id},${receipt.actorId},${receipt.workspaceId},${receipt.professionalProfileId},${receipt.createdAt},${receipt.fingerprint},
      'native-first-decision-v1',${choice.disposition},${choice.contributionId},${choice.priorReceipts},${choice.priorEntries})`);
}

/** Internal historical reader; never decides from current absence or creates awards. */
export async function requireNativeFirstWorklogDecision(tx: Prisma.TransactionClient, operationId: string) {
  if (!/^[a-f0-9]{64}$/.test(operationId)) fail();
  const identity = await tx.terraqoNativeWorklogOperation.findUnique({ where: { id: operationId } });
  if (!identity) fail();
  const [owner] = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM icc."TerraqoProfessionalProfile"
    WHERE id=${identity.professionalProfileId} AND "userId"=${identity.actorId} FOR UPDATE`);
  if (!owner) fail();
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoNativeWorklogOperation" WHERE id=${operationId} FOR SHARE`);
  const receipt = await tx.terraqoNativeWorklogOperation.findUnique({ where: { id: operationId } });
  if (!receipt || receipt.actorId !== identity.actorId || receipt.professionalProfileId !== identity.professionalProfileId ||
      receipt.workspaceId !== identity.workspaceId || receipt.createdAt.getTime() !== identity.createdAt.getTime() ||
      receipt.fingerprint !== identity.fingerprint) fail();
  const [saved] = await tx.$queryRaw<Array<Choice & { actorId: string; workspaceId: string;
    professionalProfileId: string; createdAt: Date; fingerprint: string; policyVersion: string }>>(Prisma.sql`
    SELECT * FROM icc."TerraqoNativeWorklogFirstDecision" WHERE "operationId"=${operationId} FOR SHARE`);
  if (!saved || saved.actorId !== receipt.actorId || saved.workspaceId !== receipt.workspaceId ||
      saved.professionalProfileId !== receipt.professionalProfileId || saved.createdAt.getTime() !== receipt.createdAt.getTime() ||
      saved.fingerprint !== receipt.fingerprint || saved.policyVersion !== "native-first-decision-v1" ||
      !["RESERVED", "EXISTING", "INELIGIBLE"].includes(saved.disposition) ||
      ![saved.priorReceipts, saved.priorEntries].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 2147483647)) fail();
  await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."TerraqoBuilderContribution"
    WHERE "sourceKey"=${`first-worklog:${receipt.actorId}`} FOR SHARE`);
  const contribution = await tx.terraqoBuilderContribution.findUnique({ where: { sourceKey: `first-worklog:${receipt.actorId}` } });
  if (saved.disposition === "INELIGIBLE") {
    if (saved.contributionId !== null || !(saved.priorReceipts || saved.priorEntries) || contribution) fail();
  } else {
    if (!contribution || contribution.id !== saved.contributionId || contribution.userId !== receipt.actorId ||
        contribution.type !== "FIRST_WORKLOG" || contribution.requestedPoints !== 25) fail();
    if (saved.disposition === "RESERVED" && (saved.priorReceipts || saved.priorEntries ||
        contribution.createdAt.getTime() !== saved.createdAt.getTime() ||
        contribution.detail !== `native-first-worklog-v1:${operationId}`)) fail();
  }
  return Object.freeze({ disposition: saved.disposition, creditAuthorized: false as const });
}
