import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import bcrypt from "bcryptjs";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { prisma } from "../lib/prisma";

const origin = "https://portal.terraqoglobal.com", local = "http://127.0.0.1:3878", path = "/perfil";
const deployed = process.env.TERRAQO_PROFILE_DEPLOYED === "1";
let phase = "preflight";
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS, "icc-topografia:20616116313");
  const workspace = await prisma.terraqoWorkspace.findFirstOrThrow({ where: { slug: "icc-topografia", active: true, deletedAt: null,
    companies: { some: { document: "20616116313", deletedAt: null } } }, select: { id: true } });
  if (deployed) {
    const preflight = await fetch(origin + path, { redirect: "manual", signal: AbortSignal.timeout(30000) });
    const location = preflight.headers.get("location"); await preflight.body?.cancel();
    assert.ok([302,303,307,308].includes(preflight.status) && location && new URL(location,origin).pathname === "/cuenta");
  }
  const server = deployed ? undefined : spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3878"], {
    env: { ...process.env, NODE_ENV: "production", AUTH_TRUST_HOST: "true", AUTH_URL: origin, NEXTAUTH_URL: origin }, stdio: "ignore", windowsHide: true,
  });
  let browser: Browser | undefined;
  const users: string[] = [];
  try {
    for (let attempt=0; !deployed && attempt<60; attempt++) {
      try { if ((await fetch(local + "/api/health")).ok) break; } catch { /* own server warming */ }
      if (attempt===59) throw Error("Own process unavailable");
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    browser=await chromium.launch({headless:true});
    await mkdir("output/playwright/profile-messages",{recursive:true});
    for (const viewport of [{width:390,height:844},{width:1024,height:900}]) {
      phase=`own-fixture-${viewport.width}`;
      const email=`profile-messages-${randomUUID()}@example.test`, password=randomBytes(24).toString("hex");
      const username=`drawer-${randomBytes(12).toString("hex")}`;
      const user=await prisma.user.create({data:{email,name:"Prueba propia de perfil",role:"CUSTOMER",emailVerified:new Date(),passwordHash:await bcrypt.hash(password,12),
        terraqoMemberships:{create:{workspaceId:workspace.id,role:"PROFESSIONAL",active:true}},terraqoProfessionalProfile:{create:{username,liveCvEnabled:false}}},select:{id:true}});
      users.push(user.id);
      const context=await browser.newContext({viewport});
      const writeRoutes: string[]=[];
      await context.route(origin+"/**",async route=>{
        try {
          const request=route.request(),url=new URL(request.url());
          if (!["GET","HEAD"].includes(request.method())) {writeRoutes.push(url.pathname);await route.abort("blockedbyclient");return;}
          const response=await route.fetch(deployed?{maxRedirects:0}:{url:local+url.pathname+url.search,headers:{...request.headers(),host:new URL(local).host,"x-forwarded-host":new URL(origin).host,"x-forwarded-proto":"http"},maxRedirects:0});
          const headers={...response.headers()};delete headers["content-encoding"];delete headers["content-length"];
          await route.fulfill({response,headers,body:await response.body()});
        } catch {await route.abort("failed").catch(()=>undefined);}
      });
      try {
        await login(context,email,password);
        const page=await context.newPage();
        phase=`profile-${viewport.width}`;
        await page.goto(origin+path);
        const card=page.getByRole("heading",{name:"Estado del perfil",exact:true}).locator("..").locator("..");
        await card.waitFor();
        const alias=card.getByText("@"+username,{exact:true});await alias.scrollIntoViewIfNeeded();
        async function unobscured() {
          assert.ok(await alias.evaluate(el=>{const b=el.getBoundingClientRect();const hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return !!hit&&(el===hit||el.contains(hit))&&b.left>=0&&b.right<=innerWidth;}));
        }
        await unobscured();
        await card.screenshot({path:`output/playwright/profile-messages/profile-${viewport.width}.png`});
        await page.evaluate(()=>window.scrollTo(0,0));
        const opener=page.getByRole("button",{name:/^Abrir mensajes/});assert.equal(await opener.count(),1);
        const size=await opener.boundingBox();assert.ok(size&&size.width>=44&&size.height>=44);
        await opener.focus();await page.keyboard.press("Enter");
        const dialog=page.getByRole("dialog",{name:"Mensajes",exact:true});await dialog.waitFor();
        const close=dialog.getByRole("button",{name:"Cerrar mensajes",exact:true});
        assert.ok(await close.evaluate(el=>el===document.activeElement));
        await page.keyboard.press("Shift+Tab");assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));
        for(let i=0;i<12;i++){await page.keyboard.press("Tab");assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));}
        await dialog.screenshot({path:`output/playwright/profile-messages/drawer-${viewport.width}.png`});
        await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});await page.waitForTimeout(250);assert.ok(await opener.evaluate(el=>el===document.activeElement));
        await opener.click();await dialog.waitFor();await close.click();await dialog.waitFor({state:"hidden"});await page.waitForTimeout(250);
        assert.ok(await opener.evaluate(el=>el===document.activeElement));
        await page.evaluate(()=>{document.documentElement.style.fontSize="32px";});
        await alias.scrollIntoViewIfNeeded();await unobscured();
        await card.screenshot({path:`output/playwright/profile-messages/profile-text200-${viewport.width}.png`});
        phase=`no-write-check-${viewport.width}`;
        // Existing presence/field-verification background requests are blocked
        // too: this proof never delivers browser POSTs or records attendance.
        assert.ok(writeRoutes.every(route=>["/api/auth/presence","/api/terraqo/field-verification"].includes(route)));
        const profile=await prisma.terraqoProfessionalProfile.findUniqueOrThrow({where:{userId:user.id},select:{liveCvEnabled:true}});assert.equal(profile.liveCvEnabled,false);
        console.log(`PASS own profile/messages ${viewport.width}: full alias, single header entry, keyboard/focus/Escape/click close, text200%, no delivered browser POST/CV/messages/attendance writes.`);
      } finally {await context.close();}
    }
  } finally {
    await browser?.close().catch(()=>undefined);server?.kill();
    for(const id of users){
      await prisma.verificationToken.deleteMany({where:{identifier:{in:[`web-cv-session:${id}`,`portal-session:${workspace.id}:${id}`,`portal-login-attempt:${workspace.id}:${id}`]}}});
      await prisma.user.delete({where:{id}});assert.equal(await prisma.user.count({where:{id}}),0);
    }
    console.log("CLEANUP exclusively own new profile/users/memberships/grants and owned local browser/process; no messages/dispatch/financial operations.");
  }
}
async function login(context: BrowserContext, email: string, password: string) {
  const jar = new Map<string, string>();
  const send = async (path: string, init: RequestInit = {}) => {
    const response = await fetch((deployed ? origin : local) + path, { ...init, redirect: "manual", headers: {
      host: new URL(origin).host, origin, cookie: [...jar].map(([key, value]) => `${key}=${value}`).join("; "), ...init.headers,
    } });
    for (const item of response.headers.getSetCookie()) {
      const pair = item.split(";", 1)[0], index = pair.indexOf("=");
      if (index > 0) jar.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  };
  phase = "login-csrf";
  const csrf = await (await send("/api/auth/csrf")).json();
  phase = "login-callback";
  const response = await send("/api/auth/callback/credentials", { method: "POST", headers: {
    "content-type": "application/x-www-form-urlencoded", "x-auth-return-redirect": "1",
  }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, password, callbackUrl: origin + path }) });
  assert.equal(response.status, 200); await response.body?.cancel();
  assert.ok([...jar.keys()].some(key => key.startsWith("__Secure-authjs.session-token")));
  await context.addCookies([...jar].map(([name, value]) => ({ name, value, url: origin, secure: true, httpOnly: true, sameSite: "Lax" as const })));
  jar.clear();
}
main().catch(error=>{if(error instanceof assert.AssertionError) console.error(error.message);console.error(`Profile/messages proof failed at ${phase}; private diagnostics suppressed.`);process.exitCode=1;}).finally(()=>prisma.$disconnect());
