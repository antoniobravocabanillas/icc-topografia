import "server-only";

type OperationalEvent =
  | "analysis_queued"
  | "analysis_completed"
  | "analysis_failed"
  | "analysis_cancelled"
  | "analysis_source_revoked";

type OperationalProperties = {
  jobId: string;
  workspaceId: string;
  dossierId: string;
  status?: string;
  provider?: string | null;
  attemptCount?: number;
  latencyMs?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  failureCode?: string | null;
};

/**
 * Structured operational events only. Never pass document text, messages,
 * names, email addresses, locations or model output through this boundary.
 */
export function emitTerraqoOperationalEvent(event: OperationalEvent, properties: OperationalProperties) {
  console.info("Terraqo operational event", {
    event,
    occurredAt: new Date().toISOString(),
    ...properties,
  });
}
