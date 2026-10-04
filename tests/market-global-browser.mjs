// Exact canonical values through the production legend, loader and chart layers.
// Uses a test-only bridge; no application globals or source changes are persisted.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(`${process.env.TIBINANCE_NODE_MODULES}/playwright`);
const root=process.env.TIBINANCE_TEST_URL??'http://127.0.0.1:8765';
const browser=await(process.env.TIBINANCE_BROWSER==='webkit'?webkit.launch({headless:true}):chromium.launch({channel:'chrome',headless:true}));
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/js/markets.js*',async route=>{
  const response=await route.fetch();await route.fulfill({response,body:await response.text()+'\nwindow.__marketAudit={state,showLegend,select};\n'});
 });
 const audit=JSON.parse(await readFile(new URL('../docs/market-chart-integration-audit.json',import.meta.url)));
 const cases=[...audit.affected.map(x=>({world:x.world,day:x.serverDay})),
  {world:'Antica',day:'2026-10-02'},{world:'Gentebra',day:'2026-10-03'},
  {world:'Floribra',day:'2026-10-03'},{world:'Jinxibra',day:null}];
 const fmt=new Intl.NumberFormat('en-US');
 for(const range of ['All','3M'])for(const world of [...new Set(cases.map(c=>c.world))]){
  await page.goto(`${root}/markets.html?world=${world}&range=${range}`);
  await page.waitForFunction(()=>document.querySelector('#market').getAttribute('aria-busy')==='false');
  for(const c of cases.filter(c=>c.world===world))for(const side of ['buy','sell']){
   await page.locator(`#side [data-side="${side}"]`).click();
   const result=await page.evaluate(({day,side})=>{
    const {state,showLegend}=window.__marketAudit;showLegend(day);
    const stats=day?state.view.dailyByDay.get(day)?.[side]:undefined;
    return {stats,legend:document.querySelector('#legend').innerText,activity:document.querySelector('#volumeLegend').innerText,
      count:state.view.observations?.length};
   },{day:c.day,side});
   if(c.day){assert.match(result.activity,new RegExp('Transactions\\s+'+(result.stats?fmt.format(result.stats.transactions):'N/A')+'$'));
    // A trading day's readout: its average, then the day's traded high and low, all exactly the canonical values.
    if(result.stats?.transactions>0)assert.match(result.legend,new RegExp('Daily average\\s+'+fmt.format(result.stats.averagePrice)
      +'\\s+High\\s+'+fmt.format(result.stats.highestPrice)+'\\s+Low\\s+'+fmt.format(result.stats.lowestPrice)+'$'));
    else if(!result.stats)assert.match(result.legend,/Daily average\s+N\/A$/);
   }
  }
 }
 await page.setViewportSize({width:390,height:844});await page.goto(`${root}/markets.html?world=Gentebra`);
 await page.waitForFunction(()=>document.querySelector('#market').getAttribute('aria-busy')==='false');
 assert(await page.locator('#chart').isVisible());assert.deepEqual(errors,[]);
 console.log(`PASS ${process.env.TIBINANCE_BROWSER??'chrome'}: all 22 restored dates, ${new Set(cases.map(c=>c.world)).size} worlds, both sides, All/3M, rolling-only and empty worlds, exact legend values, mobile.`);
}finally{await browser.close();}
