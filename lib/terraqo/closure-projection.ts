import type { Prisma } from "@prisma/client";
import { closureReferenceInclude, readAuthorizedClosureReference, loadAuthorizedClosureReferences, type AuthorizedClosureReference } from "./closure-reference-access";

const revisionInclude = {
  acceptedProposal: { select: { id: true, revisionNo: true, roleTitle: true, scope: true } },
  references: {
    include: closureReferenceInclude,
  },
} satisfies Prisma.TerraqoClosureRevisionInclude;

export const closureProjectionInclude = {
  currentRevision: { include: revisionInclude },
  revisions: {
    orderBy: { revisionNo: "desc" as const },
    include: revisionInclude,
  },
  certificate: true,
} satisfies Prisma.TerraqoCollaborationClosureInclude;

export type ClosureProjectionSource = Prisma.TerraqoCollaborationClosureGetPayload<{
  include: typeof closureProjectionInclude;
}>;
export type ClosureAudience = "workspace" | "professional";

function projectRevision(
  revision: NonNullable<ClosureProjectionSource["currentRevision"]>,
  professionalUserId: string,
  authorized?: Map<string, AuthorizedClosureReference>,
) {
  const references = revision.references.flatMap((reference) => {
    const dto = readAuthorizedClosureReference(reference, professionalUserId, authorized);
    return dto ? [dto] : [];
  });
  return {
    id: revision.id,
    revisionNo: revision.revisionNo,
    acceptedScope: revision.acceptedProposal ?? null,
    contribution: revision.contribution,
    deliverables: [...revision.deliverables],
    result: revision.result,
    authorizedExcerpt: revision.authorizedExcerpt,
    status: revision.status,
    decisionComment: revision.decisionComment,
    createdAt: revision.createdAt,
    submittedAt: revision.submittedAt,
    decidedAt: revision.decidedAt,
    // A saved accessSnapshot is evidence of past access, never a current grant.
    // Use the same public/current/owner policy as closure submission and acceptance.
    references,
    unavailableReferenceCount: revision.references.length - references.length,
  };
}

/** Read-only DTO boundary; never change stored revision state to hide a draft. */
export function projectClosure(
  closure: ClosureProjectionSource | null,
  audience: ClosureAudience,
  professionalUserId: string,
  authorized?: Map<string, AuthorizedClosureReference>,
) {
  if (!closure) return null;
  // SUPERSEDED alone is ambiguous: saving another draft supersedes unsent drafts too.
  const revisions = closure.revisions
    .filter((revision) => audience === "workspace" || (
      revision.submittedAt !== null && revision.status !== "DRAFT"
    ))
    .sort((left, right) => right.revisionNo - left.revisionNo);
  const current = audience === "workspace" ? closure.currentRevision : revisions[0];
  if (audience === "professional" && !current) return null;

  return {
    id: closure.id,
    collaborationId: closure.collaborationId,
    // Do not expose the pointer, counter or update time of an unsent draft.
    version: audience === "workspace" ? closure.version : current!.revisionNo,
    currentRevisionId: current?.id ?? null,
    currentRevision: current ? projectRevision(current, professionalUserId, authorized) : null,
    revisions: revisions.map((revision) => projectRevision(revision, professionalUserId, authorized)),
    certificate: audience === "workspace" || revisions.some(
      (revision) => revision.id === closure.certificate?.closureRevisionId,
    ) ? closure.certificate : null,
    createdAt: audience === "workspace" ? closure.createdAt : revisions.at(-1)!.submittedAt,
    updatedAt: audience === "workspace" ? closure.updatedAt : current!.decidedAt ?? current!.submittedAt,
  };
}

/** All production read and replay paths resolve current publication permission before DTO projection. */
export async function projectAuthorizedClosure(tx: Prisma.TransactionClient, closure: ClosureProjectionSource | null,
  audience: ClosureAudience, professionalUserId: string) {
  if (!closure) return null;
  const visible = [...closure.revisions, ...(closure.currentRevision ? [closure.currentRevision] : [])]
    .filter(revision => audience === "workspace" || (revision.submittedAt !== null && revision.status !== "DRAFT"));
  const references = [...new Map(visible.flatMap(revision => revision.references).map(reference => [reference.id, reference])).values()];
  const authorized = await loadAuthorizedClosureReferences(tx, references, professionalUserId, false,
    { collaborationId: closure.collaborationId, view: audience });
  return projectClosure(closure, audience, professionalUserId, authorized);
}
