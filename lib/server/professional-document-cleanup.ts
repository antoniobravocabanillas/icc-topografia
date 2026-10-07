import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProfessionalDocumentStore, PROFESSIONAL_DOCUMENT_PREFIX } from "./media";

type Marker = {source?: unknown; type?: unknown; storageCleanupState?: unknown; storageCleanupKey?: unknown; storageCleanupBytes?: unknown; storageCleanupAttempts?: unknown};
const marker = (value: unknown): Marker => value && typeof value === "object" && !Array.isArray(value) ? value as Marker : {};
export function cleanupRetrySchedule(attempts: unknown, now: Date) {
  const count = Number.isSafeInteger(attempts) && (attempts as number) >= 0 ? Math.min(attempts as number, 7) + 1 : 1;
  return {storageCleanupAttempts: count, storageCleanupNextAttemptAt: new Date(now.getTime() + Math.min(360, 5 * 2 ** (count - 1)) * 60_000).toISOString()};
}
async function parkBlockedCleanup(id: string) {
  const row = await prisma.activityLog.findFirst({where:{id,entityType:"ProfessionalDocument",action:"DELETED"},select:{metadata:true}});
  const current=marker(row?.metadata);
  if (current.source !== "native-portal" || current.storageCleanupState !== "PENDING" || !row?.metadata) return;
  await prisma.activityLog.updateMany({where:{id,metadata:{equals:row.metadata as Prisma.InputJsonValue}},data:{metadata:{...(row.metadata as Prisma.JsonObject),storageCleanupState:"BLOCKED"}}});
}
export async function recoverProfessionalDocumentCleanup(id: string, store?: Pick<ReturnType<typeof getProfessionalDocumentStore>, "delete">) {
  const audit = await prisma.activityLog.findFirst({where:{id,entityType:"ProfessionalDocument",action:"DELETED"},select:{id:true,actorId:true,metadata:true}});
  const pending = marker(audit?.metadata);
  if (!audit?.actorId || pending.source !== "native-portal" || pending.storageCleanupState !== "PENDING") return "skipped";
  const key = pending.storageCleanupKey, size = pending.storageCleanupBytes;
  if (typeof key !== "string" || !Number.isSafeInteger(size) || (size as number) < 1 || (size as number) > 10 * 1024 * 1024) return "blocked";
  const profile = await prisma.terraqoProfessionalProfile.findUnique({where:{userId:audit.actorId},select:{id:true}});
  // A marker cannot target arbitrary keys or a blob still referenced by a live
  // document, even if internal metadata is malformed. No user input reaches keys.
  if (!profile || !key.startsWith(`${PROFESSIONAL_DOCUMENT_PREFIX}/${profile.id}/`) || key.includes("..") || key.includes("\\") ||
      await prisma.terraqoProfessionalDocument.count({where:{storageKey:key}})) return "blocked";
  try {
    await (store || getProfessionalDocumentStore()).delete(key); // Idempotent: a missing blob is already clean.
    return await prisma.$transaction(async tx => {
      await tx.$queryRaw(Prisma.sql`SELECT id FROM icc."ActivityLog" WHERE id=${id} AND "actorId"=${audit.actorId} FOR UPDATE`);
      const row = await tx.activityLog.findUnique({where:{id},select:{metadata:true}});
      const current = marker(row?.metadata);
      if (current.storageCleanupState !== "PENDING" || current.storageCleanupKey !== key || current.storageCleanupBytes !== size) return "skipped";
      const aggregates = await Promise.all([
        tx.terraqoProfessionalDocument.aggregate({where:{professionalProfile:{userId:audit.actorId!}},_sum:{size:true}}),
        tx.terraqoWorklogMedia.aggregate({where:{worklog:{authorId:audit.actorId!}},_sum:{size:true}}),
        tx.terraqoMessageAttachment.aggregate({where:{message:{senderId:audit.actorId!}},_sum:{size:true}}),
      ]);
      const floor = Math.ceil(aggregates.reduce((sum,value)=>sum+(value._sum.size||0),0)/1_000_000);
      const units = Math.ceil((size as number)/1_000_000);
      await tx.terraqoUsageBucket.updateMany({where:{ownerKey:`user:${audit.actorId}`,period:"retained",metric:"storage-mb",used:{gte:floor+units}},data:{used:{decrement:units}}});
      // The locked audit is the completion fence; concurrent jobs refund once.
      await tx.activityLog.update({where:{id},data:{metadata:{source:"native-portal",type:typeof current.type === "string" ? current.type : "OTHER",storageCleanupState:"COMPLETE"}}});
      return "completed";
    },{maxWait:5000,timeout:10000});
  } catch {
    try {
      // Snapshot equality prevents a late failure from reopening a completed
      // marker or overwriting another worker's retry decision.
      await prisma.activityLog.updateMany({where:{id,metadata:{equals:audit.metadata as Prisma.InputJsonValue}},
        data:{metadata:{...(audit.metadata as Prisma.JsonObject),...cleanupRetrySchedule(pending.storageCleanupAttempts,new Date())}}});
    } catch { /* The existing PENDING marker remains recoverable after DB outage. */ }
    return "retry";
  }
}
export async function dueProfessionalDocumentCleanupIds(now = new Date()) {
  const rows = await prisma.$queryRaw<{id:string}[]>(Prisma.sql`
    SELECT id FROM icc."ActivityLog"
    WHERE "entityType"='ProfessionalDocument' AND action='DELETED' AND "actorId" IS NOT NULL
      AND "createdAt" <= ${new Date(now.getTime()-5*60_000)}
      AND metadata->>'source'='native-portal' AND metadata->>'storageCleanupState'='PENDING'
      AND (metadata->>'storageCleanupNextAttemptAt' IS NULL OR metadata->>'storageCleanupNextAttemptAt' <= ${now.toISOString()})
    ORDER BY "createdAt", id LIMIT 5`);
  return rows;
}
export async function recoverProfessionalDocumentCleanups(now = new Date()) {
  const rows = await dueProfessionalDocumentCleanupIds(now);
  const counts = {completed:0,retry:0,blocked:0,skipped:0};
  for (const row of rows) {
    const result = await recoverProfessionalDocumentCleanup(row.id);
    if (result === "blocked") await parkBlockedCleanup(row.id);
    counts[result as keyof typeof counts]++;
  }
  return counts;
}
