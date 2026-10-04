// The Markets Screener in a real browser against the committed market history.
// Run with the same local server / Playwright environment as tests/markets-browser.mjs.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {filterRows,screenerRows,sortRows} from '../js/market-screener.js';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.TIBINANCE_NODE_MODULES ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
const engine=process.env.TIBINANCE_BROWSER ?? 'chrome';
const root=process.env.TIBINANCE_TEST_URL ?? 'http://127.0.0.1:8765';
const read=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const index=await read('data/market-history/tibia-coin/index.json');
const overview=await read('data/market-history/tibia-coin/overview.json');
const number=new Intl.NumberFormat('en-US');
const signed=new Intl.NumberFormat('en-US',{signDisplay:'exceptZero'});
const percent=new Intl.NumberFormat('en-US',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:'exceptZero'});
const rows=(side,range)=>screenerRows(index,overview,{side,range});
const active=index.worlds.filter(w=>w.status==='active');
const browser=await (engine==='webkit' ? webkit.launch({headless:true}) : chromium.launch({headless:true,...(process.env.TIBINANCE_CHROME ? {executablePath:process.env.TIBINANCE_CHROME} : {channel:'chrome'})}));
try {
  const context=await browser.newContext({locale:'en-US',timezoneId:'America/Sao_Paulo',viewport:{width:1440,height:900}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  const ready=()=>page.waitForFunction(()=>document.getElementById('market').getAttribute('aria-busy')==='false');
  const param=name=>new URL(page.url()).searchParams.get(name);
  const cards=()=>page.$$eval('#screenerGrid .screen-card',cs=>cs.map(c=>c.dataset.world));
  const card=world=>page.locator(`#screenerGrid .screen-card[data-world="${world}"]`);
  const stat=async(world,label)=>card(world).locator('.screen-stats div',{hasText:label}).locator('dd').innerText();
  const toggle=page.getByRole('button',{name:'Screener'});
  // The overview arrives after the grid: Tx/day for Antica is a number once it has.
  const withOverview=()=>page.waitForFunction(()=>/\d/.test(document.querySelector('#screenerGrid .screen-card[data-world="Antica"] .screen-stats div:nth-child(4) dd')?.textContent ?? ''));

  await page.goto(`${root}/markets.html?world=Antica&side=sell&range=3M`);
  await ready();
  assert.equal(await page.getAttribute('#dock','data-open'),'worldsPanel','wide screens open Worlds by default');

  // The rail's Screener tool takes the chart's place, and the open panel gives its width to the grid.
  await toggle.click();
  await withOverview();
  assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  assert.ok(await page.isHidden('#chartPanel'));
  assert.ok(await page.isVisible('#screenerPanel'));
  assert.equal(param('view'),'screener');
  assert.deepEqual([param('world'),param('side'),param('range')],['Antica','sell','3M']);
  assert.equal(await page.getAttribute('#dock','data-open'),'');
  // The tools that act on the chart wait for it.
  assert.ok(await page.isDisabled('#exportButton'));
  assert.ok(await page.isDisabled('#projectionsToggle'));
  // Every active world, by name, with the selected one marked.
  const expected=sortRows(filterRows(rows('sell','3M'),{}),'world',1).map(r=>r.world);
  assert.deepEqual(await cards(),expected);
  assert.equal(expected.length,active.length);
  assert.equal(await page.textContent('#screenerCount'),`${active.length} worlds`);
  assert.equal(await card('Antica').getAttribute('aria-current'),'true');
  assert.equal(await page.$$eval('#screenerGrid [aria-current]',cs=>cs.length),1);

  // A card's figures are the dataset's, for the side and range.
  const check=async(world,side,range)=>{
    const r=rows(side,range).find(x=>x.world===world);
    assert.equal(await card(world).locator('.screen-last').innerText(),r.last===null ? 'N/A' : number.format(r.last));
    assert.equal((await card(world).locator('.screen-change').innerText()).replace(/\s+/g,' '),r.change ? `${signed.format(r.delta)} ${percent.format(r.ratio)}` : 'N/A');
    assert.equal(await stat(world,'Sell'),r.sell===null ? 'N/A' : number.format(r.sell));
    assert.equal(await stat(world,'Buy'),r.buy===null ? 'N/A' : number.format(r.buy));
    assert.equal(await stat(world,'Spread'),r.spread===null ? 'N/A' : number.format(r.spread));
    assert.equal(await stat(world,'Tx/day'),r.txPerDay===null ? 'N/A' : number.format(Math.round(r.txPerDay)));
    assert.equal(await stat(world,'Depth'),r.depth===null ? 'N/A' : number.format(r.depth));
    assert.equal(await card(world).getAttribute('href'),`markets.html?world=${world}&side=${side}&range=${range}`);
    return r;
  };
  const antica=await check('Antica','sell','3M');
  assert.ok(antica.txPerDay>0 && antica.depth>0,'Antica has daily figures and captured depth');
  assert.match(await card('Antica').locator('.screen-stats div',{hasText:'Tx/day'}).locator('dd').getAttribute('title'),/actual traded TC quantity is unknown/);
  assert.match(await card('Antica').locator('.screen-stats div',{hasText:'Depth'}).locator('dd').getAttribute('title'),/not traded volume/);
  // The mini chart: solid and dotted as on the chart, the hairline at the change's base, the latest point marked.
  assert.equal(await card('Antica').locator('svg.screen-spark .spark-last').count(),1);
  assert.equal(await card('Antica').locator('svg.screen-spark .spark-base').count(),1);
  // A stale world says the day of its latest best offer.
  const stale=rows('sell','3M').find(r=>r.status==='active' && r.stale && r.last!==null);
  assert.equal(await card(stale.world).locator('.screen-day').innerText(),`on ${stale.lastDay}`);
  // A world without market data has no mini chart.
  const empty=rows('sell','3M').find(r=>r.status==='active' && r.last===null);
  assert.equal(await card(empty.world).locator('.screen-none').innerText(),'No market data yet');

  // The range is the chart's: one choice for both, in the address.
  await page.click('#screenerRange [data-range="1Y"]');
  assert.equal(param('range'),'1Y');
  assert.equal(await page.getAttribute('#range [data-range="1Y"]','aria-checked'),'true');
  await check('Antica','sell','1Y');
  // So is the side, in the rail.
  await page.click('#side [data-side="buy"]');
  assert.equal(param('side'),'buy');
  assert.ok(await page.$eval('#screenerGrid',g=>g.classList.contains('side-buy')));
  await check('Belobra','buy','1Y');

  // Filters combine, and the count says how many of the status's worlds remain.
  await page.selectOption('#screenerType','Optional PvP');
  await page.selectOption('#screenerBattleye','Green');
  const optional=sortRows(filterRows(rows('buy','1Y'),{type:'Optional PvP',battleye:'Green'}),'world',1).map(r=>r.world);
  assert.deepEqual(await cards(),optional);
  assert.equal(await page.textContent('#screenerCount'),`${optional.length} of ${active.length} worlds`);
  assert.equal(await page.textContent('#screenerFiltersToggle'),'Filters (2)');
  await page.selectOption('#screenerLocation','Europe');
  assert.deepEqual(await cards(),optional.filter(w=>index.worlds.find(x=>x.world===w).location==='Europe'));
  await page.selectOption('#screenerData','current');
  assert.ok((await cards()).every(w=>!rows('buy','1Y').find(r=>r.world===w).stale));
  await page.click('#screenerReset');
  assert.equal((await cards()).length,active.length);

  // Sorting by a figure: largest first, worlds without it last; the arrow reverses it.
  await page.selectOption('#screenerSort','ratio');
  assert.deepEqual(await cards(),sortRows(filterRows(rows('buy','1Y'),{}),'ratio',-1).map(r=>r.world));
  await page.click('#screenerDirection');
  assert.equal(await page.getAttribute('#screenerDirection','aria-label'),'Ascending order');
  assert.deepEqual(await cards(),sortRows(filterRows(rows('buy','1Y'),{}),'ratio',1).map(r=>r.world));
  await page.selectOption('#screenerSort','txPerDay');
  assert.deepEqual(await cards(),sortRows(filterRows(rows('buy','1Y'),{}),'txPerDay',-1).map(r=>r.world));

  // Search; a retired world is one choice away when only it matches.
  await page.fill('#screenerFilter','ANTIC');
  assert.deepEqual(await cards(),['Antica']);
  await page.fill('#screenerFilter','Ambra');
  assert.deepEqual(await cards(),[]);
  assert.equal(await page.innerText('#screenerEmpty'),'No active world matches. Show 1 retired world');
  await page.click('#screenerEmpty button');
  assert.deepEqual(await cards(),['Ambra']);
  assert.equal(await page.inputValue('#screenerStatus'),'all');
  assert.equal(await card('Ambra').locator('.tag').innerText(),'RETIRED');
  await check('Ambra','buy','1Y');

  // The order and the filters are remembered on this device; the search is not.
  await page.reload();
  await ready();
  await withOverview().catch(()=>{});
  assert.ok(await page.isVisible('#screenerPanel'),'the address reopens the Screener');
  assert.equal(await page.inputValue('#screenerFilter'),'');
  assert.deepEqual([await page.inputValue('#screenerSort'),await page.inputValue('#screenerStatus')],['txPerDay','all']);
  await page.click('#screenerReset');

  // A card opens the world's chart, for the same side and range; the panel the Screener closed is back.
  await card('Belobra').click();
  await page.waitForFunction(()=>document.getElementById('world').textContent==='Belobra');
  assert.ok(await page.isVisible('#chartPanel'));
  assert.ok(await page.isHidden('#screenerPanel'));
  assert.equal(param('view'),null);
  assert.deepEqual([param('world'),param('side'),param('range')],['Belobra','buy','1Y']);
  assert.equal(await toggle.getAttribute('aria-pressed'),'false');
  assert.equal(await page.getAttribute('#dock','data-open'),'worldsPanel');
  assert.ok(await page.isEnabled('#exportButton'));
  assert.ok(await page.isEnabled('#projectionsToggle'));
  // The chart has its width back and shows the range.
  await page.waitForFunction(()=>document.getElementById('chart').getBoundingClientRect().width>600);

  // Choosing a world in the list from the Screener shows its chart too.
  await toggle.click();
  await page.click('[data-dock-target="worldsPanel"]');
  await page.click('#worlds tr[data-world="Antica"] .pick');
  await page.waitForFunction(()=>document.getElementById('world').textContent==='Antica');
  assert.ok(await page.isHidden('#screenerPanel'));
  // From the keyboard: a card opens the chart, and focus goes to the way back to the grid.
  await toggle.click();
  await card('Antica').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>!document.getElementById('chartPanel').hidden);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'screenerToggle');
  // And the rail tool brings the chart back as it left it.
  await toggle.click();
  await toggle.click();
  assert.ok(await page.isVisible('#chartPanel'));
  assert.equal(await page.textContent('#world'),'Antica');

  // A phone: the grid in the chart's place, one column, the filters folded behind a button, no list under it.
  const phone=await browser.newContext({locale:'en-US',viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const small=await phone.newPage();
  small.on('pageerror',e=>errors.push(e.message));
  await small.goto(`${root}/markets.html?world=Antica&side=sell&range=6M&view=screener`);
  await small.waitForFunction(()=>document.getElementById('market').getAttribute('aria-busy')==='false');
  assert.ok(await small.isVisible('#screenerPanel'));
  assert.ok(await small.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no sideways scroll');
  assert.ok(await small.isHidden('#screenerControls'));
  assert.ok(await small.isHidden('#worldsPanel'),'the list would repeat the grid');
  await small.click('#screenerFiltersToggle');
  assert.equal(await small.getAttribute('#screenerFiltersToggle','aria-expanded'),'true');
  assert.ok(await small.isVisible('#screenerControls'));
  const widths=await small.$$eval('#screenerGrid .screen-card',cs=>cs.slice(0,2).map(c=>[c.getBoundingClientRect().left,c.getBoundingClientRect().width]));
  assert.equal(widths[0][0],widths[1][0],'one column');
  assert.ok(await small.evaluate(()=>{const r=document.querySelector('.dock-rail').getBoundingClientRect();return r.bottom<=innerHeight+1;}),'the rail stays on the first screen');
  await small.click('#screenerFiltersToggle');
  await small.locator('#screenerGrid .screen-card[data-world="Antica"]').click();
  await small.waitForFunction(()=>!document.getElementById('chartPanel').hidden);
  assert.ok(await small.isVisible('#worldsPanel'));
  await phone.close();

  assert.deepEqual(errors,[]);
  console.log(`Markets Screener browser checks passed (${engine}).`);
} finally {
  await browser.close();
}
