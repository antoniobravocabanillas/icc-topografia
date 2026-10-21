const RETRY_DELAYS_MS = [2_000, 5_000, 15_000, 30_000] as const;

export function isRetryableFieldVerificationStatus(statusCode: number) {
  return statusCode === 0 || statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

export function fieldVerificationRetryDelay(failureCount: number) {
  const index = Math.min(Math.max(0, Math.trunc(failureCount)), RETRY_DELAYS_MS.length - 1);
  return RETRY_DELAYS_MS[index];
}
