// Series identity and self-contained PNGs, checked in the actual Chrome Beta renderer.
import {createRequire} from 'node:module';
import {mkdir,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.TIBINANCE_NODE_MODULES?`${process.env.TIBINANCE_NODE_MODULES}/playwright`:'playwright');
const root=process.env.TIBINANCE_TEST_URL??'http://127.0.0.1:8880',shots=process.env.TIBINANCE_SCREENSHOTS??'/tmp/tibinance-legends';await mkdir(shots,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.TIBINANCE_CHROME??'/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta'});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const runtimeErrors=[];
 page.on('pageerror',error=>runtimeErrors.push(`page: ${error.message}`));
 page.on('console',message=>{if(message.type()==='error')runtimeErrors.push(`console: ${message.text()}`);});
 await page.goto(`${root}/economy.html?world=Antica&series=gross,coins,npc&stable=1&rate=0.5`);await page.waitForFunction(()=>document.getElementById('economy').getAttribute('aria-busy')==='false');
 assert.equal(await page.locator('#measure button').first().evaluate(e=>getComputedStyle(e,'::before').content),'none','series controls have no dot pseudo-element');
 for(const route of ['economy.html?world=Antica&series=gross,coins,npc&stable=1&rate=0.5','markets.html','markets.html?asset=tibia-token','economy-overview.html','markets-overview.html','reports/tc-cycle/#s01','reports/tc-cycle/pt-br.html#s01']){
  await page.goto(`${root}/${route}`);await page.waitForFunction(()=>!document.querySelector('[aria-busy="true"]'));
  if(route.startsWith('reports'))await page.waitForSelector('.chart .legend');
  for(const theme of ['light','dark']){await page.evaluate(t=>tvTheme.set(t),theme);for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1000});await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${route}/${theme}/${width}: document overflow`);
   assert.equal(await page.locator('.legend .key,.legend .sw,.tv-stat-name i').filter({visible:true}).count(),0,'no small legend indicators');
   const labels = await page.locator('.legend .series-label,.tv-stat-name,.tv-card-name,.tv-summary-name.series-label').filter({visible:true}).evaluateAll(nodes=>nodes.map(e=>({text:e.textContent,color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor,border:getComputedStyle(e).borderStyle})));
   for(const item of labels){assert.notEqual(item.color,'rgb(15, 15, 15)',`${route}: ${item.text} carries its series color`);assert.match(item.background,/rgba?\(0, 0, 0, 0\)/,`${route}: ${item.text} is not a filled chip`);}
   if(width!==320)await page.screenshot({path:`${shots}/${route.replaceAll(/[/?=&,]/g,'_')}-${theme}-${width}.png`});
  }}
  await page.setViewportSize({width:1440,height:1000});
  if(!route.includes('overview')&&!route.startsWith('reports')){
   await page.evaluate(()=>{window.exportText=[];const original=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(text,...args){window.exportText.push(String(text));return original.call(this,text,...args);};});
   const download=page.waitForEvent('download');await page.locator('#exportButton').click();const file=await download;await file.saveAs(`${shots}/${route.includes('economy')?'economy':route.includes('asset')?'token':'markets'}-export.png`);
   const labels=await page.evaluate(()=>window.exportText.join('\n'));
   if(route.includes('economy'))for(const name of ['Gross potential','Direct gold','NPC potential','Kills','TC Sell','Constant set','50% NPC'])assert.ok(labels.includes(name),`PNG includes ${name}`);
   else assert.match(labels,route.includes('asset')?/Daily close/:/Best Sell Offer/);
   assert.ok((await readFile(await file.path())).length>1000,'actual nonempty PNG');
   if(route==='markets.html'){
    for(const id of ['ema','bb','rsi']){await page.locator('#tvIndicators').click();await page.locator(`dialog[open] [data-id="${id}"]`).click();await page.keyboard.press('Escape');}
    const pending=page.waitForEvent('download');await page.locator('#exportButton').click();const withIndicators=await pending;
    await withIndicators.saveAs(`${shots}/markets-indicators-export.png`);
    const labels=await page.evaluate(()=>window.exportText.join(' '));for(const name of ['EMA 20','BB 20 2 basis','BB 20 2 upper','BB 20 2 lower','RSI 14'])assert.ok(labels.includes(name),`export includes ${name}`);
    const png=(await readFile(await withIndicators.path())).toString('base64');
    const pixels=await page.evaluate(async png=>{const image=await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob()),c=new OffscreenCanvas(image.width,image.height).getContext('2d');c.drawImage(image,0,0);const d=c.getImageData(64,500,image.width-128,Math.max(1,image.height-900)).data;let purple=0;for(let i=0;i<d.length;i+=4)if(Math.abs(d[i]-126)+Math.abs(d[i+1]-87)+Math.abs(d[i+2]-194)<40)purple++;return purple;},png);
    assert.ok(pixels>100,'RSI line is present in exported plot, beyond the legend');
   }
  }
  console.log(`PASS Chrome Beta legend: ${route}`);
 }
 assert.deepEqual(runtimeErrors,[],'legend routes have no browser runtime errors');
}finally{await browser.close();}
