/** Runtime boundary shared by Next.js server modules and standalone workers.
 * The `server-only` package throws when Netlify packages a Function outside
 * React Server conditions, so worker-compatible modules use this guard. */
if (typeof window !== "undefined") {
  throw new Error("Este módulo solo puede ejecutarse en el servidor.");
}
