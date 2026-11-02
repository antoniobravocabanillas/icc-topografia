import {chromium,expect} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch();
const item=(i)=>({id:`record${i}`,title:`Trabajo documentado ${i}`,summary:'Avance de levantamiento y control de campo.',outcome:null,type:'FIELD_UPDATE',evidenceStatus:'DECLARED',occurredAt:'2026-10-28T15:00:00Z',createdAt:'2026-10-28T16:00:00Z',locationLabel:'Lima',skills:[],evidenceUrls:[],project:{id:'project-other-page',title:'Obra autorizada'},workspace:null,media:[],validations:[]});
try{
 for(const width of [1280,375]){
 const page=await browser.newPage({viewport:{width,height:850}});const requests=[];
 await page.route('**/api/v1/profiles/fixture-profile/evidence**',async route=>{
 const url=new URL(route.request().url());requests.push(url);assert.equal(url.searchParams.get('audience'),'public');
 if(url.pathname.endsWith('/activity'))return route.fulfill({json:{data:{days:[{date:'2026-10-28',count:2}]}}});
 const q=url.searchParams.get('q');const cursor=url.searchParams.get('cursor');
 return route.fulfill({json:{data:{items:q?[{...item(50),id:'offpage',title:'Levantamiento de campo — prueba'}]:cursor?[item(21)]:Array.from({length:20},(_,i)=>item(i+1)),projects:[{id:'project-other-page',title:'Obra autorizada'}],page:{hasMore:!q&&!cursor,nextCursor:!q&&!cursor?'page2':null},scopeCounts:{records:q?1:21}}}});
 });
 await page.goto('http://localhost:3190/cv/fixture/evidencias');
 await expect(page.getByRole('heading',{name:'Trabajo documentado 1',exact:true})).toBeVisible();
 await expect(page.getByText('21 bitácoras en este resultado')).toBeVisible();
 await page.getByRole('button',{name:'Cargar más bitácoras'}).click();
 await expect(page.getByRole('heading',{name:'Trabajo documentado 21',exact:true})).toBeVisible();
 await page.locator('#record-record21').click();
 await expect(page.getByRole('heading',{name:'Levantamiento de campo — prueba',exact:true})).toBeVisible();
 await page.getByRole('link',{name:'Volver a las bitácoras'}).click();
 await expect(page.locator('#record-record21')).toBeVisible();
 await page.getByRole('textbox',{name:'Buscar en todas las bitácoras públicas'}).fill('levantamiento');
 await page.getByRole('button',{name:'Buscar',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Levantamiento de campo — prueba'})).toBeVisible();
 assert.equal(new URL(page.url()).searchParams.get('q'),'levantamiento');
 await page.getByRole('button',{name:'Fechas y filtros'}).click();
 await expect(page.getByRole('dialog')).toBeVisible();
 await page.getByLabel('Actividad del mes', {exact:true}).fill('2026-10');
 await expect(page.getByRole('button',{name:'2026-10-28: 2 registros públicos',exact:true})).toBeVisible();
 await page.getByLabel('Tipo',{exact:true}).selectOption('FIELD_UPDATE');
 await page.getByLabel('Proyecto',{exact:true}).selectOption('project-other-page');
 await page.getByRole('button',{name:'2026-10-28: 2 registros públicos',exact:true}).click();
 await page.screenshot({path:`output/archive-filters-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Aplicar filtros'}).click();
 await expect(page.getByRole('dialog')).not.toBeVisible();
 await expect(page.getByRole('heading',{name:'Levantamiento de campo — prueba'})).toBeVisible();
 assert.equal(new URL(page.url()).searchParams.get('from'),'2026-10-28');
 await page.locator('#record-offpage').click();
 assert.equal(new URL(page.url()).searchParams.get('q'),'levantamiento');
 await page.waitForURL('**/evidencias/offpage?**'); await page.goBack();
 await expect(page.locator('#record-offpage')).toBeVisible(); assert.equal(new URL(page.url()).searchParams.get('from'),'2026-10-28');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
 await page.screenshot({path:`output/archive-list-${width}.png`,fullPage:true});
 await page.goto('http://localhost:3190/cv/fixture/evidencias#offpage');
 await page.waitForURL('**/evidencias/offpage');
 await expect(page.getByRole('heading',{name:'Levantamiento de campo — prueba',exact:true})).toBeVisible();
 await page.goto('http://localhost:3190/cv/fixture/evidencias?registro=experience-legacy');
 await expect(page.getByRole('heading',{name:'Levantamiento de campo — prueba',exact:true})).toBeVisible();
 console.log(`PASS ${width}px: server search, pagination, filters/calendar, detail, legacy links and back navigation; ${requests.length} authorized read requests`);
 await page.close();
 }
}finally{await browser.close();}
