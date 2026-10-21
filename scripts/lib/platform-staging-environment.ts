import assert from "node:assert/strict";

export const platformFlags = [
  "TERRAQO_WORKLOG_FTS_V1",
  "TERRAQO_WORK_CASES_V1",
  "TERRAQO_SCOPED_SHARING_V1",
  "TERRAQO_SCOPED_ENDORSEMENTS_V1",
  "TERRAQO_DISCOVERY_NEEDS_V1",
  "TERRAQO_CONTEXTUAL_MESSAGING_V1",
  "TERRAQO_COLLABORATION_V1",
  "TERRAQO_CLOSURE_V1",
  "TERRAQO_EVIDENCE_ANALYSIS_V1",
] as const;

const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);
const productionHosts = new Set([
  "terraqoglobal.com",
  "www.terraqoglobal.com",
  "portal.terraqoglobal.com",
  "admin.terraqoglobal.com",
]);

export type PlatformStagingTarget = {
  databaseHost: string;
  databaseName: string;
  applicationHost: string;
  authHost: string;
  remoteDatabase: boolean;
};

export type PlatformStagingEnvironment = Record<string, string | undefined>;

function required(environment: PlatformStagingEnvironment, name: string) {
  const value = environment[name]?.trim();
  assert.ok(value, `Define ${name} para confirmar el entorno de staging.`);
  return value;
}

function parseHttpsUrl(value: string, name: string) {
  const parsed = new URL(value);
  assert.equal(parsed.protocol, "https:", `${name} debe usar HTTPS.`);
  assert.ok(!productionHosts.has(parsed.hostname.toLowerCase()), `${name} no puede apuntar a producción.`);
  return parsed;
}

function validateSecret(value: string, name: string) {
  assert.ok(value.length >= 32, `${name} debe tener al menos 32 caracteres en staging.`);
  assert.doesNotMatch(value, /replace|change|example|placeholder/i, `${name} no puede ser un marcador.`);
}

export function validatePlatformStagingEnvironment(
  environment: PlatformStagingEnvironment,
): PlatformStagingTarget {
  assert.equal(
    environment.PLATFORM_STAGING_CONFIRM,
    "staging",
    "Define PLATFORM_STAGING_CONFIRM=staging para confirmar que el destino no es producción.",
  );

  const databaseUrl = required(environment, "B5_GATE_DATABASE_URL");
  const expectedDatabase = required(environment, "B5_GATE_EXPECTED_DATABASE");
  const parsedDatabase = new URL(databaseUrl);
  assert.match(parsedDatabase.protocol, /^postgres(?:ql)?:$/, "El destino debe usar PostgreSQL.");

  const databaseName = decodeURIComponent(parsedDatabase.pathname.replace(/^\//, ""));
  assert.equal(databaseName, expectedDatabase, "La URL y B5_GATE_EXPECTED_DATABASE no coinciden.");
  assert.match(databaseName, /(?:staging|stage|gate|test|sandbox|preview)/i, "El nombre de la base debe declarar su naturaleza aislada.");
  assert.doesNotMatch(databaseName, /(?:^|[_-])(?:prod|production|live)(?:$|[_-])/i, "El nombre de la base parece productivo.");
  assert.doesNotMatch(parsedDatabase.hostname, /(?:^|\.)(?:prod|production|live)(?:\.|$)/i, "El host de base parece productivo.");
  assert.ok(parsedDatabase.password.length > 0, "La URL de staging debe usar una credencial dedicada.");
  assert.doesNotMatch(parsedDatabase.password, /password|change|example/i, "La credencial de base no puede ser un marcador.");

  const remoteDatabase = !localHosts.has(parsedDatabase.hostname.toLowerCase());
  if (remoteDatabase) {
    assert.equal(
      environment.PLATFORM_STAGING_ALLOW_REMOTE,
      "true",
      "Una base remota exige PLATFORM_STAGING_ALLOW_REMOTE=true.",
    );
  }

  const applicationUrl = parseHttpsUrl(required(environment, "NEXT_PUBLIC_SITE_URL"), "NEXT_PUBLIC_SITE_URL");
  const authUrl = parseHttpsUrl(required(environment, "AUTH_URL"), "AUTH_URL");
  assert.equal(authUrl.hostname, applicationUrl.hostname, "AUTH_URL y NEXT_PUBLIC_SITE_URL deben pertenecer al mismo host de staging.");

  for (const flag of platformFlags) {
    assert.equal(environment[flag], "false", `${flag} debe iniciar en false.`);
  }
  assert.equal(environment.TERRAQO_EVIDENCE_ANALYSIS_PROVIDER, "off", "El proveedor IA debe iniciar en off.");
  assert.equal(environment.TERRAQO_B5_PILOT_WORKSPACE_IDS ?? "", "", "La cohorte piloto debe iniciar vacía.");

  validateSecret(required(environment, "AUTH_SECRET"), "AUTH_SECRET");
  validateSecret(required(environment, "EVIDENCE_ANALYSIS_DISPATCH_SECRET"), "EVIDENCE_ANALYSIS_DISPATCH_SECRET");
  assert.notEqual(
    environment.AUTH_SECRET,
    environment.EVIDENCE_ANALYSIS_DISPATCH_SECRET,
    "AUTH_SECRET y EVIDENCE_ANALYSIS_DISPATCH_SECRET deben ser independientes.",
  );

  return {
    databaseHost: parsedDatabase.hostname,
    databaseName,
    applicationHost: applicationUrl.hostname,
    authHost: authUrl.hostname,
    remoteDatabase,
  };
}
