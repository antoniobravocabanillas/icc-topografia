import assert from "node:assert/strict";

async function main() {
  const stagingOrigin = "https://terraqo-platform-staging.netlify.app";
  process.env.NEXT_PUBLIC_SITE_URL = stagingOrigin;
  process.env.NEXT_PUBLIC_PORTAL_URL = stagingOrigin;
  process.env.NEXT_PUBLIC_ADMIN_URL = stagingOrigin;
  process.env.NEXT_PUBLIC_API_URL = stagingOrigin;

  const { publicRequestOrigin } = await import("../lib/server/request-origin");

  assert.equal(
    publicRequestOrigin(new Request(`${stagingOrigin}/api/auth/verify-email-link`, {
      headers: { "x-forwarded-host": "terraqo-platform-staging.netlify.app", "x-forwarded-proto": "https" },
    })),
    stagingOrigin,
  );
  assert.equal(
    publicRequestOrigin(new Request("https://internal.example/api/auth/verify-email-link", {
      headers: { "x-forwarded-host": "attacker.example" },
    })),
    stagingOrigin,
    "An untrusted host must fall back to the configured portal origin.",
  );
  assert.equal(
    publicRequestOrigin(new Request("https://internal.example", {
      headers: { "x-forwarded-host": "portal.terraqoglobal.com:4443", "x-forwarded-proto": "http" },
    })),
    "https://portal.terraqoglobal.com",
    "Public hosts must never be downgraded or redirected to an arbitrary port by forwarded headers.",
  );
  assert.equal(
    publicRequestOrigin(new Request("http://localhost:3000", {
      headers: { host: "localhost:3000" },
    })),
    "http://localhost:3000",
  );

  console.log("Public request origin: OK (configured staging host, trusted production hosts, HTTPS enforcement and safe fallback).");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
