import { verifyAuthenticatedAttention } from "./test-customer-attention-authenticated";
import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn, execFile } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

export async function verifyChatHttp(db: PrismaClient, workspace: { id: string; slug: string }, other: { id: string; slug: string }) {
  assert.equal(process.env.TERRAQO_LOCAL_ATTENTION_TEST, "synthetic-only");
  await db.terraqoWorkspaceModule.createMany({ data: [workspace, other].map(w => ({ workspaceId: w.id, code: "CUSTOMER_CHAT", active: true })) });
  const source = await db.terraqoWorkspace.findUniqueOrThrow({ where: { id: workspace.id }, select: { settings: true } });
  await db.terraqoWorkspace.update({ where: { id: other.id }, data: { settings: source.settings! } });
  const probe = createServer();
  await new Promise<void>(resolve => probe.listen(0, "127.0.0.1", resolve));
  const address = probe.address(); assert.ok(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>(resolve => probe.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [path.resolve("node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { env: { ...process.env, AUTH_TRUST_HOST: "true", NEXT_TELEMETRY_DISABLED: "1", NEXT_PUBLIC_SITE_URL: origin }, windowsHide: true, stdio: "ignore" });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 60; attempt++) {
      try { if ((await fetch(`${origin}/api/chat/config?workspace=${workspace.slug}`, { signal: AbortSignal.timeout(1500) })).status === 200) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.ok(ready, "Local Next HTTP server did not become ready");
    for (const company of [workspace, other]) {
      const page = await fetch(`${origin}/atencion/${company.slug}`);
      assert.equal(page.status, 200, "Published company contact page must be reachable");
      const html = await page.text();
      assert.ok(html.includes("Habla con"));
      assert.ok(!html.includes("Private HTTP fixture"));
    }
    assert.equal((await fetch(`${origin}/atencion/nonexistent-company-fixture`)).status, 404);
    const endpoint = `${origin}/api/chat?workspace=${workspace.slug}`;
    const operationKey = randomUUID();
    const submit = () => { const form = new FormData(); form.set("name", "HTTP fixture"); form.set("body", "Private HTTP fixture"); form.set("operationKey", operationKey); return fetch(endpoint, { method: "POST", headers: { "x-chat-protocol": "2" }, body: form }); };
    const first = await submit(); assert.equal(first.status, 201);
    const data = await first.json(); assert.ok(data.accessToken);
    const replay = await submit(); assert.equal((await replay.json()).conversationId, data.conversationId);
    const history = `${endpoint}&conversationId=${data.conversationId}`;
    assert.equal((await fetch(history)).status, 401);
    assert.equal((await fetch(history, { headers: { "x-chat-access": `${data.accessToken}altered` } })).status, 401);
    const authorized = await fetch(history, { headers: { "x-chat-access": data.accessToken } });
    assert.equal(authorized.status, 200); assert.equal(authorized.headers.get("cache-control"), "no-store");
    const result = await authorized.json(); assert.equal(result.conversation.messages.length, 1); assert.equal("customerEmail" in result.conversation, false);
    assert.equal((await fetch(`${origin}/api/chat?workspace=${other.slug}&conversationId=${data.conversationId}`, { headers: { "x-chat-access": data.accessToken } })).status, 401);
    const published = await fetch(`${origin}/api/chat/config?workspace=${workspace.slug}`); assert.equal(published.status, 200);
    assert.equal("domains" in (await published.json()).config, false);
    assert.equal((await fetch(`${origin}/api/chat/config?workspace=${workspace.slug}`, { headers: { origin: "https://unapproved.example" } })).status, 403);
    const allowedConfig = await fetch(`${origin}/api/chat/config?workspace=${workspace.slug}`, { headers: { origin: "https://company.example" } });
    assert.equal(allowedConfig.status, 200);
    assert.equal(allowedConfig.headers.get("access-control-allow-origin"), "https://company.example");
    assert.equal(allowedConfig.headers.get("access-control-allow-credentials"), null);
    const deniedConfig = await fetch(`${origin}/api/chat/config?workspace=${workspace.slug}`, { headers: { origin: "https://evil.example" } });
    assert.equal(deniedConfig.status, 403); assert.equal(deniedConfig.headers.get("access-control-allow-origin"), null);
    assert.equal((await fetch(history, { headers: { "x-chat-access": data.accessToken } })).headers.get("access-control-allow-origin"), null);
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.route(`${origin}/servicios`, route => route.fulfill({ contentType: "text/html", body: `<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Servicios de prueba</h1><script defer src="/terraqo-attention.js" data-workspace="${workspace.slug}"></script><script defer src="/terraqo-attention.js" data-workspace="${workspace.slug}"></script></body></html>` }));
      await page.goto(`${origin}/servicios`);
      const launcher = page.locator(`#terraqo-contact-${workspace.slug}`);
      await launcher.getByRole("link").waitFor();
      assert.equal(await launcher.count(), 1);
      assert.equal(await launcher.evaluate(e => getComputedStyle(e).left), "20px");
      assert.equal(await launcher.getByRole("link").getAttribute("rel"), "noopener noreferrer");
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.evaluate(() => window.history.pushState({}, "", "/servicios-ajenos"));
      await launcher.waitFor({ state: "hidden" });
      await page.evaluate(() => window.history.pushState({}, "", "/servicios/topografia"));
      await launcher.waitFor({ state: "visible" });
      await page.screenshot({ path: "output/customer-attention-install-mobile.png", fullPage: true });
      const popupPromise = page.waitForEvent("popup");
      await launcher.getByRole("link").click();
      const popup = await popupPromise; await popup.waitForLoadState("domcontentloaded");
      await popup.getByRole("heading", { name: /Habla con/ }).waitFor();
      assert.equal(await popup.evaluate(() => window.opener === null), true);
      await popup.close();
      console.log("PASS browser installation: single launcher, left position, mobile width, SPA page filters and isolated attention tab.");
    } finally { await browser.close(); }
    const chunked = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(41000)); controller.close(); } });
    const oversized = await fetch(endpoint, { method: "POST", headers: { "content-type": "multipart/form-data; boundary=test" }, body: chunked, duplex: "half" } as RequestInit);
    assert.equal(oversized.status, 413);
    const botReply = await fetch(`${origin}/api/chatbot?workspace=${workspace.slug}`, { method: "POST", headers: { "content-type": "application/json", "x-chat-protocol": "2" }, body: JSON.stringify({ question: "Quiero un asesor", operationKey: randomUUID() }) });
    assert.equal(botReply.status, 200);
    const handoff = await botReply.json(); assert.ok(handoff.accessToken); assert.ok(handoff.botAccessToken);
    assert.equal((await fetch(`${endpoint}&conversationId=${handoff.escalatedChatId}`, { headers: { "x-chat-access": handoff.accessToken } })).status, 200);
    // The installer checks above used a published clone. Start the owner onboarding
    // check from a fresh configuration in this disposable synthetic workspace.
    await db.terraqoWorkspace.update({ where: { id: other.id }, data: { settings: {} } });
    await verifyAuthenticatedAttention(db, origin, workspace.id, other.id);
    console.log("PASS live loopback HTTP: v2 access, replay, tenant boundary, published-only config, origin rejection, bounded chunked body and bot handoff.");
  } finally {
    if (server.pid && server.exitCode === null) {
      if (process.platform === "win32") await new Promise<void>(resolve => execFile("taskkill", ["/pid", String(server.pid), "/t", "/f"], { windowsHide: true }, () => resolve()));
      else server.kill("SIGTERM");
    }
  }
}
