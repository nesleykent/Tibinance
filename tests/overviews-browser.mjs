// The overview pages in TradingView's /markets/ idiom (markets-overview.html, economy-overview.html) in a real browser,
// against the committed datasets: the summary and its cards, the highlights, the heatmap, the regions, the table, the
// calendar and the world search, their figures traced to the data, and the layout at desktop, tablet and phone widths.
// Run with the same local server / Playwright environment as markets-browser.mjs.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.TIBINANCE_NODE_MODULES ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
const engine=process.env.TIBINANCE_BROWSER ?? 'chrome';
const root=process.env.TIBINANCE_TEST_URL ?? 'http://127.0.0.1:8765';
const load=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const index=await load('data/market-history/tibia-coin/index.json'),gold=await load('data/economy/gold/overview.json');
const marketWorlds=index.worlds.filter(w=>w.status==='active' && w.bestOfferCloses.length).map(w=>w.world).sort();
// The overview's aggregate row (dir 'all') heads the figures and is not a world.
const goldAll=gold.worlds.find(w=>w.dir==='all');
const goldWorlds=gold.worlds.filter(w=>w!==goldAll && !w.ended && w.week?.gross).map(w=>w.world).sort();
const browser=await (engine==='webkit' ? webkit.launch({headless:true}) : chromium.launch({headless:true,...(process.env.TIBINANCE_CHROME ? {executablePath:process.env.TIBINANCE_CHROME} : {channel:'chrome'})}));
try {
  const context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:900},colorScheme:'light'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  const text=selector=>page.$eval(selector,e=>e.innerText.trim().replace(/\s+/g,' '));
  const fits=()=>page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);

  // ---- Markets overview.
  await page.goto(`${root}/markets-overview.html`);
  await page.waitForSelector('#summaryCards li');
  assert.equal(await page.title(),'Tibinance Markets overview');
  assert.equal(await page.getAttribute('#site-menu a[aria-current="page"]','href'),'markets-overview.html');
  assert.equal(await page.textContent('[data-through]'),index.through);
  // The summary: an index per card, the chart following the card and the range chosen.
  assert.deepEqual(await page.$$eval('#summaryCards .tv-card-name',c=>c.map(e=>e.childNodes[0].textContent)),['TC Sell index','TC Buy index','Spread index','Market activity','Tibia Token']);
  assert.match(await text('#summaryName'),/^TC Sell index: /);
  assert.match(await text('#summaryLast'),/^\d{2},\d{3}$/);
  await page.click('#summaryCards [data-id="buy"]');
  assert.match(await text('#summaryName'),/^TC Buy index: /);
  assert.equal(await page.getAttribute('#summaryCards [data-id="buy"]','aria-pressed'),'true');
  await page.click('#summaryRanges [data-range="3M"]');
  assert.match(await text('#summaryChange'),/3M$/);
  // Highlights: four lists of six worlds, each linking to its chart; gainers in order of their 1M change.
  for (const id of ['hotGainers','hotLosers','hotActive','hotSpread']) {
    assert.equal(await page.$$eval(`#${id} li`,l=>l.length),6,id);
    assert.match(await page.getAttribute(`#${id} li a`,'href'),/^markets\.html\?world=/);
  }
  const gains=await page.$$eval('#hotGainers .tv-pill',p=>p.map(e=>Number(e.textContent.replace(/[%+,]/g,''))));
  assert.deepEqual(gains,[...gains].sort((a,b)=>b-a));
  // The heatmap and the table: every active world once.
  assert.deepEqual(await page.$$eval('#heatmap .tv-tile',t=>t.map(e=>e.dataset.name).sort()),marketWorlds);
  assert.equal(await page.$$eval('#worldsTable tbody tr',r=>r.length),marketWorlds.length);
  const antica=index.worlds.find(w=>w.world==='Antica').latestBestOffer;
  assert.deepEqual(await page.$$eval('#worldsTable tr[data-key="Antica"] td',td=>td.slice(1,4).map(e=>e.textContent)),
    [antica.sell,antica.buy,antica.sell-antica.buy].map(v=>v.toLocaleString('en-US')));
  await page.click('#worldsTable th[data-key="sell"] button');
  const sells=await page.$$eval('#worldsTable tbody tr td:nth-child(2)',td=>td.map(e=>Number(e.textContent.replace(/,/g,''))).filter(Number.isFinite));
  assert.deepEqual(sells,[...sells].sort((a,b)=>b-a),'sorted by Sell');
  await page.fill('#worldsFilter','gente');
  assert.deepEqual(await page.$$eval('#worldsTable tbody tr',r=>r.map(e=>e.dataset.key)),['Gentebra']);
  // The heatmap's controls redraw it.
  const colours=()=>page.$$eval('#heatmap .tv-tile',t=>t.map(e=>e.style.background).join());
  const before=await colours();
  await page.selectOption('#heatRange','1Y');
  assert.notEqual(await colours(),before);
  // Regions and the calendar.
  assert.ok(await page.$$eval('#regions li',l=>l.length)>=3);
  assert.ok(await page.$$eval('#calendar li',l=>l.length)>0);
  await page.click('#calendarTabs [data-period="recent"]');
  assert.equal(await page.getAttribute('#calendarTabs [data-period="recent"]','aria-pressed'),'true');
  // The search opens a world in its terminal.
  await page.click('#pageSearch');
  await page.keyboard.type('secura');
  await page.keyboard.press('Enter');
  await page.waitForURL(/markets\.html\?world=Secura/);
  await page.waitForFunction(()=>document.getElementById('world').textContent==='Secura');

  // ---- Economy overview.
  await page.goto(`${root}/economy-overview.html`);
  await page.waitForSelector('#statCards .tv-stat');
  assert.equal(await page.title(),'Tibinance Economy overview');
  assert.equal(await page.getAttribute('#site-menu a[aria-current="page"]','href'),'economy-overview.html');
  // The headline gross: the aggregate's latest complete week, the sum of every active world's (to rounding).
  const sum=goldAll?.week.gross[0] ?? gold.worlds.filter(w=>!w.ended && w.week?.gross).reduce((a,w)=>a+w.week.gross[0],0);
  assert.ok(Math.abs(sum-gold.worlds.filter(w=>w!==goldAll && !w.ended && w.week?.gross).reduce((a,w)=>a+w.week.gross[0],0))<=goldWorlds.length,'the aggregate is the sum of the worlds');
  const shortFormat=new Intl.NumberFormat('en-US',{notation:'compact',maximumFractionDigits:2});
  assert.equal(await page.textContent('#statCards [data-id="gross"] .tv-stat-value'),shortFormat.format(sum));
  assert.deepEqual(await page.$$eval('#statCards .tv-stat',s=>s.map(e=>e.dataset.id)),['gross','coins','npc','kills']);
  await page.click('#statCards [data-id="kills"]');
  assert.match(await text('#summaryName'),/^Creature kills/);
  assert.match(await text('#summaryUnit'),/^kills per day, \d{4}-\d{2}, \d+ worlds$/);
  assert.deepEqual(await page.$$eval('#heatmap .tv-tile',t=>t.map(e=>e.dataset.name).sort()),goldWorlds);
  assert.equal(await page.$$eval('#worldsTable tbody tr',r=>r.length),goldWorlds.length);
  for (const id of ['hotRichest','hotGrowing','hotShrinking','hotNpc']) assert.equal(await page.$$eval(`#${id} li`,l=>l.length),6,id);
  assert.match(await page.getAttribute('#hotRichest li a','href'),/^economy\.html\?world=/);
  await page.selectOption('#heatMeasure','npc');
  assert.ok(await page.$$eval('#regions li',l=>l.length)>=3);

  // ---- Layout: no sideways scroll; the copy rule.
  for (const path of ['markets-overview.html','economy-overview.html']) {
    for (const [width,height] of [[1440,900],[768,1024],[390,844]]) {
      await page.setViewportSize({width,height});
      await page.goto(`${root}/${path}`);
      await page.waitForSelector('#heatmap .tv-tile');
      assert.equal(await fits(),0,`${path} at ${width}px`);
      assert.ok(await page.$eval('#heatmap',h=>h.getBoundingClientRect().width)<=width,`${path} heatmap at ${width}px`);
    }
    assert.doesNotMatch(await page.content(),/\u00b7|&middot;/);
  }

  assert.deepEqual(errors,[]);
  console.log(`PASS ${engine}: Markets and Economy overviews: summary and cards, highlights, heatmap, regions, table, calendar, search, 1440/768/390 layouts`);
} finally {
  await browser.close();
}
