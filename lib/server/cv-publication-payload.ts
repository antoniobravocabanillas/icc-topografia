import { createHash } from "node:crypto";
import { z } from "zod";

const common = {
  version: z.string().datetime({ precision: 3, offset: false }),
  operationKey: z.string().regex(/^[a-f0-9]{32}$/),
};
const schema = z.discriminatedUnion("action", [
  z.object({ ...common, action: z.literal("PUBLISH"), consent: z.literal(true) }).strict(),
  z.object({ ...common, action: z.literal("WITHDRAW") }).strict(),
]);
export type CvPublicationPayload = z.infer<typeof schema>;
export const parseCvPublicationPayload = (input: unknown): CvPublicationPayload => schema.parse(input);

// Publication is a global personal-profile operation. Workspace authorization
// is checked separately on every request, including replay and reconciliation.
export function cvPublicationOperationId(userId: string, profileId: string, key: string) {
  return createHash("sha256").update(JSON.stringify([userId, profileId, key, "cv-publication-v1"])).digest("hex");
}
export function cvPublicationFingerprint(payload: CvPublicationPayload) {
  return createHash("sha256").update(JSON.stringify([
    "cv-publication-v1", payload.action, payload.version, payload.action === "PUBLISH",
  ])).digest("hex");
}
