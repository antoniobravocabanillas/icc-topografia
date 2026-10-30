import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const guardedScripts = [
  "test-worklog-isolation.ts",
  "test-messaging-isolation.ts",
  "test-meeting-isolation.ts",
  "test-forum-isolation.ts",
  "test-team-isolation.ts",
  "test-private-storage-isolation.ts",
];

for (const fileName of guardedScripts) {
  const source = readFileSync(resolve(process.cwd(), "scripts", fileName), "utf8");
  assert.match(source, /confirmedLocalDisposableDatabaseUrl/, `${fileName} debe usar el guard local desechable.`);
  assert.doesNotMatch(source, /^import\s+.*(?:PrismaClient|\.\.\/lib\/prisma)/m, `${fileName} no debe cargar Prisma antes del guard.`);
  const confirmation = source.indexOf("process.env.DATABASE_URL = confirmedLocalDisposableDatabaseUrl");
  const prismaImport = source.indexOf('import("../lib/prisma")');
  assert.ok(confirmation >= 0, `${fileName} debe confirmar y asignar DATABASE_URL.`);
  assert.ok(prismaImport > confirmation, `${fileName} debe importar Prisma únicamente después de confirmar el destino.`);
}

const deployedPortalSource = readFileSync(resolve(process.cwd(), "scripts", "test-deployed-portal.ts"), "utf8");
assert.doesNotMatch(
  deployedPortalSource,
  /^import\s+.*\.\.\/lib\/prisma/m,
  "test-deployed-portal.ts no debe cargar Prisma antes del consentimiento explícito.",
);
const deployedConsent = deployedPortalSource.indexOf("process.env.TERRAQO_DEPLOYED_PORTAL_TESTS");
const deployedPrismaImport = deployedPortalSource.indexOf('await import("../lib/prisma")');
assert.ok(deployedConsent >= 0, "test-deployed-portal.ts debe exigir consentimiento para el fixture remoto.");
assert.ok(
  deployedPrismaImport > deployedConsent,
  "test-deployed-portal.ts debe importar Prisma únicamente después del consentimiento remoto.",
);

const browserGateSource = readFileSync(resolve(process.cwd(), "scripts", "test-b5-browser-accessibility.ts"), "utf8");
assert.doesNotMatch(
  browserGateSource,
  /^import\s+.*\.\.\/lib\/prisma/m,
  "test-b5-browser-accessibility.ts no debe cargar Prisma antes de validar su base dedicada.",
);
const browserConfirmation = browserGateSource.indexOf("assertLocalDisposableDatabase();");
const browserPrismaImport = browserGateSource.indexOf('await import("../lib/prisma")');
assert.ok(browserConfirmation >= 0, "test-b5-browser-accessibility.ts debe validar la base local dedicada.");
assert.ok(
  browserPrismaImport > browserConfirmation,
  "test-b5-browser-accessibility.ts debe importar Prisma únicamente después de validar la base dedicada.",
);

const stagingB5DispatchSource = readFileSync(
  resolve(process.cwd(), "scripts", "test-platform-staging-b5-dispatch.ts"),
  "utf8",
);
assert.doesNotMatch(
  stagingB5DispatchSource,
  /^import\s+.*(?:@\/lib\/prisma|lib\/prisma)/m,
  "El gate B5 HTTPS no debe cargar Prisma antes de confirmar staging.",
);
const stagingB5Consent = stagingB5DispatchSource.indexOf(
  "process.env.TERRAQO_STAGING_B5_PROVIDER_TESTS",
);
const stagingB5Target = stagingB5DispatchSource.indexOf("validatePlatformStagingEnvironment(process.env)");
const stagingB5PrismaImport = stagingB5DispatchSource.indexOf('import("@/lib/prisma")');
assert.ok(stagingB5Consent >= 0, "El gate B5 HTTPS debe exigir consentimiento exacto.");
assert.ok(stagingB5Target > stagingB5Consent, "El gate B5 HTTPS debe validar el destino después del consentimiento.");
assert.ok(
  stagingB5PrismaImport > stagingB5Target,
  "El gate B5 HTTPS debe cargar Prisma únicamente después de validar el destino.",
);

const iccMutatingScripts = [
  "test-icc-mobile-flows.ts",
  "test-icc-native-login.ts",
  "test-icc-native-cv.ts",
  "test-icc-native-worklog.ts",
  "test-icc-login-limit.ts",
];
for (const fileName of iccMutatingScripts) {
  const source = readFileSync(resolve(process.cwd(), "scripts", fileName), "utf8");
  assert.doesNotMatch(source, /^import\s+.*\.\.\/lib\/prisma/m, `${fileName} no debe cargar Prisma antes de autorizar el alcance ICC.`);
  const authorization = source.indexOf("process.env.TERRAQO_MUTATING_TESTS");
  const prismaImport = source.indexOf('await import("../lib/prisma")');
  assert.ok(authorization >= 0, `${fileName} debe exigir la autorización ICC exacta.`);
  assert.ok(prismaImport > authorization, `${fileName} debe importar Prisma únicamente después de autorizar el alcance ICC.`);
}

const deployedNativeSource = readFileSync(resolve(process.cwd(), "scripts", "test-deployed-native-worklog.ts"), "utf8");
assert.doesNotMatch(
  deployedNativeSource,
  /^import\s+.*(?:\.\.\/lib\/prisma|workspace-portal-session)/m,
  "test-deployed-native-worklog.ts no debe cargar persistencia o sesiones antes de sus barreras.",
);
const nativeAuthorization = deployedNativeSource.indexOf("process.env.TERRAQO_MUTATING_TESTS");
const nativeOrigin = deployedNativeSource.indexOf("process.env.TEST_PORTAL_URL");
const nativePrismaImport = deployedNativeSource.indexOf('import("../lib/prisma")', nativeOrigin);
const nativeSessionImport = deployedNativeSource.indexOf('import("../lib/server/workspace-portal-session")', nativeOrigin);
assert.ok(nativeAuthorization >= 0 && nativeOrigin > nativeAuthorization, "El runner HTTPS nativo debe fijar alcance y origen.");
assert.ok(
  nativePrismaImport > nativeOrigin && nativeSessionImport > nativeOrigin,
  "El runner HTTPS nativo debe cargar persistencia y sesiones únicamente después de validar alcance y origen.",
);

console.log(`PASS: ${guardedScripts.length} isolation gates, ${iccMutatingScripts.length} ICC validators, the native HTTPS runner, both B5 gates and the deployed portal fixture fail closed before loading Prisma.`);
