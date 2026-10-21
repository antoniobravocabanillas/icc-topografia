import type { WorklogWithContext } from "@/lib/terraqo/worklog";
import type { EvidenceReadScope } from "@/lib/terraqo/evidence-policy";

type EvidenceValidationProjectionSource = {
  id: string;
  status: string;
  requestNote: string | null;
  responseNote: string | null;
  requestedAt: Date;
  resolvedAt: Date | null;
  validator: { name: string | null; image: string | null } | null;
};

export function projectEvidenceValidations(
  validations: EvidenceValidationProjectionSource[],
  audience: EvidenceReadScope["audience"],
) {
  if (audience === "PUBLIC") {
    return validations
      .filter((validation) => validation.status === "APPROVED")
      .map((validation) => ({
        id: validation.id,
        responseNote: validation.responseNote,
        resolvedAt: validation.resolvedAt?.toISOString() || null,
        createdAt: validation.requestedAt.toISOString(),
        validatorName: validation.validator?.name || null,
        validatorImage: validation.validator?.image || null,
      }));
  }

  return validations.map((validation) => ({
    id: validation.id,
    status: validation.status,
    requestNote: validation.requestNote,
    responseNote: validation.responseNote,
    requestedAt: validation.requestedAt.toISOString(),
    resolvedAt: validation.resolvedAt?.toISOString() || null,
    validator: validation.validator,
  }));
}

export function evidenceListDto(
  worklog: WorklogWithContext,
  scope: EvidenceReadScope,
) {
  return {
    id: worklog.id,
    title: worklog.title,
    summary: worklog.summary,
    outcome: worklog.outcome,
    type: worklog.type,
    evidenceStatus: worklog.evidenceStatus,
    visibility: worklog.visibility,
    occurredAt: worklog.occurredAt.toISOString(),
    createdAt: worklog.createdAt.toISOString(),
    locationLabel: worklog.locationLabel,
    skills: worklog.skills,
    project: worklog.project,
    workspace: worklog.workspace,
    evidenceCount: worklog.media.length + worklog.evidenceUrls.length,
    evidenceUrls: worklog.evidenceUrls,
    media: worklog.media.map((media) => ({
      id: media.id,
      fileName: media.fileName,
      contentType: media.contentType,
    })),
    validations: worklog.validations
      .filter((validation) => validation.status === "APPROVED")
      .map((validation) => ({
        id: validation.id,
        responseNote: validation.responseNote,
        resolvedAt: validation.resolvedAt?.toISOString() || null,
        createdAt: validation.requestedAt.toISOString(),
        validatorName: validation.validator?.name || null,
        validatorImage: validation.validator?.image || null,
      })),
    engagement: {
      comments: worklog._count.comments,
      reactions: worklog._count.reactions,
    },
    capabilities: {
      view: scope.capabilities.view,
      edit: scope.capabilities.edit,
      viewPreciseLocation: scope.capabilities.viewPreciseLocation,
    },
  };
}

export function evidenceDetailDto(
  worklog: WorklogWithContext,
  scope: EvidenceReadScope,
) {
  return {
    ...evidenceListDto(worklog, scope),
    evidenceUrls: worklog.evidenceUrls,
    location: {
      label: worklog.locationLabel,
      ...(scope.capabilities.viewPreciseLocation
        ? {
            latitude: worklog.latitude,
            longitude: worklog.longitude,
            accuracyMeters: worklog.locationAccuracyMeters,
            capturedAt: worklog.locationCapturedAt?.toISOString() || null,
          }
        : {}),
    },
    media: worklog.media.map((media) => ({
      id: media.id,
      fileName: media.fileName,
      contentType: media.contentType,
      size: media.size,
      createdAt: media.createdAt.toISOString(),
    })),
    validations: projectEvidenceValidations(worklog.validations, scope.audience),
    ...(scope.audience === "PUBLIC"
      ? {}
      : {
          continuity: {
            previous: worklog.previousWorklog,
            next: worklog.nextWorklog,
          },
        }),
  };
}
