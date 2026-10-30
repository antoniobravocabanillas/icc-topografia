// A staging deployment must never rewrite the destinations of the public site.
// Only inspect environment metadata; this guard performs no network or DB I/O.
const productionSite = "2d38524a-44f9-4473-8a1f-9270e03bc2bf";
const productionOrigins = {
  NEXT_PUBLIC_SITE_URL: "https://terraqoglobal.com",
  NEXT_PUBLIC_PORTAL_URL: "https://portal.terraqoglobal.com",
  NEXT_PUBLIC_ADMIN_URL: "https://admin.terraqoglobal.com",
  NEXT_PUBLIC_API_URL: "https://api.terraqoglobal.com",
};

function assertProductionEnvironment(environment) {
  if (environment.SITE_ID !== productionSite || environment.CONTEXT !== "production") return;
  if (environment.BRANCH !== "codex/icc-production-preview") throw new Error("Production build: unexpected release branch.");
  for (const [key, expected] of Object.entries(productionOrigins)) {
    if (environment[key] !== expected) throw new Error(`Production build: invalid ${key}.`);
  }
  // Auth.js must resolve the current trusted host for both portal and admin.
  if (environment.AUTH_URL || environment.NEXTAUTH_URL || environment.AUTH_TRUST_HOST !== "true") {
    throw new Error("Production build: authentication must use the trusted request host.");
  }
  for (const [key, value] of Object.entries(environment)) {
    if (value && (key.startsWith("PLATFORM_STAGING_") || key.startsWith("B5_GATE_") || key.startsWith("TERRAQO_STAGING_"))) {
      throw new Error("Production build: staging-only configuration is present.");
    }
  }
}

module.exports = { assertProductionEnvironment, productionOrigins, productionSite };
