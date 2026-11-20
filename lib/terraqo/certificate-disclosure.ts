import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { TerraqoMessagingError } from "./messaging";
import { assertClosureReferenceWorkspaceActor } from "./closure-reference-access";
import { certificateDisclosureFields, prepareCertificateDisclosureSnapshot } from "./certificate-disclosure-snapshot";
import { isValidWorklogOperationKey } from "./worklog-create-operation";
import { workspaceAdminMemberRoles } from "./workspace-roles";

const fields = z.array(z.enum(certificateDisclosureFields)).min(1).max(9).refine(v => new Set(v).size === v.length);
export const disclosureCreateSchema = z.discriminatedUnion("destination", [
  z.object({ destination: z.literal("PUBLIC"), fields }).strict(),
  z.object({ destination: z.literal("INVITED"), fields, recipientEmail: z.string().trim().email().max(254),
    expiresAt: z.string().datetime({ offset: true }) }).strict(),
]);
export const disclosureDecisionSchema = z.object({ action: z.enum(["APPROVE", "REVOKE"]),
  expectedDigest: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
type Actor = { userId: string; collaborationId: string; view: "workspace" | "professional"; workspaceId?: string };
const include = { events: { orderBy: [{ createdAt: "asc" as const }, { id: "asc" as const }] } };
type Disclosure = Prisma.TerraqoCertificateDisclosureGetPayload<{ include: typeof include }>;
const unavailable = () => new TerraqoMessagingError("Constancia no disponible.", 404);
const conflict = () => new TerraqoMessagingError("La autorización cambió. Actualiza antes de continuar.", 409);
const hash = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex");
export const certificateDisclosureEnabled = () => process.env.TERRAQO_CERTIFICATE_DISCLOSURE_V1 === "true" &&
  process.env.TERRAQO_COLLABORATION_V1 === "true" && process.env.TERRAQO_CLOSURE_V1 === "true";

async function transaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  if (!certificateDisclosureEnabled()) throw unavailable();
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: "Serializable", maxWait: 10000, timeout: 20000 }); }
    catch (error) {
      if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) continue;
      throw error;
    }
  }
}
async function clock(tx: Prisma.TransactionClient) {
  const [row] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return row.now;
}
async function source(tx: Prisma.TransactionClient, collaborationId: string) {
  const c = await tx.terraqoCollaboration.findUnique({ where: { id: collaborationId }, include: {
    workspace: true, professional: { select: { id: true, emailVerified: true } },
    closure: { include: { certificate: { include: { closureRevision: { include: {
      acceptedProposal: { include: { acceptances: true } },
    } } } } } },
  } });
  const pilot = (process.env.TERRAQO_B5_PILOT_WORKSPACE_IDS || "").split(",").map(v => v.trim());
  if (!c || !c.workspace.active || c.workspace.deletedAt || !c.professional.emailVerified ||
      !(pilot.includes("*") || pilot.includes(c.workspaceId)) ||
      !await tx.terraqoWorkspaceModule.findFirst({ where: { workspaceId: c.workspaceId, code: "PROFESSIONAL_MESSAGING", active: true } })) throw unavailable();
  return c;
}
type Source = Awaited<ReturnType<typeof source>>;
async function actor(tx: Prisma.TransactionClient, input: Actor, c: Source) {
  const user = await tx.user.findUnique({ where: { id: input.userId }, select: { emailVerified: true } });
  if (!user?.emailVerified) throw unavailable();
  if (input.view === "workspace") {
    if (input.workspaceId !== c.workspaceId || input.userId === c.professionalUserId) throw unavailable();
    await assertClosureReferenceWorkspaceActor(tx, input);
    return "WORKSPACE";
  }
  if (input.workspaceId || input.userId !== c.professionalUserId) throw unavailable();
  return "PROFESSIONAL";
}
function binding(c: Source) {
  const cert = c.closure?.certificate, revision = cert?.closureRevision, proposal = revision?.acceptedProposal;
  if (c.status !== "CLOSED" || !cert || !cert.privateByDefault || revision?.status !== "ACCEPTED" || !proposal ||
      proposal.status !== "ACCEPTED" || proposal.collaborationId !== c.id ||
      !proposal.acceptances.some(a => a.party === "WORKSPACE" && a.actorId === proposal.createdById) ||
      !proposal.acceptances.some(a => a.party === "PROFESSIONAL" && a.actorId === c.professionalUserId)) throw unavailable();
  return { cert, binding: { closureRevisionId: revision.id, acceptedProposalId: proposal.id,
    proposalRevisionNo: proposal.revisionNo, closureRevisionNo: revision.revisionNo } };
}
function prepared(c: Source, row: Disclosure) {
  const { cert, binding: bound } = binding(c);
  if (row.certificateId !== cert.id) throw unavailable();
  const stored = row.snapshot as { fields?: unknown };
  // Use creation time solely to reconstruct the immutable proposal, then check
  // expiry against the database clock separately on EVERY decision/read.
  const result = prepareCertificateDisclosureSnapshot(cert, bound, row.destination === "PUBLIC"
    ? { destination: "PUBLIC", fields: stored.fields }
    : { destination: "INVITED", fields: stored.fields, recipientUserId: row.recipientUserId, expiresAt: row.expiresAt?.toISOString() }, row.createdAt);
  if (result.digest !== row.digest || !isDeepStrictEqual(result.snapshot, row.snapshot)) throw unavailable();
  if (row.events.some(event => event.digest !== row.digest)) throw unavailable();
  return result.snapshot;
}
async function approvalAuthority(tx: Prisma.TransactionClient, c: Source, rows: Disclosure[]) {
  const ids = [...new Set(rows.flatMap(row => row.events.filter(e => e.action === "APPROVE").map(e => e.actorId)))];
  if (!ids.length) return new Map<string, { professional: boolean; workspace: boolean }>();
  const [users, members] = await Promise.all([
    tx.user.findMany({ where: { id: { in: ids }, emailVerified: { not: null } }, select: { id: true, role: true } }),
    tx.terraqoWorkspaceMember.findMany({ where: { userId: { in: ids }, workspaceId: c.workspaceId, active: true, role: { in: workspaceAdminMemberRoles } }, select: { userId: true } }),
  ]);
  const admins = new Set(members.map(member => member.userId));
  return new Map(users.map(user => [user.id, { professional: user.id === c.professionalUserId,
    workspace: user.id !== c.professionalUserId && (user.role === "SUPER_ADMIN" || admins.has(user.id)) }]));
}
type Authority = Awaited<ReturnType<typeof approvalAuthority>>;
async function effective(tx: Prisma.TransactionClient, c: Source, row: Disclosure, now: Date, authority?: Authority) {
  const actors = authority ?? await approvalAuthority(tx, c, [row]);
  const revoked = row.events.some(e => e.action === "REVOKE");
  let workspaceApproved = false, professionalApproved = false;
  for (const e of row.events.filter(e => e.action === "APPROVE")) {
    if (e.party === "PROFESSIONAL" && actors.get(e.actorId)?.professional) professionalApproved = true;
    if (e.party === "WORKSPACE" && actors.get(e.actorId)?.workspace) workspaceApproved = true;
  }
  const status = revoked ? "REVOKED" : row.expiresAt && row.expiresAt <= now ? "EXPIRED"
    : workspaceApproved && professionalApproved ? "ACTIVE" : "PENDING";
  return { status, workspaceApproved, professionalApproved } as const;
}
async function dto(tx: Prisma.TransactionClient, c: Source, row: Disclosure, party: string, now: Date, authority?: Authority) {
  const snapshot = prepared(c, row), state = await effective(tx, c, row, now, authority);
  return { id: row.id, digest: row.digest, destination: row.destination, recipientEmail: row.recipientEmail,
    expiresAt: row.expiresAt?.toISOString() ?? null, fields: snapshot.fields, projected: snapshot.projected,
    ...state, canApprove: state.status === "PENDING" && !(party === "WORKSPACE" ? state.workspaceApproved : state.professionalApproved),
    canRevoke: state.status !== "REVOKED", createdAt: row.createdAt.toISOString() };
}
function key(input: { operationKey: string }) {
  if (!isValidWorklogOperationKey(input.operationKey)) throw new TerraqoMessagingError("Clave de reintento inválida.", 400);
}
export async function listCertificateDisclosures(input: Actor) {
  return transaction(async tx => {
    const c = await source(tx, input.collaborationId), party = await actor(tx, input, c);
    const cert = c.closure?.certificate;
    if (!cert?.closureRevision.acceptedProposalId) return { certificateId: null, items: [] };
    binding(c);
    const rows = await tx.terraqoCertificateDisclosure.findMany({ where: { certificateId: cert.id }, include, orderBy: { createdAt: "desc" }, take: 50 });
    const now = await clock(tx);
    const authority = await approvalAuthority(tx, c, rows);
    return { certificateId: cert.id, items: await Promise.all(rows.map(row => dto(tx, c, row, party, now, authority))) };
  });
}
export async function createCertificateDisclosure(input: Actor & { operationKey: string; payload: unknown }) {
  key(input);
  const parsed = disclosureCreateSchema.parse(input.payload);
  const request = { ...parsed, fields: [...parsed.fields].sort(), ...(parsed.destination === "INVITED"
    ? { recipientEmail: parsed.recipientEmail.toLowerCase(), expiresAt: new Date(parsed.expiresAt).toISOString() } : {}) };
  const fingerprint = hash({ collaborationId: input.collaborationId, view: input.view, action: "CREATE", request });
  return transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM icc."TerraqoCollaboration" WHERE id=${input.collaborationId} FOR UPDATE`;
    const c = await source(tx, input.collaborationId), party = await actor(tx, input, c), now = await clock(tx);
    const { cert, binding: bound } = binding(c);
    const replay = await tx.terraqoCertificateDisclosureEvent.findUnique({ where: { actorId_operationKey: { actorId: input.userId, operationKey: input.operationKey } }, include: { disclosure: { include } } });
    if (replay) {
      if (replay.fingerprint !== fingerprint || replay.disclosure.certificateId !== cert.id) throw conflict();
      return dto(tx, c, replay.disclosure, party, now);
    }
    if (parsed.destination === "INVITED" && new Date(parsed.expiresAt) <= now)
      throw new TerraqoMessagingError("El vencimiento debe ser posterior al momento actual.", 422);
    if (await tx.terraqoCertificateDisclosure.count({ where: { certificateId: cert.id } }) >= 50)
      throw new TerraqoMessagingError("Se alcanzó el máximo de versiones compartidas para esta constancia.", 409);
    const recipients = parsed.destination === "INVITED" ? await tx.user.findMany({ where: {
      email: { equals: parsed.recipientEmail.toLowerCase(), mode: "insensitive" }, emailVerified: { not: null },
    }, select: { id: true, email: true }, take: 2 }) : [];
    const recipient = recipients.length === 1 ? recipients[0] : null;
    if (parsed.destination === "INVITED" && !recipient) throw new TerraqoMessagingError("El destinatario debe tener una cuenta con correo verificado.", 422);
    const result = prepareCertificateDisclosureSnapshot(cert, bound, parsed.destination === "PUBLIC" ? parsed : {
      destination: "INVITED", fields: parsed.fields, recipientUserId: recipient!.id, expiresAt: parsed.expiresAt,
    }, now);
    const row = await tx.terraqoCertificateDisclosure.create({ data: {
      certificateId: cert.id, createdById: input.userId, destination: parsed.destination,
      recipientUserId: recipient?.id, recipientEmail: recipient?.email,
      expiresAt: parsed.destination === "INVITED" ? new Date(parsed.expiresAt) : null,
      snapshot: result.snapshot as unknown as Prisma.InputJsonValue, digest: result.digest, createdAt: now,
      events: { create: { actorId: input.userId, action: "CREATE", party, digest: result.digest,
        operationKey: input.operationKey, fingerprint, createdAt: now } },
    }, include });
    return dto(tx, c, row, party, now);
  });
}
export async function decideCertificateDisclosure(input: Actor & { disclosureId: string; operationKey: string; payload: unknown }) {
  key(input);
  const payload = disclosureDecisionSchema.parse(input.payload);
  const fingerprint = hash({ collaborationId: input.collaborationId, disclosureId: input.disclosureId, view: input.view, payload });
  return transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM icc."TerraqoCollaboration" WHERE id=${input.collaborationId} FOR UPDATE`;
    const c = await source(tx, input.collaborationId), party = await actor(tx, input, c), now = await clock(tx);
    const row = await tx.terraqoCertificateDisclosure.findFirst({ where: { id: input.disclosureId, certificateId: c.closure?.certificate?.id ?? "" }, include });
    if (!row) throw unavailable();
    prepared(c, row);
    if (row.digest !== payload.expectedDigest) throw conflict();
    const replay = await tx.terraqoCertificateDisclosureEvent.findUnique({ where: { actorId_operationKey: { actorId: input.userId, operationKey: input.operationKey } } });
    if (replay) { if (replay.fingerprint !== fingerprint || replay.disclosureId !== row.id) throw conflict(); return dto(tx, c, row, party, now); }
    const state = await effective(tx, c, row, now);
    if (payload.action === "APPROVE" && row.events.length >= 100) throw conflict();
    if (payload.action === "APPROVE" && (state.status === "REVOKED" || state.status === "EXPIRED")) throw conflict();
    if (payload.action === "APPROVE" && (party === "WORKSPACE" ? state.workspaceApproved : state.professionalApproved)) throw conflict();
    if (payload.action === "REVOKE" && state.status === "REVOKED") throw conflict();
    await tx.terraqoCertificateDisclosureEvent.create({ data: { disclosureId: row.id, actorId: input.userId,
      party, action: payload.action, digest: row.digest, operationKey: input.operationKey, fingerprint, createdAt: now } });
    return dto(tx, c, await tx.terraqoCertificateDisclosure.findUniqueOrThrow({ where: { id: row.id }, include }), party, now);
  });
}
export async function readCertificateDisclosure(input: { disclosureId: string; userId?: string }) {
  if (!certificateDisclosureEnabled()) return null;
  try {
    return await transaction(async tx => {
      const row = await tx.terraqoCertificateDisclosure.findUnique({ where: { id: input.disclosureId }, include: { ...include, certificate: { select: { closure: { select: { collaborationId: true } } } } } });
      if (!row) return null;
      const c = await source(tx, row.certificate.closure.collaborationId), snapshot = prepared(c, row);
      if ((await effective(tx, c, row, await clock(tx))).status !== "ACTIVE") return null;
      if (row.destination === "INVITED") {
        if (!input.userId || input.userId !== row.recipientUserId) return null;
        const recipient = await tx.user.findUnique({ where: { id: input.userId }, select: { emailVerified: true, email: true } });
        if (!recipient?.emailVerified || recipient.email.toLowerCase() !== row.recipientEmail?.toLowerCase()) return null;
      }
      return { fields: snapshot.projected };
    });
  } catch (error) { if (error instanceof TerraqoMessagingError) return null; throw error; }
}
