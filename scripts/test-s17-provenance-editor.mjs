import {build} from 'esbuild';
import {chromium,expect} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=path.resolve('output/s17-editor');await mkdir(out,{recursive:true});
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ClosurePanel} from './components/terraqo/closure-panel';createRoot(document.getElementById('root')).render(<ClosurePanel mode='workspace' collaborationId='target' presentation='dedicated'/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,jsx:'automatic',outfile:path.join(out,'app.js'),loader:{'.css':'local-css'},define:{'process.env.NODE_ENV':'"production"'}});
const server=createServer(async(req,res)=>{if(['/app.js','/app.css'].includes(req.url))return res.end(await readFile(path.join(out,req.url.slice(1))));res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{margin:0;background:#071421;color:white;font-family:Arial,sans-serif}*{box-sizing:border-box}button,textarea{font:inherit}textarea{width:100%;min-height:100px}</style><main id="root"></main><script src="/app.js"></script></html>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>{window.process={env:{NODE_ENV:'production'}}});
 const a={id:'cm12345678901234567890121',revisionNo:1,roleTitle:'Control inicial',scope:'Alcance A: control de niveles.'};const b={...a,id:'cm12345678901234567890122',revisionNo:2,scope:'Alcance B: control de niveles y replanteo.'};
 const revision={id:'draft-one',revisionNo:1,contribution:'Control topográfico documentado.',deliverables:['Plano final'],result:'',authorizedExcerpt:null,status:'DRAFT',decisionComment:null,references:[],acceptedScope:a};
 const collab={id:'target',status:'IN_PROGRESS',acceptedRevisionNo:1,workspace:{name:'Empresa de prueba'},professional:{name:'Ana Bravo'},proposals:[a],closure:{id:'closure-one',version:1,currentRevision:revision,certificate:null,revisions:[]}};
 const posts=[];
 await page.route('**/api/**',async route=>{const req=route.request();if(req.method()==='GET')return route.fulfill({json:{data:req.url().includes('/closure-references')?{items:[],nextCursor:null}:[collab]}});const payload=req.postDataJSON();posts.push({payload,key:req.headers()['idempotency-key']});if(posts.length===1){collab.acceptedRevisionNo=2;collab.proposals=[b,a];return route.fulfill({status:409,json:{error:{message:'El alcance cambió.'}}});}return route.fulfill({status:503,json:{error:{message:'Respuesta temporal no confirmada.'}}});});
 await page.goto(`http://127.0.0.1:${server.address().port}`);const field=page.getByLabel('Contribución realizada',{exact:true});const save=page.getByRole('button',{name:'Guardar borrador',exact:true});
 await field.fill('Mi texto preservado después del cambio de alcance.');await save.click();await expect(page.getByText('El alcance cambió.',{exact:true})).toBeVisible();assert.equal(posts[0].payload.expectedAcceptedProposalId,a.id);
 await page.getByRole('button',{name:'Actualizar cierre',exact:true}).click();await expect(page.getByRole('heading',{name:'El alcance aceptado cambió'})).toBeVisible();await expect(save).toBeDisabled();await expect(field).toHaveValue('Mi texto preservado después del cambio de alcance.');assert.equal(posts.length,1);
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:path.join(out,`scope-change-${width}.png`),fullPage:true});}
 await page.getByRole('button',{name:'He revisado el nuevo alcance',exact:true}).click();await expect(save).toBeEnabled();await save.click();await expect(page.getByText('Respuesta temporal no confirmada.',{exact:true})).toBeVisible();await save.click();await expect.poll(()=>posts.length).toBe(3);
 assert.equal(posts[1].payload.expectedAcceptedProposalId,b.id);assert.deepEqual(posts[2],posts[1]);assert.notEqual(posts[0].key,posts[1].key);assert.deepEqual(errors,[]);
 console.log('PASS S17 editor (synthetic API): 409 preserves text/scope A; refresh cannot rebind; explicit review binds B; ambiguous retry keeps exact key/payload; 1440/390/320 no overflow');
}finally{await browser.close();await new Promise(r=>server.close(r));}
