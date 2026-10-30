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
  databaseProvider: "postgresql" | "supabase";
  resourceName?: string;
  supabaseProjectRef?: string;
  databaseRole?: string;
  applicationHost: string;
  authHost: string;
  remoteDatabase: boolean;
  enabledFlags: string[];
  pilotWorkspaceIds: string[];
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

function validateIsolatedResourceName(value: string, name: string) {
  assert.match(value, /(?:staging|stage|gate|test|sandbox|preview)/i, `${name} debe declarar su naturaleza aislada.`);
  assert.doesNotMatch(value, /(?:^|[\s_-])(?:prod|production|live)(?:$|[\s_-])/i, `${name} parece productivo.`);
}

function validateSupabaseTarget(
  environment: PlatformStagingEnvironment,
  parsedDatabase: URL,
  databaseName: string,
) {
  const resourceName = required(environment, "PLATFORM_STAGING_RESOURCE_NAME");
  validateIsolatedResourceName(resourceName, "PLATFORM_STAGING_RESOURCE_NAME");

  const projectRef = required(environment, "PLATFORM_STAGING_SUPABASE_PROJECT_REF").toLowerCase();
  const databaseRole = required(environment, "PLATFORM_STAGING_DATABASE_ROLE").toLowerCase();
  assert.match(projectRef, /^[a-z0-9]{20}$/, "PLATFORM_STAGING_SUPABASE_PROJECT_REF no tiene un formato valido.");
  assert.match(databaseRole, /^[a-z][a-z0-9_]{2,62}$/, "PLATFORM_STAGING_DATABASE_ROLE no tiene un formato valido.");
  assert.equal(databaseName, "postgres", "Una base administrada por Supabase debe usar la base postgres del proyecto aislado.");

  const hostname = parsedDatabase.hostname.toLowerCase();
  const username = decodeURIComponent(parsedDatabase.username).toLowerCase();
  const directHost = `db.${projectRef}.supabase.co`;
  const directConnection = hostname === directHost && username === databaseRole;
  const pooledConnection = hostname.endsWith(".pooler.supabase.com") && username === `${databaseRole}.${projectRef}`;

  assert.ok(
    directConnection || pooledConnection,
    "La URL no pertenece al PLATFORM_STAGING_SUPABASE_PROJECT_REF confirmado.",
  );

  return { databaseRole, projectRef, resourceName };
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
  const configuredProvider = environment.PLATFORM_STAGING_DATABASE_PROVIDER?.trim() || "postgresql";
  assert.match(
    configuredProvider,
    /^(?:postgresql|supabase)$/,
    "PLATFORM_STAGING_DATABASE_PROVIDER debe ser postgresql o supabase.",
  );
  const databaseProvider = configuredProvider as PlatformStagingTarget["databaseProvider"];
  const supabaseTarget = databaseProvider === "supabase"
    ? validateSupabaseTarget(environment, parsedDatabase, databaseName)
    : undefined;
  if (!supabaseTarget) {
    validateIsolatedResourceName(databaseName, "El nombre de la base");
  }
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
  for (const name of ["NEXT_PUBLIC_PORTAL_URL", "NEXT_PUBLIC_ADMIN_URL", "NEXT_PUBLIC_API_URL"] as const) {
    const surfaceUrl = parseHttpsUrl(required(environment, name), name);
    assert.equal(
      surfaceUrl.hostname,
      applicationUrl.hostname,
      `${name} y NEXT_PUBLIC_SITE_URL deben pertenecer al mismo host de staging.`,
    );
  }

  const enabledFlags = (environment.PLATFORM_STAGING_ENABLED_FLAGS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  assert.equal(new Set(enabledFlags).size, enabledFlags.length, "PLATFORM_STAGING_ENABLED_FLAGS contiene duplicados.");
  for (const flag of enabledFlags) {
    assert.ok(platformFlags.includes(flag as (typeof platformFlags)[number]), `Flag no autorizado para staging: ${flag}.`);
  }
  const pilotWorkspaceIds = (environment.PLATFORM_STAGING_PILOT_WORKSPACE_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  assert.equal(new Set(pilotWorkspaceIds).size, pilotWorkspaceIds.length, "PLATFORM_STAGING_PILOT_WORKSPACE_IDS contiene duplicados.");
  for (const workspaceId of pilotWorkspaceIds) {
    assert.match(workspaceId, /^c[a-z0-9]{24}$/, `Workspace piloto invalido: ${workspaceId}.`);
  }
  const configuredPilotWorkspaceIds = (environment.TERRAQO_B5_PILOT_WORKSPACE_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  assert.deepEqual(
    configuredPilotWorkspaceIds,
    pilotWorkspaceIds,
    "TERRAQO_B5_PILOT_WORKSPACE_IDS debe coincidir exactamente con el allowlist de staging.",
  );
  if (enabledFlags.length || pilotWorkspaceIds.length) {
    assert.equal(
      environment.PLATFORM_STAGING_ACTIVATION_CONFIRM,
      "cohort",
      "Activar flags exige PLATFORM_STAGING_ACTIVATION_CONFIRM=cohort.",
    );
  }
  for (const flag of platformFlags) {
    const expected = enabledFlags.includes(flag) ? "true" : "false";
    assert.equal(environment[flag], expected, `${flag} debe ser ${expected} para esta cohorte.`);
  }
  assert.equal(environment.TERRAQO_EVIDENCE_ANALYSIS_PROVIDER, "off", "El proveedor IA debe iniciar en off.");
  assert.equal(environment.TERRAQO_OAUTH_ENABLED, "false", "OAuth debe iniciar deshabilitado en staging.");
  assert.equal(
    environment.TERRAQO_TRANSACTIONAL_EMAIL_ENABLED,
    "false",
    "El correo transaccional debe iniciar deshabilitado en staging.",
  );
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
    databaseProvider,
    resourceName: supabaseTarget?.resourceName,
    supabaseProjectRef: supabaseTarget?.projectRef,
    databaseRole: supabaseTarget?.databaseRole,
    applicationHost: applicationUrl.hostname,
    authHost: authUrl.hostname,
    remoteDatabase,
    enabledFlags,
    pilotWorkspaceIds,
  };
}
