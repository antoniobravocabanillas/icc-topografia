import { createHash } from "node:crypto";
import type { TerraqoCollaborationCertificate } from "@prisma/client";
import { z } from "zod";

export const certificateDisclosureFields = ["workspaceName", "professionalName", "roleTitle", "scope",
  "contribution", "deliverables", "result", "authorizedExcerpt", "issuedAt"] as const;
export type CertificateDisclosureField = typeof certificateDisclosureFields[number];

const identity = z.string().trim().min(1).max(128);
const selection = z.array(z.enum(certificateDisclosureFields)).min(1).max(certificateDisclosureFields.length)
  .refine(fields => new Set(fields).size === fields.length, "Duplicate selected fields");
const requestSchema = z.discriminatedUnion("destination", [
  z.object({ destination: z.literal("PUBLIC"), fields: selection }).strict(),
  z.object({ destination: z.literal("INVITED"), fields: selection,
    recipientUserId: identity, expiresAt: z.string().datetime({ offset: true }) }).strict(),
]);

/** Internal proposal preparation only. This digest is NOT an authorization token.
 * The future transactional service must load the certificate and its relation from
 * the database, record both parties' consent to this exact digest, and reauthorize
 * every read. No API currently exposes or publishes this snapshot. */
export function prepareCertificateDisclosureSnapshot(
  certificate: TerraqoCollaborationCertificate,
  binding: { closureRevisionId: string; acceptedProposalId: string | null;
    proposalRevisionNo: number; closureRevisionNo: number },
  input: unknown,
  now: Date,
) {
  const request = requestSchema.parse(input);
  identity.parse(certificate.id);
  identity.parse(certificate.closureRevisionId);
  z.number().int().positive().parse(certificate.proposalRevisionNo);
  z.number().int().positive().parse(certificate.closureRevisionNo);
  if (!Number.isFinite(now.getTime()) || !Number.isFinite(certificate.issuedAt.getTime()) ||
      certificate.issuedAt > now) throw new Error("Invalid certificate clock");
  if (!binding.acceptedProposalId || binding.closureRevisionId !== certificate.closureRevisionId ||
      binding.proposalRevisionNo !== certificate.proposalRevisionNo ||
      binding.closureRevisionNo !== certificate.closureRevisionNo) throw new Error("Unbound certificate");
  identity.parse(binding.acceptedProposalId);
  const audience = request.destination === "PUBLIC" ? { destination: "PUBLIC" as const } : {
    destination: "INVITED" as const, recipientUserId: request.recipientUserId,
    expiresAt: new Date(request.expiresAt).toISOString(),
  };
  if (audience.destination === "INVITED" && new Date(audience.expiresAt) <= now)
    throw new Error("Expired disclosure proposal");

  // Fixed canonical ordering makes equivalent selections share the same digest.
  // Identity is selected explicitly; neither party's name is implicit metadata.
  const fields = certificateDisclosureFields.filter(field => request.fields.includes(field));
  const projected: Partial<Record<CertificateDisclosureField, string | readonly string[] | null>> = {};
  for (const field of fields) {
    projected[field] = field === "issuedAt" ? certificate.issuedAt.toISOString()
      : field === "deliverables" ? Object.freeze([...certificate.deliverables]) : certificate[field];
  }
  const snapshot = Object.freeze({ version: 1 as const, certificateId: certificate.id,
    closureRevisionId: certificate.closureRevisionId, acceptedProposalId: binding.acceptedProposalId,
    proposalRevisionNo: certificate.proposalRevisionNo, closureRevisionNo: certificate.closureRevisionNo,
    audience: Object.freeze(audience), fields: Object.freeze(fields), projected: Object.freeze(projected) });
  return Object.freeze({ snapshot, digest: createHash("sha256").update(JSON.stringify(snapshot)).digest("hex") });
}
