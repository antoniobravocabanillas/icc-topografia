import { z } from "zod";
import type { WorklogDraftFields } from "./worklog-local-draft";

// Drafts may be incomplete. Keep publication, files and device coordinates outside this contract.
export const draftFields = z.strictObject({
  workspaceId: z.string().max(180),
  projectId: z.string().max(180),
  previousWorklogId: z.string().max(180),
  title: z.string().max(180),
  summary: z.string().max(2400),
  outcome: z.string().max(800),
  contributionRole: z.string().max(180),
  responsibilities: z.string().max(1200),
  methods: z.string().max(800),
  tools: z.string().max(800),
  type: z.enum(["FIELD_UPDATE", "DELIVERABLE", "PROBLEM_SOLVED", "LEARNING", "MILESTONE"]),
  visibility: z.enum(["PRIVATE", "WORKSPACE", "COMMUNITY", "PUBLIC"]),
  skills: z.string().max(2400),
  evidenceUrls: z.string().max(12000),
  locationLabel: z.string().max(180),
  includeAutomaticLocation: z.boolean(),
  workDate: z
    .string()
    .regex(/^(?:\d{4}-\d{2}-\d{2})?$/)
    .optional(),
});
const revision = z.string().regex(/^[a-f0-9]{64}$/);
export const draftCommand = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("discard"), base: revision }),
  z.strictObject({ action: z.literal("save"), base: revision.nullable(), fields: draftFields }),
  z.strictObject({ action: z.literal("keep-local"), base: revision, fields: draftFields }),
  z.strictObject({
    action: z.literal("open"),
    base: revision,
    fields: draftFields,
    index: z.number().int().min(0).max(8),
  }),
  z.strictObject({ action: z.literal("remove-copy"), base: revision, index: z.number().int().min(1).max(8) }),
]);

export interface AccountDraft {
  revision: string;
  fields: WorklogDraftFields;
  copies: WorklogDraftFields[];
}
export function sameDraft(a: WorklogDraftFields, b: WorklogDraftFields) {
  return (Object.keys(draftFields.shape) as (keyof WorklogDraftFields)[]).every(
    (key) => (a[key] ?? "") === (b[key] ?? ""),
  );
}
