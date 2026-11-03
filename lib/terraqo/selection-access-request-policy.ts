import { z } from "zod";

export const selectionAccessRequestSchema = z.object({
  targetType: z.enum(["collection", "public-link"]),
  target: z.string().trim().min(8).max(160).regex(/^[a-zA-Z0-9_-]+$/),
  message: z.string().trim().max(500).optional(),
}).strict();
export const selectionAccessTargetSchema = selectionAccessRequestSchema.pick({ targetType: true, target: true });
export const selectionAccessDecisionSchema = z.discriminatedUnion("decision", [
  z.object({ requestId: z.string().cuid(), expectedVersion: z.number().int().positive(), decision: z.literal("DECLINED") }).strict(),
  z.object({ requestId: z.string().cuid(), expectedVersion: z.number().int().positive(), decision: z.literal("APPROVED"), confirmed: z.literal(true), expectedCollectionVersion: z.number().int().positive(), scopeChangeConfirmed: z.boolean(), expiresAt: z.string().datetime({ offset: true }), allowDownload: z.boolean() }).strict(),
]);
export const ACCESS_REQUEST_RECEIPT = { message: "Si la selección admite solicitudes, el titular podrá revisar tu petición." } as const;
export class SelectionAccessRequestError extends Error {
  constructor(message: string, public readonly status: number) { super(message); }
}
export function validateAccessExpiry(expiresAt: string, now: Date) {
  const expiry = new Date(expiresAt);
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= now.getTime() + 300_000 || expiry.getTime() > now.getTime() + 90 * 86_400_000)
    throw new SelectionAccessRequestError("Elige una vigencia mayor a cinco minutos y de hasta 90 días.", 422);
  return expiry;
}
