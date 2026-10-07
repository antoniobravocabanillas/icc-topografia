export function cleanupRetrySchedule(attempts: unknown, now: Date) {
  const count = Number.isSafeInteger(attempts) && (attempts as number) >= 0 ? Math.min(attempts as number, 7) + 1 : 1;
  return {storageCleanupAttempts: count, storageCleanupNextAttemptAt: new Date(now.getTime() + Math.min(360, 5 * 2 ** (count - 1)) * 60_000).toISOString()};
}
