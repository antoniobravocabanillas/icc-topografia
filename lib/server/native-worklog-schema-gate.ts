import "server-only";
import { Prisma } from "@prisma/client";
import { readNativeWorklogCompleteCatalog } from "./native-worklog-complete-catalog";
import { NativeWorklogBudget } from "./native-worklog-budget";
import { NativeWorklogOperationError } from "./native-worklog-http";

/** Must share the caller's transaction with any later accounting work. No DDL,
 * repairs, cache, bootstrap, service authentication or owner authorization.
 * ACCESS SHARE prevents table removal until this transaction ends. The second
 * read verifies after acquiring locks; this is not a general concurrent-DDL freeze.
 * Caller must roll back on ANY rejection. Runtime transaction bounds stay caller-owned.
 */
export async function assertNativeWorklogSchemaInTransaction(tx: Prisma.TransactionClient,
  budget: NativeWorklogBudget) {
  budget.require();
  // Catalog fingerprints use unqualified constraint targets in this canonical
  // search path. Accelerate and direct connections can have different defaults.
  await tx.$executeRaw`SET LOCAL search_path=icc,pg_catalog`;
  if ((await readNativeWorklogCompleteCatalog(tx)).state !== "exact") throw new NativeWorklogOperationError(503);
  await tx.$executeRaw(Prisma.sql`LOCK TABLE
    icc."TerraqoNativeWorklogOperation", icc."TerraqoNativeWorklogAccounting",
    icc."TerraqoNativeWorklogDecision", icc."TerraqoNativeWorklogAuthority",
    icc."TerraqoNativeWorklogFirstDecision", icc."TerraqoBuilderContribution" IN ACCESS SHARE MODE`);
  if ((await readNativeWorklogCompleteCatalog(tx)).state !== "exact") throw new NativeWorklogOperationError(503);
  budget.require();
}
