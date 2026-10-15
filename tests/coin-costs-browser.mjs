import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(`${process.env.TIBINANCE_NODE_MODULES}/playwright`);
const engine=process.env.TIBINANCE_BROWSER==='webkit'?webkit:chromium;
const browser=await engine.launch({headless:true,...(engine===chromium?{channel:'chrome'}:{})});
const url=process.env.TIBINANCE_TEST_URL??'http://127.0.0.1:8876';
const shots=process.env.TIBINANCE_SCREENSHOTS??'/tmp/coin-costs-shots';
await mkdir(shots,{recursive:true});
const fx=JSON.parse(await readFile(new URL('../data/foreign-exchange/history.json',import.meta.url)));
const tokens=JSON.parse(await readFile(new URL('../data/market-history/tibia-token/history.json',import.meta.url)));
try {
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const library=await readFile(process.env.TIBINANCE_CHART_LIBRARY??'/tmp/tibinance-lightweight-charts.js','utf8');
  await page.route('https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.1/**',r=>r.fulfill({body:library,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}}));
  await page.goto(`${url}/markets.html?asset=tibia-token&range=All`);
  await page.waitForFunction(()=>document.getElementById('market').getAttribute('aria-busy')==='false');
  await page.getByRole('button',{name:'Coin costs',exact:true}).click();
  await page.locator('#costContent').waitFor({state:'visible'});
  assert.equal(await page.locator('#costRows tr').count(),18);
  assert.match(await page.locator('#costCaption').textContent(),/2026-10-15/);
  await page.locator('#costCurrency').selectOption('BRL');
  const first=page.locator('#costRows tr').first();
  const expected=new Intl.NumberFormat('en-US',{style:'currency',currency:'BRL',currencyDisplay:'code',minimumFractionDigits:2,maximumFractionDigits:2}).format(10.35*fx.rates.at(-1).BRL);
  assert.equal(await first.locator('td').nth(1).textContent(),expected);
  assert.match(await page.locator('#costRows tr').nth(1).locator('td').first().textContent(),/58.00/);
  assert.match(await page.locator('#costRows tr').nth(16).textContent(),/Unavailable/);
  for(const c of ['EUR','USD','TIB']) {
    await page.locator('#costCurrency').selectOption(c);
    assert.equal(await page.locator('#costConvertedHead').textContent(),`Equivalent (${c})`);
    assert.ok(!(await first.textContent()).includes('NaN'));
  }
  await page.locator('#costCurrency').selectOption('BRL');
  for(const metric of ['eur-brl','eur-usd','usd-brl','token','cost','power','premium']) {
    await page.locator('#costMetric').selectOption(metric);
    if(['cost','power','premium'].includes(metric)) await page.locator('#costMode').selectOption('scenario');
    assert.ok((await page.locator('#costReadout').textContent()).length>0);
    assert.ok((await page.locator('#costHistoryRows tr').count())>1);
    await page.locator('#costRange').selectOption('1M');
    assert.ok((await page.locator('#costHistoryRows tr').count())<=32);
    await page.locator('#costRange').selectOption('All');
  }
  await page.locator('#costMetric').selectOption('cost');
  await page.locator('#costMode').selectOption('observed');
  assert.equal(await page.locator('#costHistoryRows tr').count(),fx.rates.filter(r=>r.day>='2026-10-15').length);
  assert.match(await page.locator('#costBasis').textContent(),/No CipSoft prices are known before 2026-10-15/);
  await page.locator('#costCurrency').selectOption('TIB');
  assert.equal(await page.locator('#costHistoryRows tr').count(),tokens.prices.filter(r=>r.day>='2026-10-15').length);
  await page.locator('#costMode').selectOption('scenario');
  assert.match(await page.locator('#costBasis').textContent(),/hypothetical equivalents/);
  assert.ok((await page.locator('#costHistoryRows tr').count())>300);
  await page.locator('#costCurrency').selectOption('BRL');
  await page.locator('#costMetric').selectOption('eur-brl');
  for(const width of [1440,1024,768,320]) {
    await page.setViewportSize({width,height:900});
    await page.screenshot({path:`${shots}/costs-${width}.png`,fullPage:width>900});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    assert.equal(overflow,false,`page overflow at ${width}`);
    assert.equal(await page.locator('#costCurrency').isVisible(),true);
    if(width<=900) assert.ok(await page.locator('#coinCosts').evaluate(e=>e.offsetTop < document.getElementById('dock').offsetTop),'comparison precedes asset details');
  }
  await page.setViewportSize({width:1440,height:900});
  for(const theme of ['light','dark']) {
    await page.evaluate(t=>window.tvTheme.set(t),theme);
    await page.locator('#costMetric').selectOption('power');
    await page.locator('#costMode').selectOption('scenario');
    await page.locator('#costHistoryTitle').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${shots}/history-${theme}.png`});
    const colors=await page.locator('.cost-key').evaluateAll(els=>els.map(e=>getComputedStyle(e,'::before').backgroundColor));
    assert.equal(new Set(colors).size,3);
    const contrast=await page.locator('#coinCosts').evaluate(root=>{
      const luminance=color=>{
        const rgb=color.match(/[\d.]+/g).slice(0,3).map(Number).map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
        return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
      };
      const background=luminance(getComputedStyle(root).backgroundColor);
      const ratio=color=>{const l=luminance(color);return(Math.max(l,background)+.05)/(Math.min(l,background)+.05);};
      return {text:[...root.querySelectorAll('.cost-note,.cost-best')].map(e=>ratio(getComputedStyle(e).color)),series:[...root.querySelectorAll('.cost-key')].map(e=>ratio(getComputedStyle(e,'::before').backgroundColor))};
    });
    assert.ok(contrast.text.every(v=>v>=4.5),`${theme} text contrast`);
    assert.ok(contrast.series.every(v=>v>=3),`${theme} history series contrast`);
    assert.match(await page.locator('#coinCosts').ariaSnapshot(),/combobox "Display currency"/);
  }
  await page.locator('#costCurrency').focus();await page.keyboard.press(engine===webkit?'Alt+Tab':'Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'costClose');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#coinCosts').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'coinCostsOpen');
  assert.equal(await page.locator('#chartPanel').isVisible(),true);
  await page.getByRole('button',{name:'Coin costs',exact:true}).click();
  // A failed refresh must retain cached reference rates and all comparison rows.
  await page.route('**/data/foreign-exchange/history.json',r=>r.fulfill({status:503,body:'unavailable'}));
  await page.locator('#costRefresh').click();
  await page.waitForFunction(()=>!document.getElementById('costRefresh').disabled);
  assert.match(await page.locator('#costStatus').textContent(),/Cached snapshot/);
  assert.equal(await page.locator('#costRows tr').count(),18);
  // Stale rates remain labelled and are never silently presented as fresh.
  await page.unroute('**/data/foreign-exchange/history.json');
  await page.evaluate(()=>localStorage.removeItem('tibinance.fx.ecb.v1'));
  await page.route('**/data/foreign-exchange/history.json',r=>r.fulfill({json:{...fx,rates:fx.rates.filter(p=>p.day<='2026-09-30')}}));
  await page.locator('#costRefresh').click();
  await page.waitForFunction(()=>!document.getElementById('costRefresh').disabled);
  assert.match(await page.locator('#costStatus').textContent(),/Stale FX data/);
  await page.unroute('**/data/foreign-exchange/history.json');
  // Failure without a cache has a retry path and does not break the token market.
  await page.evaluate(()=>localStorage.removeItem('tibinance.fx.ecb.v1'));
  await page.route('**/data/foreign-exchange/history.json',r=>r.fulfill({status:503,body:'unavailable'}));
  await page.reload();await page.getByRole('button',{name:'Coin costs',exact:true}).click();
  await page.waitForFunction(()=>!document.getElementById('costRefresh').disabled);
  assert.match(await page.locator('#costStatus').textContent(),/unavailable/);
  await page.unroute('**/data/foreign-exchange/history.json');
  await page.locator('#costRefresh').click();await page.locator('#costContent').waitFor({state:'visible'});
  assert.equal(await page.locator('#costCurrency').inputValue(),'BRL');
  await page.locator('#costClose').click();
  await Promise.all([page.waitForURL('**/markets.html?**asset=tibia-coin**'),page.locator('#asset').selectOption('tibia-coin')]);
  await page.waitForFunction(()=>document.getElementById('market').getAttribute('aria-busy')==='false');
  assert.equal(await page.locator('#coinCostsOpen').count(),0);
  assert.equal(await page.locator('#chartPanel').isVisible(),true);
  assert.deepEqual(errors,[]);
  console.log('Verified currency selection, 18 official rows, 7 historical metrics, dated/scenario separation, keyboard navigation, 4 responsive widths, retry, stale/cache states and TC regression.');
}finally {await browser.close();}
