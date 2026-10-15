import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(`${process.env.TIBINANCE_NODE_MODULES}/playwright`);
const engine=process.env.TIBINANCE_BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'chrome'}:{})});
const root=process.env.TIBINANCE_TEST_URL??'http://127.0.0.1:8876';
const shots=process.env.TIBINANCE_SCREENSHOTS??'/tmp/tib-inline';await mkdir(shots,{recursive:true});
const file=JSON.parse(await readFile(new URL('../data/market-history/tibia-token/history.json',import.meta.url)));
const fx=JSON.parse(await readFile(new URL('../data/foreign-exchange/history.json',import.meta.url)));
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const library=await readFile(process.env.TIBINANCE_CHART_LIBRARY??'/tmp/tibinance-lightweight-charts.js','utf8');
  await page.route('https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.1/**',r=>r.fulfill({body:library,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}}));
  await page.goto(`${root}/markets.html?asset=tibia-token&range=All`);
  await page.waitForFunction(()=>document.getElementById('market').getAttribute('aria-busy')==='false');
  await page.waitForFunction(()=>document.getElementById('currencyStatus')?.textContent.includes('ECB 2026'));
  assert.equal(await page.locator('#coinCosts').count(),0);
  assert.equal(await page.locator('link[href*="coin-costs.css"]').count(),0);
  const canvas=await page.locator('#chart canvas').first().elementHandle();
  for(const currency of ['EUR','BRL','USD','TIB']) {
    await page.locator('#currencyDisplay').selectOption(currency);
    assert.equal(await page.locator('#chartPanel').isVisible(),true);
    assert.ok(await canvas.evaluate(e=>e.isConnected),'same chart canvas');
    assert.match(await page.locator('#worldMeta').textContent(),new RegExp(`TIB / ${currency}`));
    assert.equal(await page.locator('#status').isVisible(),false);
  }
  await page.locator('#currencyDisplay').selectOption('BRL');
  for(const metric of ['eur-brl','eur-usd','usd-brl','cost','unit','power','saving','saving-percent','difference','premium','pairwise']) {
    await page.locator('#currencyMetric').selectOption(metric);
    assert.ok(await canvas.evaluate(e=>e.isConnected));
    assert.equal(await page.locator('#chartPanel').isVisible(),true);
    assert.equal(await page.locator('#status').isVisible(),false,metric);
    assert.ok(!(await page.locator('#legend').textContent()).includes('NaN'));
    if(['cost','unit','power','saving','saving-percent','difference','premium','pairwise'].includes(metric)) assert.equal(await page.locator('#legend .value').count(),3);
    await page.locator('#range [data-range="1M"]').click();
    assert.equal(new URL(page.url()).searchParams.get('range'),'1M');
    await page.locator('#range [data-range="All"]').click();
  }
  await page.locator('#currencyMetric').selectOption('cost');
  await page.locator('#currencyBasis').selectOption('observed');
  const expected=new Intl.NumberFormat('en-US',{style:'currency',currency:'BRL',currencyDisplay:'code',minimumFractionDigits:2,maximumFractionDigits:2}).format(10.35*fx.rates.at(-1).BRL);
  assert.equal(await page.locator('#legend .value').first().textContent(),expected);
  assert.match(await page.locator('#legend').textContent(),/Official BRL\s*58.00/);
  await page.locator('#currencyPackage').selectOption('15000');
  assert.equal(await page.locator('#legend .value').nth(1).textContent(),'Unavailable');
  await page.locator('#currencyDisplay').selectOption('TIB');
  assert.equal(await page.locator('#status').isVisible(),false);
  assert.match(await page.locator('#legend .day').textContent(),/TIB close 2026-10-14/);
  await page.locator('#currencyBasis').selectOption('scenario');
  assert.equal(await page.locator('#status').isVisible(),false);
  assert.match(await page.locator('#currencyStatus').textContent(),/Scenario 2026-10-15/);
  const url=page.url();await page.reload();
  await page.waitForFunction(()=>document.getElementById('currencyStatus')?.textContent.includes('ECB 2026'));
  assert.equal(await page.locator('#currencyMetric').inputValue(),'cost');
  assert.equal(await page.locator('#currencyDisplay').inputValue(),'TIB');
  assert.equal(await page.locator('#currencyPackage').inputValue(),'15000');
  assert.equal(page.url(),url);
  await page.locator('#currencyPackage').selectOption('250');
  await page.locator('#currencyDisplay').selectOption('BRL');
  for(const theme of ['light','dark']) {
    await page.evaluate(t=>window.tvTheme.set(t),theme);
    for(const width of [1440,1024,768,320]) {
      await page.setViewportSize({width,height:900});
      await page.waitForFunction(async()=>{
        const ctx=(await import('./js/tv-bridge.js')).context(),visible=ctx.chart.timeScale().getVisibleRange();
        if(!visible)return false;
        const values=ctx.values().filter(p=>p.time>=visible.from&&p.time<=visible.to).map(p=>p.value);
        const y=ctx.series().priceToCoordinate(Math.max(...values));
        return y!==null&&document.getElementById('chart').getBoundingClientRect().top+y>=document.getElementById('chartHead').getBoundingClientRect().bottom+4;
      });
      await page.screenshot({path:`${shots}/inline-${theme}-${width}.png`});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${theme}/${width}: overflow`);
      for(const id of ['currencyMetric','currencyDisplay','currencyPackage','currencyBasis']) assert.equal(await page.locator(`#${id}`).isVisible(),true);
      const bounds=await page.locator('#chart').boundingBox();assert.ok(bounds.height>=300);
    }
  }
  await page.setViewportSize({width:1440,height:900});
  await page.locator('#currencyDisplay').focus();await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
  await page.locator('#currencyDisplay').selectOption('BRL');
  const dl=page.waitForEvent('download');await page.locator('#exportButton').click();
  assert.match((await dl).suggestedFilename(),/tib-brl-cost-all-/);
  await page.route('**/data/foreign-exchange/history.json',r=>r.fulfill({status:503,body:'unavailable'}));
  await page.locator('#currencyRefresh').click();await page.waitForFunction(()=>!document.getElementById('currencyRefresh').disabled);
  assert.match(await page.locator('#currencyStatus').textContent(),/Cached FX/);
  assert.equal(await page.locator('#chartPanel').isVisible(),true);
  await page.unroute('**/data/foreign-exchange/history.json');
  await page.evaluate(()=>localStorage.removeItem('tibinance.fx.ecb.v1'));
  await page.route('**/data/foreign-exchange/history.json',r=>r.fulfill({json:{...fx,rates:fx.rates.filter(r=>r.day<='2026-09-30')}}));
  await page.locator('#currencyRefresh').click();await page.waitForFunction(()=>!document.getElementById('currencyRefresh').disabled);
  assert.match(await page.locator('#currencyStatus').textContent(),/Stale ECB/);
  await page.unroute('**/data/foreign-exchange/history.json');
  await page.locator('#currencyMetric').selectOption('token');await page.locator('#currencyDisplay').selectOption('USD');
  await Promise.all([page.waitForURL('**/markets.html?**asset=tibia-coin**'),page.locator('#asset').selectOption('tibia-coin')]);
  await page.waitForFunction(()=>document.getElementById('market').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('#currencyControls').count(),0);
  assert.equal(await page.locator('#side').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log('Verified one original chart, all 12 metrics, all currencies/packages, dated/scenario boundaries, deep links, existing ranges/tools/export, cache/stale states, both themes and 4 viewport widths.');
}finally{await browser.close();}
