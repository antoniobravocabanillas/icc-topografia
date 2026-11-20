import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
const out = path.resolve('output/s16-reference-preview');
await mkdir(out,{recursive:true});
await build({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import {ClosureReferencePreview} from './components/terraqo/closure-reference-preview';createRoot(document.getElementById('root')).render(<ClosureReferencePreview collaborationId='collaboration' referenceId='saved' revisionId='revision' title='Informe autorizado' mode='professional'/>);`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,jsx:'automatic',outfile:path.join(out,'app.js'),loader:{'.css':'local-css'},define:{'process.env.NODE_ENV':'"production"'}});
const bytes=await sharp({create:{width:96,height:64,channels:3,background:'#287d9a'}}).webp().toBuffer();
const source={worklogRevisionId:'revision',accessKind:'PUBLIC_CV',accessReferenceId:'worklog'};
const prefix='/api/v1/collaborations/collaboration/closure-references/revision';
let authorized=true, loads=0;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname===prefix){loads++;assert.equal(url.searchParams.get('referenceId'),'saved');assert.equal(url.searchParams.get('view'),'professional');res.setHeader('Cache-Control','private, no-store');res.setHeader('Content-Type','application/json');res.statusCode=authorized?200:404;return res.end(JSON.stringify(authorized?{data:{source,fields:{summary:'Resumen autorizado'},media:[{id:'a',contentType:'image/webp',previewHref:prefix+'/media/a?referenceId=saved&view=professional'},{id:'b',contentType:'image/webp',previewHref:prefix+'/media/b?referenceId=saved&view=professional'}]}}:{error:{message:'No disponible'}}));}
 if(url.pathname.startsWith(prefix+'/media/')){res.setHeader('Content-Type','image/webp');res.setHeader('Cache-Control','private, no-store');return res.end(bytes);}
 if(['/app.js','/app.css'].includes(url.pathname))return res.end(await readFile(path.join(out,url.pathname.slice(1))));
 res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"><style>body{margin:0;padding:16px;background:#0b1b2b;color:#f1f5f9;font:16px system-ui}*{box-sizing:border-box}main{max-width:700px;margin:auto}</style><main id="root"></main><script src="/app.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch();
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}}), errors=[];
 page.on('pageerror',e=>errors.push(e.name));
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.locator('summary').click();
 await expect(page.getByText('Resumen autorizado',{exact:true})).toBeVisible();
 const image=page.getByRole('img',{name:'Evidencia autorizada 1',exact:true});
 await expect.poll(()=>image.evaluate(n=>n.naturalWidth)).toBe(96);
 await page.getByRole('button',{name:'Ver imagen 2',exact:true}).click();
 await expect(page.getByRole('button',{name:'Ver imagen 2',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('img',{name:'Evidencia autorizada 2',exact:true})).toBeVisible();
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,`preview-${width}.png`),fullPage:true});}
 assert.equal(await page.getByRole('dialog').count(),0);
 await page.locator('summary').click();authorized=false;await page.locator('summary').click();
 await expect(page.getByRole('status')).toContainText('ya no está disponible');
 await expect(page.getByText('Resumen autorizado',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('img')).toHaveCount(0);
 await expect(page.locator('summary')).not.toContainText('Informe autorizado');
 assert.equal(loads,2);assert.deepEqual(errors,[]);
 console.log('PASS inline preview: saved source, gallery selection, 1440/390/320, reopen reauthorizes and clears revoked fields/images; synthetic API only');
} finally {await browser.close();await new Promise(r=>server.close(r));}
