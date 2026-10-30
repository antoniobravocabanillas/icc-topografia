import { closeSync, existsSync, linkSync, openSync, renameSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";

/** Prisma loads dotenv even when DATABASE_URL is supplied to its constructor.
 * Keep checkout dotenv files unavailable for the full lifetime of the child.
 * A lock prevents two runners from restoring each other's credentials.
 */
export function isolateStagingDotenv(root: string) {
  const lock = resolve(root, ".platform-staging-runner.lock.local");
  const pairs = [".env", ".env.local"].map((name) => ({
    original: resolve(root, name), held: resolve(root, `${name}.platform-gate-hold.local`),
  }));
  if (pairs.some(({ held }) => existsSync(held))) throw new Error("Existe un archivo de entorno retenido; requiere recuperacion.");
  const descriptor = openSync(lock, "wx", 0o600);
  closeSync(descriptor);
  const moved: typeof pairs = [];
  let released = false;
  const restore = () => {
    if (released) return;
    // Never overwrite a file created by another process while the gate ran.
    if (moved.some(({ original }) => existsSync(original))) throw new Error("Conflicto al restaurar entorno; se conservaron los archivos retenidos.");
    // A rename may replace a destination created after the check. Hard-link
    // creation is atomic and fails with EEXIST; retain every held copy until
    // all destinations exist successfully. Unsupported filesystems fail closed.
    for (const { original, held } of [...moved].reverse()) linkSync(held, original);
    for (const { held } of moved) unlinkSync(held);
    unlinkSync(lock);
    released = true;
  };
  try {
    for (const pair of pairs) {
      if (existsSync(pair.original)) { renameSync(pair.original, pair.held); moved.push(pair); }
    }
    return restore;
  } catch (error) { restore(); throw error; }
}
