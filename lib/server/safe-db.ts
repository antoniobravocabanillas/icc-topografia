export async function safeDb<T>(label: string, query: Promise<T>, fallback: T): Promise<T> {
  try {
    return await query;
  } catch (error) {
    console.error(`[safe-db] ${label}`, error);
    return fallback;
  }
}
