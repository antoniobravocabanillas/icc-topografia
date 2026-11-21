import assert from "node:assert/strict";
import { createHash, createPrivateKey, sign, webcrypto } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import { chromium } from "@playwright/test";
import { isoCBOR, validateCertificatePath } from "@terraqo/webauthn-server/helpers";
import { BasicConstraintsExtension, X509CertificateGenerator } from "@peculiar/x509";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const origin = "http://localhost:3219";
const context = { rpId: "localhost", expectedOrigin: origin, rpName: "Fixture" };
const userId = "fixture-user-ñ";
const workspaceId = "fixture-workspace";
const email = "passkey@example.invalid";
const b64 = (bytes) => Buffer.from(bytes).toString("base64url");

// Execute the actual service and transaction helpers. Only persistence and
// unrelated reward side effects are in memory; WebAuthn/crypto are never mocked.
// This is not a substitute for PostgreSQL transaction/concurrency validation.
function harness() {
  let state = { challenges: [], credentials: [], tokens: [], status: "REQUESTED", evidence: "PENDING" };
  let rejectCounter = false;
  function matches(row, where) {
    return Object.entries(where).every(([key, value]) => {
      if (key === "OR") return value.some((clause) => matches(row, clause));
      if (value && typeof value === "object" && !(value instanceof Date)) {
        if ("in" in value) return value.in.includes(row[key]);
        if ("gt" in value) return row[key] > value.gt;
        if ("lt" in value) return row[key] < value.lt;
      }
      return row[key] === value;
    });
  }
  function update(rows, { where, data }) {
    const found = rows.filter((row) => matches(row, where));
    for (const row of found) Object.assign(row, data);
    return { count: found.length };
  }
  const db = {
    user: { findUnique: async ({ where }) => where.id === userId || where.email === email ? { id: userId, email, name: "Fixture" } : null },
    terraqoWorkspaceMember: { findFirst: async ({ where }) => where.userId === userId && where.workspaceId === workspaceId ? { role: "MANAGER", workspace: { name: "Fixture" } } : null },
    terraqoWebAuthnChallenge: {
      create: async ({ data }) => {
        const row = { id: `challenge-${state.challenges.length}`, consumedAt: null, workspaceId: null, ...data, user: { email } };
        state.challenges.push(row);
        return row;
      },
      findFirst: async ({ where }) => state.challenges.find((row) => matches(row, where)) ?? null,
      deleteMany: async () => ({ count: 0 }),
      updateMany: async (args) => update(state.challenges, args),
    },
    terraqoWebAuthnCredential: {
      findMany: async ({ where }) => state.credentials.filter((row) => matches(row, where)),
      findFirst: async ({ where }) => state.credentials.find((row) => matches(row, where)) ?? null,
      upsert: async ({ where, create }) => {
        const found = state.credentials.find((row) => matches(row, where.credentialId_rpId));
        if (found) return found;
        const row = { id: `credential-${state.credentials.length}`, lastUsedAt: null, ...create };
        state.credentials.push(row);
        return row;
      },
      updateMany: async (args) => rejectCounter ? { count: 0 } : update(state.credentials, args),
    },
    verificationToken: {
      deleteMany: async () => { state.tokens = []; return { count: 0 }; },
      create: async ({ data }) => { state.tokens.push(data); return data; },
    },
    terraqoWorklogValidation: {
      findFirst: async ({ where }) => where.id === "validation" && where.workspaceId === workspaceId && where.validatorUserId === userId && state.status === where.status
        ? { id: "validation", worklogId: "legacy-worklog", worklog: { authorId: "other-user" } } : null,
      updateMany: async ({ where, data }) => {
        if (state.status !== where.status) return { count: 0 };
        state.status = data.status;
        return { count: 1 };
      },
      count: async () => 11,
    },
    terraqoWorklogEntry: { update: async ({ data }) => { state.evidence = data.evidenceStatus; } },
    // Real legacy guard executes, against an explicit pre-bootstrap fixture.
    $queryRaw: async () => [{ receipt: null, accounting: null }],
    $transaction: async (callback) => {
      const before = structuredClone(state);
      try { return await callback(db); } catch (error) { state = before; throw error; }
    },
  };
  const cache = new Map();
  function load(path) {
    const filename = resolve(root, path);
    if (cache.has(filename)) return cache.get(filename).exports;
    const loadedModule = { exports: {} };
    cache.set(filename, loadedModule);
    const code = ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
      fileName: filename,
    }).outputText;
    const scopedRequire = (name) => {
      if (name === "@/lib/prisma") return { prisma: db };
      if (name === "server-only") return {};
      if (name === "@/lib/terraqo/builders") return { syncWorklogReputation: async () => {} };
      if (name === "@/lib/terraqo/jornada") return {};
      if (name.startsWith("@/")) return load(`${name.slice(2)}.ts`);
      return createRequire(filename)(name);
    };
    runInThisContext(`(function(require,module,exports){${code}\n})`, { filename })(scopedRequire, loadedModule, loadedModule.exports);
    return loadedModule.exports;
  }
  return {
    account: load("lib/server/account-passkey.ts"), field: load("lib/terraqo/field-verification.ts"),
    get state() { return state; },
    rejectCounter(value) { rejectCounter = value; },
  };
}

async function certificateRegression() {
  const algorithm = { name: "ECDSA", namedCurve: "P-256" };
  const signingAlgorithm = { name: "ECDSA", hash: "SHA-256" };
  const validity = { notBefore: new Date(Date.now() - 60_000), notAfter: new Date(Date.now() + 3_600_000) };
  async function ca(name) {
    const keys = await webcrypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
    const cert = await X509CertificateGenerator.createSelfSigned({ name, keys, signingAlgorithm, ...validity, extensions: [new BasicConstraintsExtension(true)] }, webcrypto);
    return { keys, cert };
  }
  async function leaf(issuer) {
    const keys = await webcrypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
    return X509CertificateGenerator.create({ subject: "CN=Authenticator", issuer: issuer.cert.subject, publicKey: keys.publicKey, signingKey: issuer.keys.privateKey, signingAlgorithm, ...validity }, webcrypto);
  }
  const trusted = await ca("CN=Trusted Root");
  const trustedLeaf = await leaf(trusted);
  const pem = (cert) => cert.toString("pem");
  assert.equal(await validateCertificatePath([pem(trustedLeaf)], [pem(trusted.cert)]), true);
  for (const name of ["CN=Attacker Root", "CN=Trusted Root"]) {
    const attacker = await ca(name);
    const forged = await leaf(attacker);
    await assert.rejects(validateCertificatePath([pem(forged), pem(attacker.cert)], [pem(trusted.cert)]), /chain|path/i);
  }
  await assert.rejects(validateCertificatePath([pem(trustedLeaf), pem(trusted.cert)], [pem(trusted.cert)]), /certificate path/i);
  console.log("PASS certificate trust-anchor regression: legitimate chain, attacker root, same-subject root, duplicate anchor");
}

function dependencyBoundary() {
  const lock = JSON.parse(readFileSync(resolve(root, "package-lock.json"), "utf8"));
  const copies = Object.entries(lock.packages).filter(([path, pkg]) => pkg.name === "@simplewebauthn/server" || path.endsWith("/@simplewebauthn/server"));
  assert.equal(copies.length, 1);
  assert.equal(copies[0][1].version, "13.3.2");
  assert.equal(copies[0][0], "node_modules/@terraqo/webauthn-server");
  assert.throws(() => require.resolve("@simplewebauthn/server"), { code: "MODULE_NOT_FOUND" });
  // Do not activate Auth's v9-only optional provider with the v13 alias.
  assert.doesNotMatch(readFileSync(resolve(root, "auth.ts"), "utf8"), /providers\/(?:passkey|webauthn)|enableWebAuthn/);
}

async function browserRegression() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", (route) => route.request().url() === `${origin}/`
      ? route.fulfill({ contentType: "text/html", body: "<!doctype html><title>Passkey compatibility fixture</title>" }) : route.abort());
    await page.goto(origin);
    await page.addScriptTag({ path: resolve(root, "node_modules/@simplewebauthn/browser/dist/bundle/index.umd.min.js") });
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("WebAuthn.enable");
    const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", { options: {
      protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true,
      isUserVerified: true, automaticPresenceSimulation: true,
    } });
    const register = (options) => page.evaluate((input) => window.SimpleWebAuthnBrowser.startRegistration(input), options);
    const authenticate = (options) => page.evaluate((input) => window.SimpleWebAuthnBrowser.startAuthentication(input), options);
    for (const [pathway, algorithm] of ["account", "worklog"].flatMap((pathway) => [-8, -7, -257].map((algorithm) => [pathway, algorithm]))) {
      const h = harness();
      const request = new Request(origin, { headers: { host: "localhost:3219" } });
      const registration = pathway === "account"
        ? await h.account.accountPasskeyRegistrationOptions(userId, request)
        : await h.field.createPasskeyRegistrationOptions({ userId, workspaceId, context });
      assert.equal(registration.options.user.id, userId, "Preserve v9 raw user ID wire format");
      assert.equal(registration.options.authenticatorSelection.userVerification, "required");
      assert.ok(registration.options.pubKeyCredParams.some((item) => item.alg === algorithm));
      registration.options.pubKeyCredParams = [{ type: "public-key", alg: algorithm }];
      const response = await register(registration.options);
      const registered = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
      assert.deepEqual(Buffer.from(registered.credentials[0].userHandle, "base64"), Buffer.from(userId, "utf8"), "Preserve actual resident user handle bytes, including non-ASCII IDs");
      const verifyRegistration = (value) => pathway === "account"
        ? h.account.verifyAccountPasskeyRegistration(userId, registration.challengeId, value)
        : h.field.verifyPasskeyRegistration({ userId, workspaceId, challengeId: registration.challengeId, response: value });
      const withoutUV = structuredClone(response);
      const attestation = isoCBOR.decodeFirst(Buffer.from(withoutUV.response.attestationObject, "base64url"));
      attestation.get("authData")[32] &= ~4;
      withoutUV.response.attestationObject = b64(isoCBOR.encode(attestation));
      await assert.rejects(verifyRegistration(withoutUV), /verification/i);
      assert.equal(h.state.credentials.length, 0);
      assert.equal(h.state.challenges[0].consumedAt, null);
      assert.equal((await verifyRegistration(response)).verified, true);
      assert.equal(h.state.credentials[0].credentialId, response.id);
      assert.ok(h.state.credentials[0].publicKey.length > 0);
      await assert.rejects(verifyRegistration(response), /venci|venció/i);
      // Existing persisted ID/key/counter bytes are reused without migration.
      const persisted = structuredClone(h.state.credentials[0]);
      const exclusion = pathway === "account"
        ? await h.account.accountPasskeyRegistrationOptions(userId, request)
        : await h.field.createPasskeyRegistrationOptions({ userId, workspaceId, context });
      assert.equal(exclusion.options.excludeCredentials[0].id, persisted.credentialId);
      const login = pathway === "account"
        ? await h.account.accountPasskeyLoginOptions(email, request)
        : await h.field.createWorklogValidationOptions({ userId, workspaceId, validationId: "validation", context });
      assert.equal(login.options.allowCredentials[0].id, persisted.credentialId);
      assert.equal(login.options.userVerification, "required");
      const assertion = await authenticate(login.options);
      assert.equal(assertion.response.userHandle, userId, "Browser v9 returns user handles as UTF-8 strings");
      const verify = (value, overrides = {}) => pathway === "account"
        ? h.account.verifyAccountPasskeyLogin(login.challengeId, value)
        : h.field.verifyWorklogValidation({ userId, workspaceId, challengeId: login.challengeId, response: value, ...overrides });
      const challenge = () => h.state.challenges.find((row) => row.id === login.challengeId);
      const before = () => ({ consumed: challenge().consumedAt, counter: h.state.credentials[0].counter, tokens: h.state.tokens.length, status: h.state.status });
      const pristine = before();
      const clientData = JSON.parse(Buffer.from(assertion.response.clientDataJSON, "base64url"));
      for (const replacement of [{ challenge: "wrong" }, { origin: "https://attacker.invalid" }]) {
        const invalid = structuredClone(assertion);
        invalid.response.clientDataJSON = b64(JSON.stringify({ ...clientData, ...replacement }));
        await assert.rejects(verify(invalid), /challenge|origin/i);
        assert.deepEqual(before(), pristine);
      }
      // Re-sign malformed authenticator data using the virtual credential's
      // real private key, so UV/RP/counter checks are tested independently of
      // invalid signatures. Keys remain ephemeral and are never printed.
      const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
      const virtual = credentials.find((item) => b64(Buffer.from(item.credentialId, "base64")) === assertion.id);
      const privateKey = createPrivateKey({ key: Buffer.from(virtual.privateKey, "base64"), format: "der", type: "pkcs8" });
      for (const mutate of [
        (data) => { data[32] &= ~4; },
        (data) => { data[0] ^= 1; },
        (data) => { data.writeUInt32BE(0, 33); },
      ]) {
        const invalid = structuredClone(assertion);
        const bytes = Buffer.from(invalid.response.authenticatorData, "base64url");
        mutate(bytes);
        invalid.response.authenticatorData = b64(bytes);
        invalid.response.signature = b64(sign(privateKey.asymmetricKeyType === "ed25519" ? null : "sha256", Buffer.concat([bytes, createHash("sha256").update(Buffer.from(invalid.response.clientDataJSON, "base64url")).digest()]), privateKey));
        // Counter=0 is valid for counterless authenticators only. Make this
        // stored credential nonzero before checking a counter rollback.
        const stored = h.state.credentials[0];
        const originalCounter = stored.counter;
        if (bytes.readUInt32BE(33) === 0) stored.counter = 1n;
        await assert.rejects(verify(invalid), /verification|RP ID|counter/i);
        stored.counter = originalCounter;
        assert.deepEqual(before(), pristine);
      }
      const badSignature = structuredClone(assertion);
      const signature = Buffer.from(badSignature.response.signature, "base64url");
      signature[signature.length - 1] ^= 1;
      badSignature.response.signature = b64(signature);
      await assert.rejects(verify(badSignature), /identidad/i);
      const owner = h.state.credentials[0].userId;
      h.state.credentials[0].userId = "other-user";
      await assert.rejects(verify(assertion), /cuenta/i);
      h.state.credentials[0].userId = owner;
      const expiry = challenge().expiresAt;
      challenge().expiresAt = new Date(0);
      await assert.rejects(verify(assertion), /venci|venció/i);
      challenge().expiresAt = expiry;
      if (pathway === "worklog") {
        await assert.rejects(verify(assertion, { workspaceId: "other-workspace" }), /workspace/i);
        challenge().purpose = "ATTENDANCE";
        await assert.rejects(verify(assertion), /vencio/i);
        challenge().purpose = "WORKLOG_VALIDATION";
      }
      assert.deepEqual(before(), pristine);
      h.rejectCounter(true);
      await assert.rejects(verify(assertion), /reciente/i);
      assert.deepEqual(before(), pristine, "Failed counter CAS rolls back challenge consumption");
      h.rejectCounter(false);
      const result = await verify(assertion);
      assert.ok(challenge().consumedAt);
      assert.ok(h.state.credentials[0].counter > persisted.counter);
      assert.deepEqual(Buffer.from(h.state.credentials[0].publicKey), Buffer.from(persisted.publicKey));
      if (pathway === "account") {
        assert.equal(result.email, email);
        assert.equal(h.state.tokens.length, 1);
      } else {
        assert.equal(result.verified, true);
        assert.equal(h.state.status, "APPROVED");
        assert.equal(h.state.evidence, "CONFIRMED");
      }
      await assert.rejects(verify(assertion), /venci|venció/i);
      console.log(`PASS ${pathway} algorithm ${algorithm}: browser v9 + server v13 registration/authentication, persisted bytes, UV, RP, origin, challenge, signature, counter, ownership, expiry, replay and rollback`);
      await cdp.send("WebAuthn.clearCredentials", { authenticatorId });
    }
  } finally { await browser.close(); }
}

dependencyBoundary();
// Auth core and all configured providers must still load with the optional v9
// server absent. This does not enable Auth's unused WebAuthn provider.
await Promise.all(["@auth/core", "next-auth", "next-auth/providers/credentials", "next-auth/providers/google", "next-auth/providers/apple", "next-auth/providers/microsoft-entra-id", "@auth/prisma-adapter"].map((name) => import(name)));
assert.ok(existsSync(resolve(root, "node_modules/@terraqo/webauthn-server/script/index.js")));
await certificateRegression();
await browserRegression();
console.log("PASS isolated WebAuthn dependency and configured Auth provider imports");
