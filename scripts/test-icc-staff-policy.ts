import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import {randomBytes,randomUUID} from "node:crypto";
import {encode} from "next-auth/jwt";
import {prisma} from "../lib/prisma";
let phase="fixture";
const origin="https://admin.terraqoglobal.com";
function decode(value:string) {return value.replace(/&quot;/g,'"').replace(/&#x27;|&#39;/g,"'").replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">");}
function ownForm(html:string,id:string) {
  const form=[...html.matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)].find(item=>item[1].includes(`data-policy-profile="${id}"`));
  assert.ok(form,"Own policy form is present");
  const data=new FormData();
  for(const input of form[2].matchAll(/<input\b[^>]*>/g)) {
    const name=input[0].match(/\bname="([^"]*)"/)?.[1], value=input[0].match(/\bvalue="([^"]*)"/)?.[1];
    if(name && !input[0].includes('type="checkbox"')) data.append(decode(name),decode(value??""));
  }
  assert.ok([...data.keys()].some(key=>key.startsWith("$ACTION_")));assert.ok(data.get("version"));
  data.set("commissionType","FIXED_AMOUNT");data.set("commissionRate","5");data.set("fixedCommission","7.23");data.set("monthlyGoal","1000.10");
  data.set("commissionCurrency","PEN");data.set("department","SALES");data.set("active","on");
  return data;
}
async function main() {
  assert.equal(process.env.TERRAQO_MUTATING_TESTS,"icc-topografia:20616116313");
  assert.ok(process.env.AUTH_SECRET);
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({where:{slug:"icc-topografia",active:true,deletedAt:null,companies:{some:{document:"20616116313",deletedAt:null}}},select:{id:true}});
  const run=randomUUID(), id=`test-staff-policy-${run}`, email=`staff-policy-${run}@example.test`;
  const password=randomBytes(24).toString("hex");
  let userId:string|undefined;
  try {
    const user=await prisma.user.create({data:{email,name:"Validación temporal de política comercial",role:"ADMIN",emailVerified:new Date(),passwordHash:await bcrypt.hash(password,10),
      terraqoMemberships:{create:{workspaceId:workspace.id,role:"ADMIN",active:true}}},select:{id:true}});
    userId=user.id;
    await prisma.staffProfile.create({data:{id,terraqoWorkspaceId:workspace.id,displayName:"Validación temporal comercial",roleTitle:"Pruebas",department:"SALES",
      active:true,tools:{privatePreserved:"fixture",commissionCurrency:"PEN"},commissionType:"FIXED_AMOUNT",fixedCommission:"7.23",commissionRate:"5",monthlyGoal:"1000.10"}});
    const cookieName="__Secure-authjs.session-token";
    // A ten-minute test session belongs only to our disposable account; no customer session is reused.
    const session=await encode({secret:process.env.AUTH_SECRET!,salt:cookieName,maxAge:600,token:{sub:user.id,role:"ADMIN",name:"Validación temporal",email}});
    const headers={Cookie:`${cookieName}=${session}; terraqo_admin_workspace=${workspace.id}`,Origin:origin};
    const get=async(path:string)=>{const response=await fetch(origin+path,{headers,redirect:"manual",cache:"no-store"});assert.equal(response.status,200);return response.text();};
    const post=(path:string,form:FormData)=>fetch(origin+path,{method:"POST",headers,body:form,redirect:"manual"});
    phase="protected-sales-form";
    const initial=await get("/admin/ventas"), invalid=ownForm(initial,id);invalid.set("commissionCurrency","");
    let response=await post("/admin/ventas",invalid);assert.equal(response.status,303);assert.match(response.headers.get("location")??"",/policy=review/);
    const before=await prisma.staffProfile.findUniqueOrThrow({where:{id}});
    assert.equal(before.fixedCommission.toFixed(2),"7.23");
    assert.equal(await prisma.activityLog.count({where:{entityType:"StaffProfile",entityId:id}}),0);
    phase="concurrent-policy-save";
    const commandA=ownForm(initial,id),commandB=ownForm(initial,id);commandA.set("fixedCommission","8.23");commandB.set("fixedCommission","9.23");
    const results=await Promise.allSettled([post("/admin/ventas",commandA),post("/admin/ventas",commandB)]);
    assert.equal(results.filter(item=>item.status==="fulfilled" && item.value.status===303 && item.value.headers.get("location")?.includes("policy=saved")).length,1);
    assert.equal(results.filter(item=>item.status==="fulfilled" && item.value.status===303 && item.value.headers.get("location")?.includes("policy=conflict")).length,1);
    const after=await prisma.staffProfile.findUniqueOrThrow({where:{id}});assert.ok(["8.23","9.23"].includes(after.fixedCommission.toFixed(2)));
    assert.equal((after.tools as {privatePreserved:string}).privatePreserved,"fixture");
    assert.equal(await prisma.activityLog.count({where:{entityType:"StaffProfile",entityId:id}}),1);
    phase="protected-team-save";
    const team=await get("/admin/equipo"), teamForm=ownForm(team,id);teamForm.set("commissionCurrency","USD");teamForm.set("checklist","Comprobar alcance");
    response=await post("/admin/equipo",teamForm);assert.equal(response.status,303);assert.match(response.headers.get("location")??"",/policy=saved/);
    const updated=await prisma.staffProfile.findUniqueOrThrow({where:{id}});assert.equal((updated.tools as {commissionCurrency:string}).commissionCurrency,"USD");
    assert.equal((updated.tools as {privatePreserved:string}).privatePreserved,"fixture");assert.equal(updated.fixedCommission.toFixed(2),"7.23");
    response=await post("/admin/equipo",teamForm);assert.equal(response.status,303);assert.match(response.headers.get("location")??"",/policy=conflict/);
    assert.equal(await prisma.activityLog.count({where:{entityType:"StaffProfile",entityId:id}}),2);
    if(process.env.TEST_STAFF_BROWSER === "1") {
      phase="browser-policy-feedback";
      const {chromium}=await import("playwright");
      const {mkdir}=await import("node:fs/promises");
      await mkdir("output/staff-policy",{recursive:true});
      phase="browser-launch";
      const browser=await chromium.launch({headless:true, env:Object.fromEntries(["PATH","SystemRoot","WINDIR","USERPROFILE","LOCALAPPDATA","TEMP","TMP"].flatMap(key=>process.env[key] ? [[key,process.env[key]!]] : []))});
      try {
        const context=await browser.newContext();
        await context.addCookies([{name:cookieName,value:session,domain:"admin.terraqoglobal.com",path:"/",secure:true,httpOnly:true,sameSite:"Lax"},
          {name:"terraqo_admin_workspace",value:workspace.id,domain:"admin.terraqoglobal.com",path:"/",secure:true,sameSite:"Lax"}]);
        if(process.env.TEST_STAFF_CREDENTIAL_LOGIN === "1") {
          phase="web-credential-login";
          await context.clearCookies();
          const csrfResponse=await context.request.get(origin+"/api/auth/csrf");assert.equal(csrfResponse.status(),200);
          const {csrfToken}=await csrfResponse.json();assert.equal(typeof csrfToken,"string");
          const login=await context.request.post(origin+"/api/auth/callback/credentials",{form:{csrfToken,email,password,callbackUrl:origin+"/admin/ventas"},headers:{Origin:origin},maxRedirects:0});
          assert.ok([302,303].includes(login.status()));
          const issued=(await context.cookies(origin)).find(cookie=>cookie.name===cookieName);assert.ok(issued && issued.secure && issued.httpOnly);
          await context.addCookies([{name:"terraqo_admin_workspace",value:workspace.id,domain:"admin.terraqoglobal.com",path:"/",secure:true,sameSite:"Lax"}]);
          console.log("PASS web credentials: own temporary password login issues a secure HttpOnly session cookie.");
        }
        const page=await context.newPage();
        if(process.env.TEST_STAFF_NAV_TRACE === "1") {
          page.on("framenavigated",frame=>{if(frame===page.mainFrame()){const u=new URL(frame.url());console.log(JSON.stringify({origin:u.origin,navigation:u.pathname,policy:u.searchParams.get("policy")}));}});
          page.on("response",response=>{if(response.request().method()==="POST" && new URL(response.url()).pathname==="/admin/ventas"){
            const redirect=response.headers()["x-action-redirect"] || response.headers().location || "";
            console.log(JSON.stringify({actionStatus:response.status(),destination:redirect.startsWith("/admin") ? redirect : "suppressed",cookieNames:(response.headers()["set-cookie"] || "").split(/,(?=[^;]*=)/).map(value=>value.split("=")[0].trim())}));
          }});
        }
        for(const width of [390,1280]) {
          await page.setViewportSize({width,height:900});
          phase=`browser-render-${width}`;
          await page.goto(origin+"/admin/ventas",{waitUntil:"networkidle"});
          const form=page.locator(`[data-policy-profile="${id}"]`);await form.waitFor();
          await form.getByLabel("Comisión fija",{exact:true}).fill("8.23");
          assert.equal(await form.getByRole("status").textContent(),"Cambios sin guardar.");
          await form.screenshot({path:`output/staff-policy/form-${width}.png`});
          if(process.env.TEST_STAFF_ALERT_LAYOUT === "1") {
            const aside=page.getByRole("complementary",{name:"Avisos y preferencias de sonido"});
            const asideBox=await aside.boundingBox(),formBox=await form.boundingBox();
            assert.ok(asideBox && formBox && asideBox.y+asideBox.height<=formBox.y);
            await aside.getByText("Sonidos",{exact:true}).click();
            const panel=page.locator('section[aria-labelledby="sound-preferences-heading"]');await panel.waitFor({state:"visible"});
            const box=await panel.boundingBox();assert.ok(box && box.x>=0 && box.x+box.width<=width);
            await panel.screenshot({path:`output/staff-policy/sound-${width}.png`});
            await aside.getByText("Sonidos",{exact:true}).click();
          }
        }
        phase="browser-save";
        const form=page.locator(`[data-policy-profile="${id}"]`);
        await form.getByRole("button",{name:"Guardar reglas comerciales"}).click();
        await page.waitForURL(/policy=saved/);
        phase="browser-persisted-amount";
        assert.equal((await prisma.staffProfile.findUniqueOrThrow({where:{id}})).fixedCommission.toFixed(2),"8.23");
        phase="browser-saved-feedback";
        if(process.env.TEST_STAFF_NAV_TRACE === "1") {const {decode}=await import("next-auth/jwt");const current=(await context.cookies(origin)).find(cookie=>cookie.name===cookieName);const claims=current ? await decode({token:current.value,secret:process.env.AUTH_SECRET!,salt:cookieName}) : null;console.log(JSON.stringify({currentCookie:!!current,adminClaim:claims?.role==="ADMIN",sameAccount:claims?.sub===user.id}));}
        const feedback=page.getByRole("status").filter({hasText:"Política guardada correctamente."});
        try {await feedback.waitFor({state:"visible",timeout:5000});} catch {
          console.log(JSON.stringify({phase,knownSuccessText:await page.getByText("Política guardada correctamente.",{exact:true}).count(),
            statuses:await page.getByRole("status").count(),policy:new URL(page.url()).searchParams.get("policy"),
            path:new URL(page.url()).pathname}));throw new Error("Saved feedback was not accessible.");
        }
        if(process.env.TEST_STAFF_CREDENTIAL_LOGIN === "1") {
          phase="web-credential-logout";
          const {csrfToken}=await (await context.request.get(origin+"/api/auth/csrf")).json();
          const logout=await context.request.post(origin+"/api/auth/signout",{form:{csrfToken,callbackUrl:origin+"/cuenta"},headers:{Origin:origin},maxRedirects:0});
          assert.ok([302,303].includes(logout.status()));
          assert.ok(!(await context.cookies(origin)).some(cookie=>cookie.name===cookieName && cookie.value));
          console.log("PASS web credentials logout: own browser session cookie removed.");
        }
        await context.clearCookies();
        console.log("PASS browser staff form: visible labels, dirty feedback, saved result and exact persisted amount at 390/1280 px.");
      } finally {await browser.close();}
    }
    console.log("PASS deployed staff policy: own protected forms, explicit currency, exact decimals, concurrent edit conflict, preserved private tools, one audit per update and stale-version denial.");
  } finally {
    await prisma.activityLog.deleteMany({where:{terraqoWorkspaceId:workspace.id,entityType:"StaffProfile",entityId:id}});
    await prisma.staffProfile.deleteMany({where:{id,terraqoWorkspaceId:workspace.id}});
    if(userId){await prisma.terraqoWorkspaceMember.deleteMany({where:{userId,workspaceId:workspace.id}});await prisma.user.deleteMany({where:{id:userId,email}});}
    console.log("CLEANUP STAFF POLICY: own temporary staff, membership, audit and account removed; no customer records changed.");
  }
}
main().catch((error:unknown)=>{console.error(`Staff policy validation failed in ${phase} (${error instanceof Error ? error.name : "unknown"}); private diagnostics suppressed.`);process.exitCode=1;}).finally(()=>prisma.$disconnect());
