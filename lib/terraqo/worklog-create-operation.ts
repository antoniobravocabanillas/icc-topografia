import { createHash } from "node:crypto";
import type { z } from "zod";
import type { terraqoWorklogCreateSchema } from "@/lib/validations/terraqo";

type WorklogCreatePayload = z.infer<typeof terraqoWorklogCreateSchema>;

export function isValidWorklogOperationKey(value: string | null | undefined) {
  return Boolean(
    value &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  );
}

export function worklogCreateOperationFingerprint(
  payload: WorklogCreatePayload,
  workspaceId?: string,
) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        workspaceId: workspaceId || null,
        projectId: payload.projectId || null,
        previousWorklogId: payload.previousWorklogId || null,
        title: payload.title,
        summary: payload.summary,
        outcome: payload.outcome || null,
        contributionRole: payload.contributionRole || null,
        responsibilities: payload.responsibilities || [],
        methods: payload.methods || [],
        tools: payload.tools || [],
        type: payload.type,
        visibility: payload.visibility,
        skills: payload.skills,
        evidenceUrls: payload.evidenceUrls,
        locationLabel: payload.locationLabel || null,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
        locationAccuracyMeters: payload.locationAccuracyMeters ?? null,
        locationCapturedAt: payload.locationCapturedAt?.toISOString() || null,
      }),
    )
    .digest("hex");
}
