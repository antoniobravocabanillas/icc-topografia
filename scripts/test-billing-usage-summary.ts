import assert from "node:assert/strict";
import { createRequire } from "node:module";
import type { PersonalUsageSummary } from "../lib/terraqo/billing/usage-summary";

// Execute real GET, billingUser, effectivePlan and retained-floor code against
// deny-by-default delegates. Never import the real Prisma module or load .env.
const require = createRequire(import.meta.url);
const saved = new Map<string, NodeModule | undefined>();
function mock(name: string, exports: object) {
  const id = require.resolve(name);
  saved.set(id, require.cache[id]);
  require.cache[id] = { id, filename: id, loaded: true, exports } as NodeModule;
}
let forbidden = 0, reads = 0, transactions = 0;
function deny(): never { forbidden++; throw new Error("Unexpected database write, delegate or provider call"); }
function readOnly<T extends object>(value: T): T {
  return new Proxy(value, { get(target, key, receiver) {
    if (key in target) return Reflect.get(target, key, receiver);
    return deny;
  } });
}
type Bucket = { ownerKey: string; period: string; metric: string; used: number };
type Stored = { owner: string; size: number; withdrawn?: boolean; privateName?: string };
type Pending = { owner: string; state: string; reservedUnits: number };
const actor = "session-owner";
let signedIn = true, userExists = true;
let liveAccount: { planCode: string; paidThrough: Date | null; status?: string; cancelAtPeriodEnd?: boolean } | null = null;
let legacyTier: string | null = null;
let buckets: Bucket[] = [];
let documents: Stored[] = [], worklogs: Stored[] = [], messages: Stored[] = [], experiences: Stored[] = [], education: Stored[] = [];
let educationAttempts: Pending[] = [], replacements: Pending[] = [];
let afterBucketRead: (() => void) | undefined;
let failStorage = false;
const RealDate = Date;
let now = "2026-11-01T00:00:00.000Z";
class Clock extends RealDate {
  constructor(value?: string | number | Date) { super(value === undefined ? now : value instanceof RealDate ? value.getTime() : value); }
  static now() { return new RealDate(now).getTime(); }
}

function aggregate(rows: Stored[], where: object) {
  return readOnly({ aggregate: async (args: unknown) => {
    reads++;
    assert.deepEqual(args, { where, _sum: { size: true } });
    if (failStorage) throw new Error("private filename must not escape");
    return { _sum: { size: rows.filter(row => row.owner === actor).reduce((sum, row) => sum + row.size, 0) } };
  } });
}
function reserved(rows: Pending[], where: object, states: string[]) {
  return readOnly({ aggregate: async (args: unknown) => {
    reads++;
    assert.deepEqual(args, { where: { ...where, state: { in: states } }, _sum: { reservedUnits: true } });
    return { _sum: { reservedUnits: rows.filter(row => row.owner === actor && states.includes(row.state))
      .reduce((sum, row) => sum + row.reservedUnits, 0) } };
  } });
}

const db = readOnly({
  user: readOnly({ findUnique: async (args: unknown) => {
    reads++;
    assert.deepEqual(args, { where: { id: actor }, select: { id: true, email: true, name: true, role: true, emailVerified: true } });
    return userExists ? { id: actor, email: "owner@example.invalid", emailVerified: null } : null;
  } }),
  terraqoBillingAccount: readOnly({
    findUnique: async (args: unknown) => {
      reads++;
      assert.deepEqual(args, { where: { ownerKey_mode: { ownerKey: `user:${actor}`, mode: "live" } } });
      return liveAccount;
    },
    findMany: async (args: { where: unknown }) => {
      reads++;
      assert.deepEqual(args.where, { userId: actor, mode: "test" });
      return []; // Sandbox display accounts never grant entitlement.
    },
  }),
  terraqoProfessionalProfile: readOnly({ findUnique: async (args: unknown) => {
    reads++;
    assert.deepEqual(args, { where: { userId: actor }, select: { planTier: true } });
    return legacyTier ? { planTier: legacyTier } : null;
  } }),
  terraqoWorkspace: readOnly({ findMany: async (args: unknown) => {
    reads++;
    assert.deepEqual(args, { where: { ownerUserId: actor, active: true, deletedAt: null, type: "CLIENT_COMPANY" }, select: { id: true, name: true } });
    return [];
  } }),
  terraqoBillingPlan: readOnly({ findMany: async () => { reads++; return []; } }),
  terraqoBillingAttempt: readOnly({ findMany: async (args: unknown) => {
    reads++;
    assert.deepEqual(args, { where: { id: { in: [] } }, select: { id: true, status: true } });
    return [];
  } }),
  $transaction: async (callback: (tx: object) => Promise<unknown>, options: unknown) => {
    transactions++;
    assert.deepEqual(options, { isolationLevel: "RepeatableRead", maxWait: 15000, timeout: 10000 });
    // Model the requested snapshot; actual DB isolation acceptance belongs to
    // the parent's local/staging gate, not this hermetic contract test.
    const snapshot = structuredClone({ buckets, documents, worklogs, messages, experiences, education, educationAttempts, replacements });
    const tx = readOnly({
      terraqoUsageBucket: readOnly({ findMany: async (args: unknown) => {
        reads++;
        const period = new Date().toISOString().slice(0, 7);
        assert.deepEqual(args, { where: { ownerKey: `user:${actor}`, OR: [
          { period, metric: { in: ["ai", "automation"] } }, { period: "retained", metric: "storage-mb" },
        ] }, select: { period: true, metric: true, used: true } });
        afterBucketRead?.();
        return snapshot.buckets.filter(row => row.ownerKey === `user:${actor}` && (
          row.period === period && ["ai", "automation"].includes(row.metric) || row.period === "retained" && row.metric === "storage-mb"
        )).map(({ period, metric, used }) => ({ period, metric, used }));
      } }),
      terraqoProfessionalDocument: aggregate(snapshot.documents, { professionalProfile: { userId: actor } }),
      terraqoWorklogMedia: aggregate(snapshot.worklogs, { worklog: { authorId: actor } }),
      terraqoMessageAttachment: aggregate(snapshot.messages, { message: { senderId: actor } }),
      terraqoExperienceEvidence: aggregate(snapshot.experiences, { experience: { professionalProfile: { userId: actor } } }),
      terraqoEducationEvidence: aggregate(snapshot.education, { education: { professionalProfile: { userId: actor } } }),
      terraqoEducationEvidenceAttempt: reserved(snapshot.educationAttempts, { education: { professionalProfile: { userId: actor } } }, ["RESERVED", "CLEANUP_PENDING", "QUARANTINED"]),
      terraqoDocumentReplacementAttempt: reserved(snapshot.replacements, { professionalProfile: { userId: actor } }, ["RESERVED", "CLEANUP_PENDING"]),
    });
    return callback(tx);
  },
});

async function main() {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => deny();
  globalThis.Date = Clock as DateConstructor;
  mock("server-only", {});
  mock("../lib/prisma.ts", { prisma: db });
  mock("../auth.ts", { auth: async () => signedIn ? { user: { id: actor } } : null });
  mock("../lib/terraqo/billing/owner.ts", { authorizeBillingOwner: deny });
  const provider = require("../lib/terraqo/billing/provider.ts");
  mock("../lib/terraqo/billing/provider.ts", { BillingError: provider.BillingError,
    billingMode: () => "test", providerCredentials: () => { throw new Error("No credentials loaded in tests"); }, culqi: deny });
  mock("../lib/terraqo/billing/service.ts", { checkout: deny, cancelSubscription: deny, reconcileAccount: deny, abandonAuthentication: deny });
  mock("../lib/terraqo/billing/request-security.ts", { boundedJson: deny, billingRateLimit: deny });
  try {
    const { personalUsageSummary } = await import("../lib/terraqo/billing/usage-summary");
    const { GET } = await import("../app/api/terraqo/billing/route");
    const { getBillingPlan } = await import("../lib/terraqo/billing/catalog");
    const expectPlan = (summary: PersonalUsageSummary, code: string) => {
      const plan = getBillingPlan(code);
      assert.deepEqual(summary.plan, { code, name: plan.name });
      assert.equal(summary.storage.limit, plan.storageMb);
      assert.equal(summary.ai.limit, plan.aiActions);
      assert.equal(summary.automation.limit, plan.automationRuns);
    };
    const read = () => personalUsageSummary(actor);
    const bucket = (metric: string, used: number, period = "2026-11", ownerKey = `user:${actor}`) => ({ metric, used, period, ownerKey });

    signedIn = false;
    const unauthorized = await GET();
    assert.equal(unauthorized.status, 401); assert.equal(reads, 0); assert.equal(transactions, 0);
    signedIn = true; userExists = false;
    assert.equal((await GET()).status, 401); assert.equal(reads, 1); assert.equal(transactions, 0);
    userExists = true;
    await assert.rejects(personalUsageSummary(""), { code: "AUTH_REQUIRED" });
    assert.equal(reads, 1);
    const empty = await read();
    expectPlan(empty, "personal-free");
    assert.deepEqual(empty, { plan: { code: "personal-free", name: "Gratis" }, period: "2026-11",
      storage: { used: 0, limit: 250, unit: "MB" }, ai: { used: 0, limit: 10 }, automation: { used: 0, limit: 0 } });

    legacyTier = "PROFESSIONAL"; expectPlan(await read(), "personal-pro");
    legacyTier = "PREMIUM"; expectPlan(await read(), "personal-premium");
    liveAccount = { planCode: "personal-pro", paidThrough: new RealDate("2026-12-01Z"), status: "CANCELED", cancelAtPeriodEnd: true };
    expectPlan(await read(), "personal-pro"); // Paid-through access survives cancellation.
    for (const paidThrough of [null, new RealDate(now), new RealDate("2026-10-31T23:59:59Z")]) {
      liveAccount = { planCode: "personal-premium", paidThrough, status: "ACTIVE" };
      expectPlan(await read(), "personal-free"); // No paid success inference from status or legacy tier.
    }
    liveAccount = { planCode: "workspace-pro", paidThrough: new RealDate("2026-12-01Z") };
    await assert.rejects(read(), { code: "BILLING_UNAVAILABLE" });
    liveAccount = null; legacyTier = null;

    documents = [1, 2, 3].map(version => ({ owner: actor, size: 100, withdrawn: version < 3, privateName: `private-cv-v${version}.pdf` }));
    documents.push({ owner: "foreign-owner", size: 999_000_000, privateName: "foreign-private.pdf" });
    buckets = [bucket("storage-mb", 3, "retained"), bucket("ai", 12), bucket("automation", 2),
      bucket("ai", 999, "2026-10"), bucket("ai", 999, "2026-11", "user:foreign-owner"),
      bucket("storage-mb", 999, "retained", "workspace:client-selected"), bucket("unknown", 999)];
    assert.equal((await read()).storage.used, 3, "Three charged CV versions must not collapse to the aggregate-byte floor");
    documents.forEach(row => { row.withdrawn = true; });
    const withdrawn = await read();
    assert.equal(withdrawn.storage.used, 3, "Withdrawal retains versions and must not refund quota");
    assert.equal(withdrawn.ai.used, 12); assert.equal(withdrawn.automation.used, 2);
    assert.deepEqual(await read(), withdrawn, "Repeated reads are idempotent");
    buckets[0].used = 3000;
    const downgraded = await read();
    assert.equal(downgraded.storage.used, 3000); assert.equal(downgraded.storage.limit, 250);
    assert.equal(downgraded.ai.used, 12); assert.equal(downgraded.ai.limit, 10);
    assert.equal(downgraded.automation.used, 2); assert.equal(downgraded.automation.limit, 0);

    // Existing sources and durable reservations establish the same floor used
    // by writers; COMMITTED, CLEANED and zero-unit tombstones add no charge.
    documents = [{ owner: actor, size: 1_000_001, withdrawn: true }];
    worklogs = [{ owner: actor, size: 200 }]; messages = [{ owner: actor, size: 300 }];
    experiences = [{ owner: actor, size: 400 }]; education = [{ owner: actor, size: 500 }];
    educationAttempts = ["RESERVED", "CLEANUP_PENDING", "QUARANTINED", "COMMITTED", "CLEANED"]
      .map(state => ({ owner: actor, state, reservedUnits: 1 }));
    replacements = [{ owner: actor, state: "RESERVED", reservedUnits: 2 }, { owner: actor, state: "CLEANUP_PENDING", reservedUnits: 1 },
      { owner: actor, state: "COMMITTED", reservedUnits: 99 }, { owner: actor, state: "CLEANED", reservedUnits: 99 },
      { owner: actor, state: "CLEANUP_PENDING", reservedUnits: 0 }, { owner: "foreign-owner", state: "RESERVED", reservedUnits: 999 }];
    buckets = [];
    assert.equal((await read()).storage.used, 8, "Missing bucket falls back without creating it");
    buckets = [bucket("storage-mb", 1, "retained")];
    assert.equal((await read()).storage.used, 8, "Stale bucket cannot under-report the retained floor");
    buckets[0].used = 8;
    assert.equal((await read()).storage.used, 8, "Reservations already charged to the bucket are not added twice");
    buckets[0].used = 11;
    assert.equal((await read()).storage.used, 11, "Additional in-flight charged reservations remain visible");
    afterBucketRead = () => { documents[0].size = 20_000_000; };
    assert.equal((await read()).storage.used, 11, "Floor and bucket use the same requested snapshot");
    afterBucketRead = undefined;
    assert.equal((await read()).storage.used, 27, "Next snapshot sees the committed storage growth");

    buckets.push(bucket("ai", 5, "2026-10"), bucket("ai", 7));
    now = "2026-10-31T23:59:59.999Z";
    assert.equal((await read()).period, "2026-10"); assert.equal((await read()).ai.used, 5);
    now = "2026-11-01T00:00:00.000Z";
    assert.equal((await read()).period, "2026-11"); assert.equal((await read()).ai.used, 7);

    // Runtime GET receives hostile selectors just as Next would; they cannot
    // change the server-authenticated owner (GET intentionally accepts none).
    const getWithRequest = GET as (request: Request) => ReturnType<typeof GET>;
    const response = await getWithRequest(new Request("https://fixture.invalid/api/terraqo/billing?userId=foreign-owner&workspaceId=client-selected&ownerKey=workspace:client-selected"));
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    const body = await response.json();
    assert.equal(body.mode, "test"); assert.deepEqual(body.usage, await read());
    assert.deepEqual(Object.keys(body.usage).sort(), ["ai", "automation", "period", "plan", "storage"]);
    assert.doesNotMatch(JSON.stringify(body.usage), /owner|workspace|private|fileName|storageKey|documentId/);

    failStorage = true;
    const unavailable = await GET();
    assert.equal(unavailable.status, 503);
    assert.deepEqual(await unavailable.json(), { error: "BILLING_UNAVAILABLE", uncertain: false });
    failStorage = false;
    for (const invalid of [-1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      buckets[0].used = invalid;
      await assert.rejects(read(), { code: "BILLING_UNAVAILABLE" });
    }
    assert.equal(forbidden, 0, "No writes, provider calls or out-of-scope delegates may execute, even if caught");
    console.log("PASS billing usage: authenticated PERSONAL queries; real live/legacy entitlement resolver; UTC month; retained versions/withdrawal; pending reservations without double count; over-cap downgrade; snapshot contract; private no-store GET; safe failures; zero writes/provider/network calls.");
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.Date = RealDate;
    for (const [id, module] of saved) { if (module) require.cache[id] = module; else delete require.cache[id]; }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
