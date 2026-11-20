import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma";

async function main() {
  const require = createRequire(import.meta.url);
  const saved = new Map<string, NodeModule | undefined>();
  const mock = (name: string, exports: object) => {
    const id = require.resolve(name); saved.set(id, require.cache[id]);
    require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
  };
  let actor = "owner", available = true, reads = 0, locks = 0;
  const token = () => ({ sub: actor, workspaceId: "workspace", workspaceSlug: "fixture", role: "PROFESSIONAL" });
  mock("../lib/server/authz.ts", { requireUser: async () => ({ session: { user: { id: actor, role: "USER" } } }) });
  mock("../lib/server/workspace-portal-session.ts", { getWorkspacePortalToken: async () => token() });
  mock("../lib/server/portal-resources.ts", { authorizeResource: async () => undefined, PortalResourceError: class extends Error {} });
  mock("../lib/server/portal-professional-documents.ts", { professionalDocumentScope: () => ({ professionalProfile: { userId: actor } }) });
  mock("../lib/server/media.ts", { getProfessionalDocumentStore: () => ({ getWithMetadata: async () => {
    reads++; return { data: new TextEncoder().encode("synthetic private file").buffer };
  } }) });
  const original = prisma.$transaction;
  const document = { id: "document", professionalProfileId: "profile", professionalProfile: { userId: "owner" },
    workspaceId: "workspace", storageKey: "private", fileName: "private.pdf", contentType: "application/pdf" };
  const tx = {
    terraqoProfessionalDocument: { findUnique: async () => document, findFirst: async () => document },
    terraqoWorkspaceMember: { findFirst: async () => null },
    $queryRaw: async (sql: Prisma.Sql) => {
      locks++;
      return sql.text.includes('"TerraqoProfessionalProfile"') || available ? [{ id: "profile" }] : [];
    },
  } as unknown as Prisma.TransactionClient;
  prisma.$transaction = (async (callback: (client: Prisma.TransactionClient) => Promise<unknown>) => callback(tx)) as typeof original;
  try {
    const personal = await import("../app/api/terraqo/professional-documents/[id]/route");
    const native = await import("../app/api/public/workspaces/[workspaceSlug]/portal/documents/[id]/route");
    for (const route of [personal, native]) {
      const context = { params: Promise.resolve({ id: "document", workspaceSlug: "fixture" }) };
      const request = new Request("https://fixture.invalid/documents/document");
      actor = "owner"; available = true;
      const response = await route.GET(request, context);
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "synthetic private file");
      assert.ok(response.headers.get("cache-control")?.includes("no-store"));
      const priorReads = reads;
      available = false;
      assert.equal((await route.GET(request, context)).status, 404);
      assert.equal(reads, priorReads, "withdrawn source must not reach storage");
      actor = "outsider"; available = true;
      const priorLocks = locks;
      assert.equal((await route.GET(request, context)).status, 403);
      assert.equal(locks, priorLocks, "authorization precedes lifecycle lock");
      assert.equal(reads, priorReads);
    }
    assert.equal(reads, 2);
    console.log("PASS personal/native download handlers: authorized bytes, no-store, withdrawn 404 without storage and outsider denied before locks");
  } finally {
    prisma.$transaction = original;
    for (const [id, module] of saved) { if (module) require.cache[id] = module; else delete require.cache[id]; }
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
