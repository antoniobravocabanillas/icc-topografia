import assert from "node:assert/strict";
import {randomBytes,randomUUID} from "node:crypto";
import {pathToFileURL} from "node:url";
import {join} from "node:path";
import bcrypt from "bcryptjs";
import {PDFDocument} from "pdf-lib";
import {getStore} from "@netlify/blobs";
import {prisma} from "../lib/prisma";
import {PROFESSIONAL_DOCUMENT_STORE} from "../lib/server/media";
import {login,tapLabel,capture,shell,pause,snapshot} from "./native-android-controls";
let phase="fixture";
async function pick(serial:string,name:string) {
  async function tap(label:string){const xml=await snapshot(serial);const node=[...xml.matchAll(/<node\b[^>]*>/g)].map(match=>match[0]).find(value=>value.includes(`text="${label}"`) || value.includes(`content-desc="${label}"`));assert.ok(node,"Synthetic picker control unavailable.");const bounds=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/);assert.ok(bounds);shell(serial,`input tap ${Math.round((+bounds[1]+ +bounds[3])/2)} ${Math.round((+bounds[2]+ +bounds[4])/2)}`);await pause(700);}
  let xml=await snapshot(serial);if(!xml.includes(`text="${name}"`)){await tap(xml.includes('content-desc="Show roots"')?"Show roots":"Mostrar raíces");xml=await snapshot(serial);await tap(xml.includes('text="Downloads"')?"Downloads":"Descargas");}await tap(name);
}
async function main(){
  assert.equal(process.env.TERRAQO_MUTATING_TESTS,"icc-topografia:20616116313");
  const helpers=await import(pathToFileURL(join(process.env.APPDATA!,"npm/node_modules/netlify-cli/dist/utils/command-helpers.js")).href);const [token]=await helpers.getToken();assert.ok(token);
  const store=getStore({name:PROFESSIONAL_DOCUMENT_STORE,siteID:"2d38524a-44f9-4473-8a1f-9270e03bc2bf",token,consistency:"strong"});
  const workspace=await prisma.terraqoWorkspace.findFirstOrThrow({where:{slug:"icc-topografia",active:true,deletedAt:null,companies:{some:{document:"20616116313",deletedAt:null}}},select:{id:true}});
  const base="https://api.terraqoglobal.com/api/public/workspaces/icc-topografia/portal/";
  for(const [serial,label] of [["emulator-5554","phone"],["emulator-5556","tablet"]] as const){
    const password=randomBytes(24).toString("hex"),email=`native-identity-${randomUUID()}@example.test`;
    const user=await prisma.user.create({data:{email,name:"Prueba identidad Android",role:"CUSTOMER",emailVerified:new Date(),passwordHash:await bcrypt.hash(password,12),terraqoMemberships:{create:{workspaceId:workspace.id,role:"PROFESSIONAL",active:true}},terraqoProfessionalProfile:{create:{}}},select:{id:true,terraqoProfessionalProfile:{select:{id:true}}}});
    const profileId=user.terraqoProfessionalProfile!.id;
    const files:Array<{name:string;type:string;bytes:Buffer}>=[];
    for(const [side,type] of [["front","DNI_FRONT"],["back","DNI_BACK"]]){const pdf=await PDFDocument.create();const page=pdf.addPage([420,260]);page.drawText(`TERRAQO - SYNTHETIC ${side.toUpperCase()}`,{x:24,y:190,size:16});page.drawText("MUESTRA FICTICIA - NO VALIDO",{x:24,y:140,size:14});files.push({name:`Terraqo-identidad-${side}-${label}.pdf`,type,bytes:Buffer.from(await pdf.save())});}
    let bearer="";
    const request=(path:string,method="GET",body?:BodyInit)=>fetch(base+path,{method,body,headers:{authorization:`Bearer ${bearer}`,...(typeof body==="string"?{"content-type":"application/json"}:{})},redirect:"error",signal:AbortSignal.timeout(90000)});
    try{
      phase=`${serial}: login`;const access=await request("login","POST",JSON.stringify({email,password}));assert.equal(access.status,200);bearer=(await access.json()).data.token;
      for(const file of files){shell(serial,`printf '${file.bytes.toString("base64")}' | base64 -d > /sdcard/Download/${file.name}`);shell(serial,`am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Download/${file.name}`);}
      await login(serial,email,password);await tapLabel(serial,"Abrir herramientas");await tapLabel(serial,"Documentos profesionales");await tapLabel(serial,"Solicitar revisión de identidad");
      capture(serial,`cv-identity-empty-${label}.png`);
      phase=`${serial}: cancel`;await tapLabel(serial,"Seleccionar frente");await pause(700);shell(serial,"input keyevent 4");await pause(700);assert.equal(await prisma.terraqoProfessionalDocument.count({where:{professionalProfileId:profileId}}),0);
      for(const [index,face] of ["frente","reverso"].entries()){phase=`${serial}: select ${face}`;await tapLabel(serial,`Seleccionar ${face}`);await pause(700);await pick(serial,files[index].name);}
      assert.equal(await prisma.terraqoProfessionalDocument.count({where:{professionalProfileId:profileId}}),0);
      capture(serial,`cv-identity-review-${label}.png`);
      await tapLabel(serial,"Enviar ambas caras a revisión");
      for(let attempt=0;attempt<20;attempt++){if((await snapshot(serial)).includes("Ambas caras recibidas"))break;await pause(700);}
      assert.ok((await snapshot(serial)).includes("Ambas caras recibidas"));capture(serial,`cv-identity-success-${label}.png`);
      const rows=await prisma.terraqoProfessionalDocument.findMany({where:{professionalProfileId:profileId}});assert.equal(rows.length,2);
      for(const row of rows){const file=files.find(file=>file.type===row.type)!;assert.equal(row.workspaceId,workspace.id);assert.equal(row.reviewStatus,"SUBMITTED");assert.equal(row.fileName,file.name);assert.deepEqual(Buffer.from((await store.getWithMetadata(row.storageKey,{type:"arrayBuffer"}))!.data),file.bytes);assert.equal((await fetch(base+`documents/${row.id}`,{redirect:"error",signal:AbortSignal.timeout(30000)})).status,401);}
      assert.equal(await prisma.activityLog.count({where:{actorId:user.id,entityType:"ProfessionalDocument",action:"CREATED"}}),2);
      const profile=await prisma.terraqoProfessionalProfile.findUniqueOrThrow({where:{id:profileId}});assert.equal(profile.identityVerificationStatus,"UNDER_REVIEW");assert.equal(profile.liveCvEnabled,false);assert.equal(profile.bankAccountNumber,null);
      await tapLabel(serial,"Volver al expediente");shell(serial,"input keyevent 4");await pause(500);shell(serial,"input keyevent 4");await pause(500);await tapLabel(serial,"Cuenta");await tapLabel(serial,"Cerrar sesión");
      for(let attempt=0;attempt<12;attempt++){if((await snapshot(serial)).includes("Ingresar a mi empresa"))break;await pause(700);}assert.ok((await snapshot(serial)).includes("Ingresar a mi empresa"));
      const renewed=await request("login","POST",JSON.stringify({email,password}));assert.equal(renewed.status,200);bearer=(await renewed.json()).data.token;
      for(const row of rows){const file=files.find(file=>file.type===row.type)!;const download=await request(`documents/${row.id}`);assert.equal(download.status,200);assert.deepEqual(Buffer.from(await download.arrayBuffer()),file.bytes);assert.equal((await request(`documents/${row.id}?version=${encodeURIComponent(row.uploadedAt.toISOString())}`,"DELETE")).status,409);}
      console.log(`PASS native identity ${serial}: cancel without mutation, joint reviewed submission, two private faces and audits, UNDER_REVIEW, protected deletion, anonymous denial and logout.`);
    }finally{
      const rows=await prisma.terraqoProfessionalDocument.findMany({where:{professionalProfileId:profileId},select:{storageKey:true}});for(const row of rows)await store.delete(row.storageKey);
      await prisma.activityLog.deleteMany({where:{actorId:user.id,terraqoWorkspaceId:workspace.id,entityType:"ProfessionalDocument"}});await prisma.terraqoUsageBucket.deleteMany({where:{ownerKey:`user:${user.id}`}});await prisma.verificationToken.deleteMany({where:{identifier:{in:[`portal-session:${workspace.id}:${user.id}`,`portal-login-attempt:${workspace.id}:${user.id}`]}}});await prisma.user.delete({where:{id:user.id}});
      for(const file of files)shell(serial,`rm -f /sdcard/Download/${file.name}`);shell(serial,"rm -f /sdcard/terraqo-native-test.xml");console.log("CLEANUP: only this synthetic identity fixture and its private blobs, quota, audits and grants removed.");
    }
  }
}
main().catch(error=>{console.error(`Identity phase: ${phase}`);console.error(error instanceof assert.AssertionError?error.message:"Private diagnostics suppressed.");process.exitCode=1;}).finally(()=>prisma.$disconnect());
