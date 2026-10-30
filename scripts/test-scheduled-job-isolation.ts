import assert from "node:assert/strict";
import { build } from "esbuild";
import { resolveScheduledJobTargets } from "../lib/terraqo/scheduled-job-targets";

const stageOrigin = "https://terraqo-platform-staging.example.net";
const stageEnvironment = {
  URL: stageOrigin,
  NEXT_PUBLIC_SITE_URL: stageOrigin,
  NEXT_PUBLIC_API_URL: stageOrigin,
  PLATFORM_STAGING_CONFIRM: "staging",
};

const targets = resolveScheduledJobTargets(stageEnvironment);
assert.deepEqual(targets, {
  educationCleanupApi: `${stageOrigin}/api/internal/education-evidence-cleanup`,
  educationCleanupWorker: `${stageOrigin}/.netlify/functions/education-evidence-cleanup-background`,
  professionalDocumentCleanupApi: `${stageOrigin}/api/internal/professional-document-cleanup`,
  billingReconcileApi: `${stageOrigin}/api/internal/billing-reconcile`,
  complaintsMailApi: `${stageOrigin}/api/internal/complaints-mail`,
});

const productionTargets = resolveScheduledJobTargets({
  URL: "https://terraqoglobal.com",
  NEXT_PUBLIC_SITE_URL: "https://terraqoglobal.com",
  NEXT_PUBLIC_API_URL: "https://api.terraqoglobal.com",
});
assert.equal(
  productionTargets.professionalDocumentCleanupApi,
  "https://api.terraqoglobal.com/api/internal/professional-document-cleanup",
);
assert.equal(
  resolveScheduledJobTargets({
    URL: "https://iridescent-fenglisu-d6595c.netlify.app",
    NEXT_PUBLIC_SITE_URL: "https://terraqoglobal.com",
    NEXT_PUBLIC_API_URL: "https://api.terraqoglobal.com",
  }).billingReconcileApi,
  "https://iridescent-fenglisu-d6595c.netlify.app/api/internal/billing-reconcile",
);

for (const environment of [
  { ...stageEnvironment, PLATFORM_STAGING_CONFIRM: undefined },
  { ...stageEnvironment, NEXT_PUBLIC_API_URL: "https://api.terraqoglobal.com" },
  { ...stageEnvironment, URL: "https://terraqoglobal.com" },
  {
    URL: "https://iridescent-fenglisu-d6595c.netlify.app",
    NEXT_PUBLIC_SITE_URL: "https://terraqoglobal.com",
    NEXT_PUBLIC_API_URL: "https://api.terraqoglobal.com",
    PLATFORM_STAGING_CONFIRM: "staging",
  },
  { ...stageEnvironment, URL: "http://terraqo-platform-staging.example.net" },
  { ...stageEnvironment, NEXT_PUBLIC_API_URL: "https://user:pass@example.net" },
  { ...stageEnvironment, NEXT_PUBLIC_API_URL: `${stageOrigin}/nested` },
  { ...stageEnvironment, NEXT_PUBLIC_API_URL: undefined },
]) {
  assert.throws(
    () => resolveScheduledJobTargets(environment),
    /SCHEDULED_(?:DEPLOYMENT_ORIGIN_MISMATCH|STAGING_(?:ORIGIN_MISMATCH|CONFIRM_REQUIRED)|SITE_URL_INVALID|API_URL_(?:INVALID|MISSING))|SCHEDULED_PUBLIC_URL_MISSING/,
  );
}

async function loadFunction(entryPoint: string, label: string) {
  const bundled = await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: "node",
    format: "esm",
    write: false,
  });
  const source = Buffer.from(bundled.outputFiles[0].text).toString("base64");
  return import(`data:text/javascript;base64,${source}#${label}`);
}

async function main() {
  const [education, educationWorker, professional, billing, complaints] =
    await Promise.all([
      loadFunction("netlify/functions/education-evidence-cleanup.mts", "education"),
      loadFunction("netlify/functions/education-evidence-cleanup-background.mts", "education-worker"),
      loadFunction("netlify/functions/professional-document-cleanup.mts", "professional"),
      loadFunction("netlify/functions/billing-reconcile.mts", "billing"),
      loadFunction("netlify/functions/complaints-mail.mts", "complaints"),
    ]);

  const names = [
    "URL",
    "NEXT_PUBLIC_SITE_URL",
    "NEXT_PUBLIC_API_URL",
    "PLATFORM_STAGING_CONFIRM",
    "PROFESSIONAL_DOCUMENT_CLEANUP_SECRET",
    "BILLING_RECONCILE_SECRET",
  ] as const;
  const originals = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  const secret = "s".repeat(64);

  try {
    Object.assign(process.env, stageEnvironment, {
      PROFESSIONAL_DOCUMENT_CLEANUP_SECRET: secret,
      BILLING_RECONCILE_SECRET: secret,
    });
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      const target = String(url);
      calls.push(target);
      assert.ok(target.startsWith(stageOrigin), `Unexpected scheduler target: ${target}`);
      assert.equal(init?.redirect, "error");
      assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${secret}`);

      if (target.endsWith("education-evidence-cleanup-background")) {
        return new Response(null, { status: 202 });
      }
      if (target.endsWith("education-evidence-cleanup")) {
        if (init?.method === "GET") {
          return Response.json({
            backlog: { pending: 0, overdue: 0, quarantined: 0, watchesDue: 0, orphaned: 0 },
          });
        }
        return Response.json({
          selected: 0,
          processed: 0,
          deferred: 0,
          counts: { completed: 0, retained: 0, retry: 0, quarantined: 0, skipped: 0, pending: 0 },
        });
      }
      if (target.endsWith("professional-document-cleanup")) {
        return Response.json({
          completed: 0,
          retry: 0,
          blocked: 0,
          skipped: 0,
          backlog: { pending: 0, blocked: 0, overdue: 0, orphaned: 0 },
        });
      }
      return new Response(null, { status: 200 });
    }) as typeof fetch;

    assert.equal((await education.default()).status, 200);
    const workerRequest = new Request(
      `${stageOrigin}/.netlify/functions/education-evidence-cleanup-background`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
        body: JSON.stringify({ action: "DISPATCH" }),
      },
    );
    await educationWorker.default(workerRequest);
    assert.equal((await professional.default()).status, 200);
    assert.equal((await billing.default()).status, 200);
    assert.equal((await complaints.default()).status, 200);

    assert.deepEqual(new Set(calls), new Set(Object.values(targets)));

    calls.length = 0;
    process.env.NEXT_PUBLIC_API_URL = "https://api.terraqoglobal.com";
    assert.equal((await professional.default()).status, 503);
    assert.equal((await billing.default()).status, 503);
    assert.equal((await complaints.default()).status, 503);
    assert.equal((await education.default()).status, 503);
    assert.equal(calls.length, 0, "An isolated staging mismatch must fail before network I/O.");
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) {
      const value = originals[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }

  console.log(
    "PASS scheduled job isolation: every cron target follows its deployment, staging rejects cross-origin production targets before I/O, and all wrappers remain authenticated.",
  );
}

main().catch((error) => {
  console.error(error instanceof assert.AssertionError ? error.message : "Scheduled job isolation test failed.");
  process.exitCode = 1;
});
