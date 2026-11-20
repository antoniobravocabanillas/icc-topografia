import type { Prisma } from "@prisma/client";

const revisionInclude = {
  references: {
    include: {
      worklogRevision: {
        select: {
          id: true,
          title: true,
          contentHash: true,
          currentFor: {
            select: {
              visibility: true,
              lifecycle: true,
              deletedAt: true,
              professionalProfile: { select: { userId: true } },
            },
          },
        },
      },
    },
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
) {
  return {
    id: revision.id,
    revisionNo: revision.revisionNo,
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
    references: revision.references.flatMap((reference) => {
      const source = reference.worklogRevision;
      const current = source.currentFor;
      if (
        !current || current.visibility !== "PUBLIC" ||
        current.lifecycle !== "PUBLISHED" || current.deletedAt !== null ||
        current.professionalProfile.userId !== professionalUserId
      ) return [];
      return [{
        id: reference.id,
        closureRevisionId: reference.closureRevisionId,
        worklogRevisionId: reference.worklogRevisionId,
        createdAt: reference.createdAt,
        worklogRevision: { id: source.id, title: source.title, contentHash: source.contentHash },
      }];
    }),
  };
}

/** Read-only DTO boundary; never change stored revision state to hide a draft. */
export function projectClosure(
  closure: ClosureProjectionSource | null,
  audience: ClosureAudience,
  professionalUserId: string,
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
    currentRevision: current ? projectRevision(current, professionalUserId) : null,
    revisions: revisions.map((revision) => projectRevision(revision, professionalUserId)),
    certificate: audience === "workspace" || revisions.some(
      (revision) => revision.id === closure.certificate?.closureRevisionId,
    ) ? closure.certificate : null,
    createdAt: audience === "workspace" ? closure.createdAt : revisions.at(-1)!.submittedAt,
    updatedAt: audience === "workspace" ? closure.updatedAt : current!.decidedAt ?? current!.submittedAt,
  };
}
