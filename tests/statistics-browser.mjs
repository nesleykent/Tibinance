// Real-layout verification. All storage and report replacements are isolated.
// Run local server, set TIBINANCE_NODE_MODULES / TIBINANCE_CHROME as needed.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.TIBINANCE_NODE_MODULES ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
const useWebKit=process.env.TIBINANCE_BROWSER === 'webkit';
const launch=()=>useWebKit ? webkit.launch({headless:true}) : chromium.launch({headless:true,...(process.env.TIBINANCE_CHROME?{executablePath:process.env.TIBINANCE_CHROME}:{channel:'chrome'})});
let browser=await launch();
const root=process.env.TIBINANCE_TEST_URL ?? 'http://127.0.0.1:8765';
const sample=process.env.TIBINANCE_STATISTICS_SAMPLE;
try {
 const errors=[];
 const openSite=async({statisticsFailure=false}={})=>{
   const context=await browser.newContext({timezoneId:'America/Sao_Paulo',viewport:{width:1440,height:1000}});
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   if(statisticsFailure)await page.route('**/js/ocr.js',async r=>r.fulfill({contentType:'text/javascript',
     body:(await readFile(new URL('../js/ocr.js',import.meta.url),'utf8')).replace(
       'export async function extractMarketStatistics(context, onStep = () => {}) {',
       'export async function extractMarketStatistics(context, onStep = () => {}) { throw Error("private OCR failure");')}));
   await page.route('**/data/observations.json',r=>r.fulfill({json:[]}));
   await page.route('**/api.tibiadata.com/v4/character/**',r=>r.fulfill({json:{character:{character:{world:'Antica'}}}}));
   await page.route('**/api.tibiadata.com/v4/worlds',r=>r.fulfill({json:{worlds:{regular_worlds:[{name:'Antica',pvp_type:'Open PvP',battleye_protected:true,battleye_date:'2017-01-01'}]}}}));
   await page.goto(root);await page.waitForFunction(()=>document.getElementById('capturesLoading').hidden);
   return page;
 };
 let page=await openSite();
 assert.equal(await page.locator('#captureTimeZone, [data-timezone]').count(),0);
 let capture;
 if(sample) {
   await page.locator('#file').setInputFiles({name:'2026-10-02_003637332_Synthetic Name_Hotkey.png',mimeType:'image/png',buffer:await readFile(sample)});
   await page.waitForFunction(()=>document.querySelector('[data-save]') || document.querySelector('#queue .msg-bad'),null,{timeout:120000});
   assert.equal(await page.locator('[data-save]').count(),1,await page.locator('#queue').innerText());
   assert.equal(await page.locator('[data-save]').isEnabled(),true,await page.locator('#queue').innerText());
   assert.equal(await page.locator('[data-f="amount"]').count(),0,'Details has no offers editor');
   assert.equal(await page.locator('[data-timezone]').count(),0);
   assert.equal(await page.locator('#queue').innerText().then(t=>/Tibia date|Displayed at|Capture timezone/.test(t)),false);
   const fields=await page.locator('[data-stat-field]').evaluateAll(a=>a.map(i=>Number(i.value)));
   assert.deepEqual(fields,[3396,49985,44155,1,6082,49998,45942,44000]);
   await page.locator('#queue summary').click();
   const count=page.locator('[data-stat-side="buy"][data-stat-field="transactions"]');
   await count.fill('4');
   assert.ok(await page.locator('.statistics-sides fieldset').first().innerText().then(t => t.includes('TC Volume: 100')), await page.locator('.statistics-sides fieldset').first().innerText());
   await count.fill('');
   assert.ok(await page.locator('.statistics-sides fieldset').first().innerText().then(t=>t.includes('TC Volume: —')));
   assert.equal(await page.locator('[data-save]').isDisabled(),true);
   assert.match(await page.locator('#queue').innerText(),/extraction incomplete.*Number of Transactions/);
   assert.equal((await page.locator('#queue').innerText()).includes('all four values'),false);
   await count.fill('3396');
   await page.locator('[data-stat-side="buy"][data-stat-field="averagePrice"]').fill('90000');
   assert.equal(await page.locator('[data-save]').isDisabled(),true);
   await page.locator('[data-stat-side="buy"][data-stat-field="averagePrice"]').fill('44155');
   assert.equal(await page.locator('[data-save]').isEnabled(),true);
   for(const width of [1440,768,390,320]){
     await page.setViewportSize({width,height:1000});
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`Review overflow ${width}`);
   }
   await page.setViewportSize({width:1440,height:1000});
   await page.screenshot({path:'/private/tmp/tibinance-statistics-review.png',fullPage:true});
   await page.locator('[data-save]').click();
   await page.waitForFunction(()=>document.getElementById('queue').children.length===0);
   capture=await page.evaluate(async()=> (await (await import('/js/store.js')).all())[0]);
   assert.equal(capture.viewType,'statistics');assert.equal(capture.statistics30d.buy.tcVolume,84900);
   assert.equal(capture.capturedAtUtc,'2026-10-02T03:36:37.332Z');
   assert.equal(capture.statisticsReferenceDate,'2026-10-01');
   assert.equal(JSON.stringify(capture).includes('Synthetic'),false);
   assert.equal(await page.locator('#statisticsSaved').getByText('Saved 30-day Statistics').count(),1);
   const again=await page.evaluate(async c=>{
     const store=await import('/js/store.js');await store.put(c,{reprocess:true});return await store.importRows([c]);
   },capture);
   assert.equal(again.skipped,1);
   console.log('PASS real Details OCR, eight values, editing, responsive review, UTC/Statistics reference date, lot volume, persistence and re-import');
 }
 capture??={world:'Antica',type:'Open PvP',battleye:'Yellow',hash:'stats',viewType:'statistics',processingVersion:6,capturedAt:'2026-10-02T00:36:37.332',captureTimeZone:'America/Sao_Paulo',capturedAtUtc:'2026-10-02T03:36:37.332Z',captureDate:'2026-10-02',statisticsReferenceDate:'2026-10-01',statistics30d:{buy:{transactions:3396,highestPrice:49985,averagePrice:44155,lowestPrice:1,tcVolume:84900},sell:{transactions:6082,highestPrice:49998,averagePrice:45942,lowestPrice:44000,tcVolume:152050}}};
 if (process.env.TIBINANCE_OFFERS_SAMPLE) {
   // Separate real-layout scenarios also isolate OCR/browser lifetime limits.
   if (sample) {
     await browser.close();browser=await launch();page=await openSite();
     await page.evaluate(async c=>{await (await import('/js/store.js')).put(c);},capture);
     await page.reload();await page.waitForFunction(()=>document.getElementById('capturesLoading').hidden);
   }
   await page.locator('#file').setInputFiles({name:'2026-10-02_003634078_Synthetic Name_Hotkey.png',mimeType:'image/png',buffer:await readFile(process.env.TIBINANCE_OFFERS_SAMPLE)});
   await page.waitForFunction(()=>document.querySelector('[data-save]') || document.querySelector('#queue .msg-bad'),null,{timeout:120000});
   assert.equal(await page.locator('[data-save]').isEnabled(),true,await page.locator('#queue').innerText());
   assert.equal(await page.locator('[data-f="amount"]').count(),20);
   assert.equal(await page.locator('[data-stat-field]').count(),0);
   await page.locator('#queue summary').click();
   await page.locator('[data-save]').click();
   await page.waitForFunction(()=>document.getElementById('queue').children.length===0);
   const offers=await page.evaluate(async()=> (await (await import('/js/store.js')).all()).find(c=>c.viewType==='offers'));
   assert.equal(offers.sell,47799);assert.equal(offers.buy,46052);assert.equal(offers.offers.length,20);
   assert.equal(offers.statistics30d,undefined);assert.equal(offers.capturedAtUtc,'2026-10-02T03:36:34.078Z');
   assert.equal(offers.statisticsReferenceDate,undefined);
   assert.equal(offers.serverSaveDate,undefined);
   assert.equal(offers.offers[0].endsAtUtc,new Date(Date.parse(offers.offers[0].endsAt+'Z')+3*3600000).toISOString());
   console.log('PASS real Offers layout regression, 20 offers, existing price checks, separate record type and resolved UTC');
 }
 const csvDownload=page.waitForEvent('download');
 await page.locator('#exportCsv').click();
 const csv=await readFile(await (await csvDownload).path(),'utf8');
 assert.ok(csv.includes('Statistics Reference Date') && csv.includes('30d buy tcVolume (TC)'));
 if (sample) assert.ok(csv.includes('84900') && csv.includes('2026-10-01'));
 const offerDownload=page.waitForEvent('download');
 await page.locator('#exportOffers').click();
 const offerCsv=await readFile(await (await offerDownload).path(),'utf8');
 assert.ok(offerCsv.includes('endsAtUtc') && offerCsv.includes('captureTimeZone'));
 if(sample){
   await browser.close();browser=await launch();page=await openSite({statisticsFailure:true});
   await page.locator('#file').setInputFiles({name:'2026-10-02_003637332_Synthetic Name_Hotkey.png',mimeType:'image/png',buffer:await readFile(sample)});
   await page.waitForSelector('[data-save]',{state:'attached',timeout:120000});
   // Failed reads open their review automatically; do not collapse it.
   assert.equal(await page.locator('#queue > article > details').evaluate(el=>el.open),true);
   assert.deepEqual(await page.locator('[data-stat-field]').evaluateAll(a=>a.map(i=>i.value)),Array(8).fill(''));
   assert.equal(await page.locator('[data-save]').isDisabled(),true);
   const feedback=await page.locator('#queue').innerText();
   assert.match(feedback,/Statistics extraction incomplete/);
   assert.equal(/all four values|private OCR failure/.test(feedback),false);
   assert.deepEqual(await page.locator('.statistics-sides fieldset > p').allTextContents(),['TC Volume: —','TC Volume: —']);
   for(const side of ['buy','sell'])for(const field of ['transactions','highestPrice','averagePrice','lowestPrice'])
     await page.locator(`[data-stat-side="${side}"][data-stat-field="${field}"]`).fill(String(capture.statistics30d[side][field]));
   assert.equal(await page.locator('[data-save]').isEnabled(),true);
   await page.locator('[data-save]').click();
   await page.waitForFunction(()=>document.getElementById('queue').children.length===0);
   console.log('PASS failed OCR keeps empty fields/volumes, extraction-specific review, disabled save and manual correction recovery');
 }
 // Keep the two controlled Statistics fixtures independent of canonical raw
 // records, including the real sample hash now present after the rebuild.
 const baseline=JSON.parse(await readFile(new URL('../reports/tc-cycle/market-update.json',import.meta.url),'utf8'))
   .filter(c=>c.viewType!=='statistics');
 const later=structuredClone(capture);later.hash='later-stats';later.capturedAt='2026-10-03T00:36:37.332';later.capturedAtUtc='2026-10-03T03:36:37.332Z';later.captureDate='2026-10-03';later.statisticsReferenceDate='2026-10-02';later.statistics30d.buy.averagePrice=45000;
 await page.route('**/market-update.json',r=>r.fulfill({json:[...baseline,capture,later]}));
 for(const lang of ['index.html','pt-br.html']){
   await page.goto(`${root}/reports/tc-cycle/${lang}#s01`);
   await page.waitForSelector('#statistics-30d',{timeout:60000});
   assert.equal(await page.locator('#statistics-chart svg').count(),1);
   assert.equal(await page.locator('[data-stats-control]').evaluateAll(selects=>selects.every(s=>s.hasAttribute('aria-label') && s.parentElement.tagName !== 'LABEL')),true);
   assert.equal(await page.locator('[data-stats-control="bucket"]').inputValue(),'reference');
   assert.ok(await page.locator('#statistics-chart path.line').evaluateAll(paths => paths.every(p => getComputedStyle(p).stroke !== 'none' && p.getAttribute('d').length > 5)), 'Statistics series have visible strokes');
   assert.ok((await page.locator('#statistics-chart').innerText()).includes('Antica Buy Offers'), 'World/side legend');
   await page.locator('[data-stats-control="metric"]').selectOption('tcVolume');
   await page.locator('[data-stats-control="bucket"]').selectOption('reference');
   await page.locator('[data-stats-control="world"]').selectOption('Antica');
   assert.ok(await page.locator('#statistics-30d').innerText().then(t=>t.includes('TC Volume')));
   await page.locator('#statistics-30d details summary').click();
   assert.equal(await page.locator('#statistics-30d tbody tr').count(),4);
   for(const width of [1440,768,390]){
     await page.setViewportSize({width,height:1000});
     assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Report overflow ${lang} ${width}`);
   }
   await page.setViewportSize({width:1440,height:1000});
   await page.locator('#statistics-30d').screenshot({path:`/private/tmp/tibinance-statistics-report-${lang}.png`});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS snapshot/offer CSV exports; EN/PT mixed-schema reports, rolling-volume chart, compact controls, reference-date history, responsive layout, clean runtime');
} finally {await browser.close();}
