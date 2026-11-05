import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import {
  buildPublicationSnapshot,
  publicationSnapshotSchema,
  type PublicationSource,
  type PublicationSnapshot,
  type WorkCaseTarget,
} from "./publication-review-policy";

type Disclosure = Pick<
  PublicationSnapshot,
  "collectionId" | "collectionVersion" | "title" | "description" | "items"
>;

// Normalize the same selected fields/media in publication order across workspaces.
// Each company still reviews only its own fields, bound to this exact destination.
export function caseDisclosure(source: PublicationSource): Disclosure {
  const snapshot = buildPublicationSnapshot(
    {
      ...source,
      items: source.items.map((item) => ({
        ...item,
        revision: {
          ...item.revision,
          worklog: { ...item.revision.worklog, workspaceId: "case-disclosure" },
        },
      })),
    },
    "case-disclosure",
  );
  return snapshot;
}

// Called only for an explicit proposal or a snapshot carrying that proposal.
// No private label, phase, unselected record, or case identifier leaves this boundary.
export async function workCaseScope(
  tx: Prisma.TransactionClient,
  disclosure: Disclosure,
  target?: WorkCaseTarget,
) {
  if (process.env.TERRAQO_WORK_CASES_V1 !== "true") return null;
  const ids = [...new Set(disclosure.items.map((item) => item.worklogId))];
  if (ids.length < 2) return null;
  const owner = {
    shareCollections: {
      some: { id: disclosure.collectionId, archivedAt: null },
    },
  };
  const links = await tx.terraqoWorkCaseRecord.findMany({
    where: {
      worklogId: { in: ids },
      relationshipStatus: "CONFIRMED",
      worklog: {
        deletedAt: null,
        lifecycle: "PUBLISHED",
        professionalProfile: owner,
      },
      workCase: {
        lifecycle: "ACTIVE",
        archivedAt: null,
        professionalProfile: owner,
        ...(target ? { id: target.id, version: target.version } : {}),
      },
    },
    orderBy: { worklogId: "asc" },
    select: {
      id: true,
      worklogId: true,
      worklog: { select: { workspaceId: true, projectId: true } },
      workCase: {
        select: { id: true, version: true, workspaceId: true, projectId: true },
      },
    },
  });
  if (
    links.length !== ids.length ||
    new Set(links.map((link) => link.workCase.id)).size !== 1
  )
    return null;
  const group = links[0].workCase;
  if (
    links.some(
      (link) =>
        link.worklog.workspaceId !== group.workspaceId ||
        (group.projectId && group.projectId !== link.worklog.projectId),
    )
  )
    return null;
  return createHash("sha256")
    .update(
      JSON.stringify({
        destination: "PUBLIC_CV_WORK_CASE",
        group: [group.id, group.version, group.workspaceId, group.projectId],
        membership: links.map((link) => [link.id, link.worklogId]),
        collectionId: disclosure.collectionId,
        version: disclosure.collectionVersion,
        title: disclosure.title,
        description: disclosure.description,
        items: publicationSnapshotSchema.shape.items.parse(disclosure.items),
      }),
    )
    .digest("hex");
}
