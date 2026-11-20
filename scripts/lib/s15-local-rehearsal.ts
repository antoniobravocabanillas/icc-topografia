import assert from "node:assert/strict";
import { spawn, spawnSync, execFile } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, open, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
const exec = promisify(execFile);
async function port() {
  const probe = createServer();
  await new Promise<void>((resolve, reject) => probe.on("error", reject).listen(0, "127.0.0.1", resolve));
  const address = probe.address();
  assert.ok(address && typeof address === "object");
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function rehearse() {
  assert.ok(process.argv.includes("--confirm=local-s15-only"), "Explicit disposable local confirmation required");
  const root = process.cwd();
  const s16Controls = process.argv.includes("--s16-controls");
  const s16Page = process.argv.includes("--s16-page-only");
  const s17Provenance = process.argv.includes("--s17-provenance");
  assert.ok(!s17Provenance || s16Controls, "S17 provenance requires the authenticated S16 controls journey");
  assert.ok(!(s16Page && (s16Controls || process.argv.includes("--route-only"))), "Choose one local journey");
  assert.ok(!(s16Controls && process.argv.includes("--route-only")), "Choose one local journey");
  let provenanceGuards: string | undefined;
  if (s17Provenance) {
    // Exact reviewed proposal only; neither arbitrary SQL nor a migration input is accepted.
    const proposed = await readFile(path.join(root, "docs/work-documented/proposals/s17-accepted-proposal-provenance.proposed.sql"));
    assert.equal(createHash("sha256").update(proposed).digest("hex"),
      "3a0352368d496ad59a1e9a3064da4c3d3badd6543aaf4a3c694e3b12ef273326", "S17 proposed SQL changed; review before installing guards");
    const sql = proposed.toString("utf8");
    provenanceGuards = sql.slice(sql.indexOf("CREATE FUNCTION icc.s17_require_serializable()"), sql.lastIndexOf("ROLLBACK;"));
    assert.equal((provenanceGuards.match(/^CREATE FUNCTION /gm) || []).length, 7);
    assert.equal((provenanceGuards.match(/^CREATE TRIGGER /gm) || []).length, 6);
    assert.ok(!/^(ALTER TABLE|CREATE INDEX|COMMIT|ROLLBACK|BEGIN;)/m.test(provenanceGuards));
    // Generated client and dependencies belong to this worktree; never generate through a shared junction.
    for (const name of ["node_modules", "node_modules/.prisma/client", "node_modules/@prisma/client"])
      assert.equal(await realpath(path.join(root, name)), path.join(await realpath(root), name));
    const generated = await readFile(path.join(root, "node_modules/.prisma/client/schema.prisma"), "utf8");
    assert.match(generated, /acceptedProposalId\s+String\?/);
    assert.match(generated, /@relation\("TerraqoClosureAcceptedProposal", fields: \[acceptedProposalId\], references: \[id\], onDelete: Restrict, onUpdate: Restrict\)/);
  }
  const candidate = (await exec("git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true })).stdout.trim();
  assert.match(candidate, /^[a-f0-9]{40}$/);
  const local = await mkdtemp(path.join(os.tmpdir(), "terraqo-s15-"));
  const app = path.join(local, "app"), data = path.join(local, "pg");
  const pgPort = await port(), webPort = await port();
  const host = "http://127.0.0.1:" + webPort, secret = randomBytes(24).toString("hex");
  const url = "postgresql://terraqo_s22_test:" + secret + "@127.0.0.1:" + pgPort + "/postgres?schema=icc";
  const run = randomUUID();
  const env: NodeJS.ProcessEnv = { NODE_ENV: "development", S15_LOCAL_MEDIA_DIRECTORY: path.join(app, ".next", "local-media"), S22_STAGING_CANDIDATE_SHA: candidate, PLATFORM_STAGING_S24_BLOB_RUN: run, DATABASE_URL: url, DIRECT_URL: url, AUTH_URL: host, AUTH_TRUST_HOST: "true",
    NEXT_PUBLIC_SITE_URL: host, NEXT_PUBLIC_PORTAL_URL: host, NEXT_TELEMETRY_DISABLED: "1", AUTH_SECRET: randomBytes(32).toString("hex"),
    TERRAQO_TRANSACTIONAL_EMAIL_ENABLED: "false", TERRAQO_LOCAL_S22_TEST: "synthetic-only", TERRAQO_WORKSPACE_INVITATIONS_V1: "true",
    TERRAQO_WORKSPACE_PUBLICATION_V1: "true", TERRAQO_WORK_CASES_V1: "true", TERRAQO_SCOPED_SHARING_V1: "true",
    S15_STAGING_CONVERSATION_GATE: "conversation", TERRAQO_CONTEXTUAL_MESSAGING_V1: "true", TERRAQO_COLLABORATION_V1: "true", TERRAQO_CLOSURE_V1: "true", TERRAQO_EVIDENCE_ANALYSIS_V1: "false", TERRAQO_EVIDENCE_ANALYSIS_PROVIDER: "off", TERRAQO_DISCOVERY_NEEDS_V1: "true", TERRAQO_NEED_SUGGESTIONS_PROVIDER: "local", TERRAQO_B5_PILOT_WORKSPACE_IDS: "s13-need-" + candidate.slice(0, 16) };
  for (const [key, value] of Object.entries(process.env))
    if (/^(path|systemroot|windir|temp|tmp|home|userprofile|appdata|localappdata|comspec|pathext|programfiles.*|programdata|playwright_browsers_path)$/i.test(key)) env[key] = value;
  if (s16Controls) Object.assign(env, {
    S16_COLLABORATION_GATE: "synthetic-only", S16_ORIGIN: host,
    S16_EXCLUSIVE_FIXTURE_WORKSPACE: "s13-need-" + candidate.slice(0, 16),
  });
  const bin = process.env.PG_BIN || (process.platform === "win32" ? "C:/Program Files/PostgreSQL/18/bin" : "");
  const pg = (name: string, args: string[]) => exec(path.join(bin, name), args, { env, windowsHide: true, timeout: 60000 });
  const log = await open(path.join(local, "server.log"), "w");
  let next: ReturnType<typeof spawn> | undefined, started = false;
  try {
    const pw = path.join(local, "pw");
    await writeFile(pw, secret, { mode: 0o600 });
    await pg("initdb", ["-D", data, "-U", "terraqo_s22_test", "-A", "scram-sha-256", "--pwfile", pw, "--encoding=UTF8", "--no-sync"]);
    await rm(pw);
    // A detached Windows postmaster must not inherit execFile's output pipes.
    const boot = spawnSync(path.join(bin, "pg_ctl"), ["-D", data, "-l", path.join(local, "pg.log"),
      "-o", "-h 127.0.0.1 -p " + pgPort, "-w", "start"], { env, stdio: "ignore", windowsHide: true, timeout: 60000 });
    assert.equal(boot.status, 0, "Loopback PostgreSQL failed to start");
    started = true;
    // Initialize only this newly created loopback cluster from the existing schema; no migration files or remote DB.
    await exec(process.execPath, ["node_modules/prisma/build/index.js", "db", "push", "--skip-generate", "--schema", "prisma/schema.prisma"], { cwd: root, env, windowsHide: true });
    if (provenanceGuards) {
      // psql receives only our generated loopback target and credentials, never inherited PG settings.
      const psql = (args: string[]) => exec(path.join(bin, "psql"), ["-X", "-h", "127.0.0.1", "-p", String(pgPort),
        "-U", "terraqo_s22_test", "-d", "postgres", "-v", "ON_ERROR_STOP=1", ...args],
        { cwd: local, env: { ...env, PGPASSWORD: secret }, windowsHide: true, timeout: 60_000 });
      const identity = await psql(["-At", "-c", "SELECT json_build_object('host',host(inet_server_addr()),'port',inet_server_port(),'data',current_setting('data_directory'),'listeners',current_setting('listen_addresses'),'role',current_user,'database',current_database())"]);
      assert.deepEqual(JSON.parse(identity.stdout.trim()), { host: "127.0.0.1", port: pgPort,
        data: data.replaceAll("\\", "/"), listeners: "127.0.0.1", role: "terraqo_s22_test", database: "postgres" });
      const guardsFile = path.join(local, "s17-guards.sql");
      await writeFile(guardsFile, "BEGIN;\nSET LOCAL lock_timeout = '5s';\nSET LOCAL statement_timeout = '30s';\n" + provenanceGuards + "\nCOMMIT;\n");
      await psql(["-f", guardsFile]);
      const active = await psql(["-At", "-c", "SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='icc' AND t.tgname LIKE 's17_%' AND t.tgenabled='O'"]);
      assert.equal(active.stdout.trim(), "6", "All six S17 guards must be active");
      console.log("S17_PROVENANCE guards=6 enabled=O identity=own-loopback proposal_sha256=3a0352368d496ad59a1e9a3064da4c3d3badd6543aaf4a3c694e3b12ef273326");
    }
    await mkdir(app);
    for (const name of ["app","lib","components","types","services","emails","auth.ts","middleware.ts","next.config.ts",
      "tsconfig.json","package.json","tailwind.config.ts","postcss.config.js"])
      await cp(path.join(root, name), path.join(app, name), { recursive: true });
    for (const name of ["node_modules", "public"])
      await symlink(path.join(root, name), path.join(app, name), process.platform === "win32" ? "junction" : "dir");
    next = spawn(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(webPort)],
      { cwd: app, env, stdio: ["ignore", log.fd, log.fd], windowsHide: true });
    for (let i = 0; i < 90; i++) {
      assert.equal(next.exitCode, null);
      try { if ((await fetch(host + "/api/auth/csrf", { signal: AbortSignal.timeout(15000) })).ok) break; } catch { /* cold start */ }
      assert.ok(i < 89, "Loopback app did not start");
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const { pathToFileURL } = await import("node:url");
    const { s24BlobFixtures } = await import(pathToFileURL(path.join(root,"scripts/lib/s24-blob-fixtures.mjs")).href);
    for (const blob of s24BlobFixtures(run).flat()) {
      for (const store of ["terraqo-worklog-evidence", "terraqo-message-attachments"]) {
        const file = path.join(app, ".next/local-media", store, blob.key);
        await mkdir(path.dirname(file), { recursive: true });
        await writeFile(file, blob.bytes, { flag: "wx" });
      }
    }
    const routeOnly = process.argv.includes("--route-only");
    const invocation = s16Page
      ? "require(\"./scripts/verify-s16-closure-page.ts\").verifyS16ClosurePage()"
      : s16Controls
      ? "require(\"./scripts/verify-s16-collaboration.ts\").verifyS16Collaboration()"
      : (routeOnly ? "require(\"./scripts/verify-workspace-messaging-route.ts\").verifyWorkspaceMessagingRoute" : "require(\"./scripts/verify-s15-conversation.ts\").rehearseS15Conversation") + "(process.env.AUTH_URL,process.env.S22_STAGING_CANDIDATE_SHA)";
    const test = spawn(process.execPath, ["--import", "tsx", "-e", invocation + ".then(console.log).catch(e=>{console.error(e.stack);process.exitCode=1;})"],
      { cwd: root, env, stdio: "inherit", windowsHide: true });
    const code = await new Promise<number | null>((resolve, reject) => test.on("error", reject).once("exit", resolve));
    assert.equal(code, 0, s16Page ? "Loopback S16 page prerequisite failed" : s16Controls ? "Loopback S16 controls failed" : "Loopback S15 journey failed");
  } finally {
    try {
      if (next?.pid && next.exitCode === null && next.signalCode === null) {
        if (process.platform === "win32") {
          // taskkill can return 255 while Node is still delivering the process exit event.
          const exited = new Promise<void>(resolve => next!.once("exit", () => resolve()));
          try { await exec("taskkill", ["/PID", String(next.pid), "/T", "/F"], { windowsHide: true }); }
          catch (error) {
            let deadline: NodeJS.Timeout | undefined;
            try {
              await Promise.race([exited, new Promise<never>((_, reject) => {
                deadline = setTimeout(() => reject(error), 8000);
              })]);
            } finally { clearTimeout(deadline); }
          }
          await exited;
        }
        else next.kill("SIGTERM");
      }
    } finally {
      if (started) await pg("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"]);
      await log.close();
      assert.equal(path.dirname(local), path.resolve(os.tmpdir()));
      if (process.env.S15_KEEP_LOCAL_DIAGNOSTICS === "true") console.log("S15_LOCAL_DIAGNOSTICS", local);
      else await rm(local, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    }
  }
  console.log(s16Page ? "PASS S16 page prerequisite and cleanup; full phase validation still pending" : s16Controls ? "PASS S16 local controls and cleanup; full phase validation still pending" : "PASS S15 local PostgreSQL, Next.js, Chromium and fixture cleanup");
}

rehearse().catch(error => {
  // Local diagnostics show assertion locations without including credentials or response bodies.
  const location = error instanceof Error ? error.stack?.split("\n").filter(line => /\bat .*s15-/.test(line)).slice(0, 3) : [];
  const diagnostic = error as NodeJS.ErrnoException & { actual?: unknown; expected?: unknown; cmd?: string };
  console.error("S15 local rejected", { location, code: diagnostic.code, syscall: diagnostic.syscall,
    command: diagnostic.cmd?.split(" ")[0]?.split(/[\\/]/).pop(),
    actual: typeof diagnostic.actual === "number" ? diagnostic.actual : undefined,
    expected: typeof diagnostic.expected === "number" ? diagnostic.expected : undefined });
  process.exitCode = 1;
});
