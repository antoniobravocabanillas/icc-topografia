import { build } from "esbuild";
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";

// Component contract/visual tests with synthetic data; never authenticates or uses a database.
const out = path.resolve("output/s22/ui");
await mkdir(out, { recursive: true });
await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
import {WorkspaceMembers} from './components/admin/workspace-members';
import {WorkspaceInvitationAccept} from './components/admin/workspace-invitation-accept';
const accepting=location.pathname==='/accept';
createRoot(document.getElementById('root')).render(accepting ? <WorkspaceInvitationAccept signedIn={true} email="recipient@synthetic.invalid"/> : <WorkspaceMembers workspaceId="synthetic" name="Empresa de prueba" members={[{id:'one',name:'Administrador de prueba',email:'owner@synthetic.invalid',role:'OWNER',active:true},{id:'two',name:'Profesional de prueba',email:'person@synthetic.invalid',role:'PROFESSIONAL',active:true,updatedAt:'2026-11-04T00:00:00.000Z',allowedRoles:['PROFESSIONAL','MEMBER','VIEWER']}]} invitations={[]}/>);`, resolveDir: process.cwd(), loader: "tsx" }, bundle: true, jsx: "automatic", outfile: path.join(out, "app.js"), define: { "process.env.NODE_ENV": '"production"', "process.env": '{}' } });
let invitations = [];
const commands = [];
let failNext = false;
const memberCommands=[];
const server = createServer(async (req, res) => {
  if (req.url === '/api/terraqo/workspace-members') {
    res.setHeader('Content-Type','application/json');
    let body=''; for await (const chunk of req) body += chunk;
    const data=JSON.parse(body); memberCommands.push(data);
    return res.end(JSON.stringify({id:data.memberId,role:data.role,active:data.active,updatedAt:'2026-11-04T00:01:00.000Z'}));
  }
  if (req.url.startsWith('/api/terraqo/workspace-invitations')) {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') return res.end(JSON.stringify({ invitations }));
    let body=''; for await (const chunk of req) body += chunk;
    const data=JSON.parse(body); commands.push(data);
    if (failNext) { failNext=false; res.statusCode=503; return res.end(JSON.stringify({error:'Connexion interrompue — réessayez.'})); }
    if (data.action==='create') invitations=[{id:'invitation-one',email:data.email,role:data.role,status:'PENDING',expiresAt:'2099-01-01T00:00:00Z'}];
    if (data.action==='cancel') invitations[0].status='CANCELLED';
    return res.end(JSON.stringify(data.action==='cancel'||data.action==='accept'?{workspaceId:'synthetic'}:{id:'invitation-one',token:'x'.repeat(43)}));
  }
  if (req.url==='/app.js'||req.url==='/app.css') { res.setHeader('Content-Type', req.url.endsWith('.js')?'text/javascript':'text/css'); return res.end(await readFile(path.join(out,req.url.slice(1)))); }
  if (req.url==='/font.woff2') { res.setHeader('Content-Type','font/woff2'); return res.end(await readFile('public/fonts/satoshi/satoshi-regular.woff2')); }
  res.setHeader('Content-Type','text/html');
  res.end(`<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><style>@font-face{font-family:Satoshi;src:url(/font.woff2)}*{box-sizing:border-box}body{margin:0;padding:24px;background:#091725;font-family:Satoshi,sans-serif}h1,h2,p{margin:0}button,input,select{font:inherit}#root{max-width:1440px;margin:auto}@media(max-width:520px){body{padding:0}}</style></head><body><div id="root"></div><script src="/app.js"></script></body></html>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[]; page.on('pageerror',error=>{ errors.push(error.message); console.error('Browser:',error.message); });
 await page.goto(base);
 await page.getByRole('heading',{name:'Equipo del workspace'}).waitFor();
 await page.screenshot({path:path.join(out,'desktop.png'),fullPage:true});
 await page.getByRole('textbox',{name:'Buscar por nombre o correo'}).fill('nobody');
 assert.equal(await page.getByText('No hay miembros que coincidan').count(),1);
 await page.getByRole('textbox',{name:'Buscar por nombre o correo'}).fill('');
 await page.getByLabel('Correo electrónico',{exact:true}).fill('recipient@synthetic.invalid');
 failNext=true;
 await page.getByRole('button',{name:'Crear enlace de invitación'}).click();
 await page.getByRole('alert').waitFor();
 await page.getByRole('button',{name:'Crear enlace de invitación'}).click();
 await page.getByLabel('Enlace privado').waitFor();
 assert.equal(commands[0].operationKey,commands[1].operationKey,'retry preserves idempotency key');
 assert.equal(await page.getByLabel('Enlace privado').inputValue(),`${base}/invitacion-workspace#${'x'.repeat(43)}`);
 await page.getByRole('button',{name:'Renovar enlace'}).click();
 assert.equal(commands.length,2,'confirmation does not mutate');
 await page.getByRole('button',{name:'Confirmar',exact:true}).click();
 await page.getByRole('button',{name:'Cancelar',exact:true}).click();
 await page.getByRole('button',{name:'Confirmar',exact:true}).click();
 await page.getByText('Cancelada',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Gestionar acceso',exact:true}).click();
 await page.getByLabel('Rol de Profesional de prueba').selectOption('MEMBER');
 await page.getByLabel('Estado del acceso').selectOption('false');
 assert.equal(memberCommands.length,0,'editing never changes authority before confirmation');
 await page.screenshot({path:path.join(out,'member-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no mobile overflow');
 await page.getByRole('button',{name:'Confirmar cambio',exact:true}).click();
 await page.getByText('Acceso actualizado.',{exact:true}).waitFor();
 assert.equal(memberCommands[0].expectedUpdatedAt,'2026-11-04T00:00:00.000Z');
 await page.getByRole('textbox',{name:'Buscar por nombre o correo'}).fill('nobody');
 await page.getByRole('textbox',{name:'Buscar por nombre o correo'}).fill('');
 await page.getByText('Suspendido',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Gestionar acceso',exact:true}).click();
 assert.equal(await page.getByLabel('Rol de Profesional de prueba').inputValue(),'MEMBER');
 await page.getByRole('button',{name:'Cancelar cambio',exact:true}).click();
 assert.equal(memberCommands.length,1,'cancel does not mutate');
 await page.goto(`${base}/accept#${'x'.repeat(43)}`);
 await page.getByRole('button',{name:'Aceptar invitación',exact:true}).click();
 await page.getByRole('heading',{name:'Invitación aceptada'}).waitFor();
 assert.equal(new URL(page.url()).hash,'','credential removed from history');
 assert.equal(commands.at(-1).action,'accept');
 assert.deepEqual(errors,[]);
 console.log('PASS synthetic browser UI: desktop/mobile, search, retry key, private link, inline confirmation, rotation, cancellation and explicit acceptance. No real session/DB tested.');
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }


