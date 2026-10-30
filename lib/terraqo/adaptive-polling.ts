export type AdaptivePollingPolicy = Readonly<{
  activeIntervalMs: number;
  idleIntervalMs: number;
  idleAfterPolls: number;
}>;

export const ALERT_POLLING_POLICY: AdaptivePollingPolicy = Object.freeze({
  activeIntervalMs: 4_000,
  idleIntervalMs: 8_000,
  idleAfterPolls: 8,
});

export const CONVERSATION_POLLING_POLICY: AdaptivePollingPolicy = Object.freeze({
  activeIntervalMs: 3_000,
  idleIntervalMs: 6_000,
  idleAfterPolls: 10,
});

export function nextAdaptivePollingDelay(
  consecutiveUnchangedPolls: number,
  policy: AdaptivePollingPolicy,
) {
  const normalizedUnchangedPolls = Math.max(
    0,
    Math.trunc(consecutiveUnchangedPolls),
  );
  return normalizedUnchangedPolls >= policy.idleAfterPolls
    ? policy.idleIntervalMs
    : policy.activeIntervalMs;
}
