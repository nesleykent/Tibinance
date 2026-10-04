// Markets page in a real browser against the committed market history.
// Run with the same local server / Playwright environment as tables-browser.mjs.
// Set TIBINANCE_SCREENSHOTS to a directory to keep full-page screenshots for inspection.
import {createRequire} from 'node:module';
import {readFile, mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {changeOver, rangeStart} from '../js/market-series.js';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.TIBINANCE_NODE_MODULES ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
const engine=process.env.TIBINANCE_BROWSER ?? 'chrome';
const root=process.env.TIBINANCE_TEST_URL ?? 'http://127.0.0.1:8765';
const shots=process.env.TIBINANCE_SCREENSHOTS;
const index=JSON.parse(await readFile(new URL('../data/market-history/tibia-coin/index.json',import.meta.url),'utf8'));
const number=new Intl.NumberFormat('en-US');
const signed=new Intl.NumberFormat('en-US',{signDisplay:'exceptZero'});
const percent=new Intl.NumberFormat('en-US',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:'exceptZero'});
const summary=world=>index.worlds.find(w=>w.world===world);
const active=index.worlds.filter(w=>w.status==='active').map(w=>w.world);
// A retired world's ranges end on its own last observed day; every other range ends with the dataset.
const endOf=w=>w.status==='retired' ? [w.bestOfferDays.last,w.dailyStatisticsDays.last].filter(Boolean).sort().at(-1) : index.through;
// [Chg, Chg%] exactly as the watchlist should print them, computed here from the dataset.
const expectedChange=(world,side,range)=>{
  const closes=summary(world).bestOfferCloses.map(c=>({day:c[0],value:c[side==='sell'?1:2]}));
  const change=changeOver(closes,rangeStart(endOf(summary(world)),range));
  return change ? [signed.format(change.to.value-change.from.value),percent.format(change.ratio)] : ['N/A','N/A'];
};
const browser=await (engine==='webkit' ? webkit.launch({headless:true}) : chromium.launch({headless:true,...(process.env.TIBINANCE_CHROME ? {executablePath:process.env.TIBINANCE_CHROME} : {channel:'chrome'})}));
try {
  if (shots) await mkdir(shots,{recursive:true});
  const context=await browser.newContext({locale:'en-US',timezoneId:'America/Sao_Paulo',viewport:{width:1440,height:900}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  const shown=world=>page.waitForFunction(w=>document.getElementById('world').textContent===w
    && document.getElementById('market').getAttribute('aria-busy')==='false' && document.querySelector('#legend .day'),world);
  const param=name=>new URL(page.url()).searchParams.get(name);
  const text=selector=>page.$eval(selector,e=>e.innerText.trim().replace(/\s+/g,' '));
  const chartBox=()=>page.$eval('#chart',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});

  // The existing page gains only the Markets link.
  await page.goto(`${root}/`);
  assert.equal(await page.title(),'Tibinance');
  assert.deepEqual(await page.$$eval('header.site nav a',as=>as.map(a=>[a.textContent,a.getAttribute('href')])),
    [['Markets','markets.html'],['Research','reports/tc-cycle/']]);
  await page.click('header.site nav a[href="markets.html"]');
  await shown('Antica');
  assert.equal(await page.title(),'Tibinance Markets');
  assert.equal(await page.getAttribute('header.site a[aria-current="page"]','href'),'markets.html');

  // One market, not two sources: no source is named anywhere in the page.
  assert.doesNotMatch(await page.content(),/tibiamarket/i);

  // Terminal layout: Sell/Buy and tools above the chart, ranges below it, the list beside it.
  assert.ok(await page.$('.toolbar-top #side') && await page.$('.toolbar-top #expand') && await page.$('.toolbar-top #helpButton'));
  assert.ok(await page.$('.toolbar-bottom #range'));
  const frame=await page.evaluate(()=>{
    const area=document.querySelector('.chart-area').getBoundingClientRect(),list=document.querySelector('.watchlist').getBoundingClientRect();
    const scroll=document.querySelector('.watch-scroll'),header=document.querySelector('header.site').getBoundingClientRect();
    return {pageScroll:document.documentElement.scrollHeight-innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,
      areaShare:area.height/(innerHeight-header.height),widthShare:area.width/innerWidth,beside:list.left>=area.right,
      listTop:list.top,areaTop:area.top,ownScroll:scroll.scrollHeight>scroll.clientHeight};
  });
  assert.ok(frame.pageScroll<=0 && frame.overflow<=0,'the terminal fits the viewport');
  assert.ok(frame.areaShare>0.75,`chart area is ${frame.areaShare} of the height under the header`);
  assert.ok(frame.widthShare>0.7,`chart area is ${frame.widthShare} of the width`);
  assert.ok(frame.beside && frame.ownScroll,'the watchlist is a side panel with its own scrolling');

  // Defaults: Antica, Sell, 1Y; every world listed with its latest best offer and absolute and percentage change.
  assert.deepEqual([param('world'),param('side'),param('range')],['Antica','sell','1Y']);
  // The default universe is every current world; retired worlds wait for a search.
  assert.equal(active.length,96);
  assert.deepEqual(await page.$$eval('#worlds tr',rows=>rows.map(r=>r.dataset.world)),active);
  assert.equal(await text('#worldCount'),String(active.length));
  for (const world of ['Antica','Gentebra','Floribra']) {
    const cells=await page.$$eval(`#worlds tr[data-world="${world}"] td`,tds=>tds.map(td=>td.textContent.trim()));
    assert.deepEqual(cells,[number.format(summary(world).latestBestOffer.sell),...expectedChange(world,'sell','1Y')],world);
  }
  assert.equal(await text('#lastPrice'),number.format(summary('Antica').latestBestOffer.sell));
  assert.equal(await text('#legend .day'),index.through);

  // Selecting a world updates the toolbar, the details, the legends and the address.
  await page.click('#worlds tr[data-world="Gentebra"]');
  await shown('Gentebra');
  const gentebra=summary('Gentebra').latestBestOffer;
  const closes=summary('Gentebra').bestOfferCloses;
  assert.equal(param('world'),'Gentebra');
  assert.equal(await text('#lastPrice'),number.format(gentebra.sell));
  assert.equal(await text('#lastChange'),expectedChange('Gentebra','sell','1Y').join(' '));
  assert.equal(await text('#detailsWorld'),'Gentebra');
  assert.deepEqual([await text('#detailSell'),await text('#detailBuy'),await text('#detailSpread')],
    [number.format(gentebra.sell),number.format(gentebra.buy),number.format(gentebra.sell-gentebra.buy)]);
  assert.equal(await text('#detailDaily'),'through 2026-09-11');
  // Copy rule: no middle dots anywhere, generated text included; the metadata is separate items instead.
  assert.doesNotMatch(await page.content(),/\u00b7|&middot;/);
  assert.deepEqual(await page.$$eval('#worldMeta > span',spans=>spans.map(s=>s.textContent)),['Optional PvP','BattlEye Yellow']);
  // The bottom toolbar holds only the ranges; the top toolbar keeps its single-row height.
  assert.equal(await text('.toolbar-bottom'),'1M 3M 6M YTD 1Y All');
  assert.ok(await page.$eval('.toolbar-top',e=>e.getBoundingClientRect().height)<=45,'top toolbar height');
  assert.equal(await page.getAttribute('#worlds tr[data-world="Gentebra"]','aria-selected'),'true');
  assert.match(await page.getAttribute('#chart','aria-label'),/^Gentebra, Best Sell Offer history, range 1Y\./);
  const [prior,last]=closes.slice(-2);
  assert.equal(await text('#legend'),`${last[0]} Best Sell Offer ${number.format(last[1])} ${signed.format(last[1]-prior[1])} `
    + `${percent.format(last[1]/prior[1]-1)} since ${prior[0]} last of 6 Daily average N/A`);
  assert.equal(await text('#volumeLegend'),'Volume N/A');

  // The legends follow the crosshair: a day in the September gap names the observations around it,
  // and a day with trading shows its average and volume.
  await page.click('#range button[data-range="3M"]');
  const box=await chartBox(),seen=[];
  for (let f=0.05;f<0.95;f+=0.01) {
    await page.mouse.move(box.x+box.w*f,box.y+box.h*0.4);
    seen.push([await text('#legend'),await text('#volumeLegend')]);
  }
  assert.ok(seen.some(([l])=>l.includes('Best Sell Offer not observed between 2026-09-12 and 2026-09-21') && l.endsWith('Daily average N/A')),'gap legend');
  assert.ok(seen.some(([l,v])=>/Daily average \d[\d,]*$/.test(l) && /^Volume \d[\d,]*$/.test(v)),'trading-day legend');
  await page.mouse.move(0,0);
  await page.waitForFunction(t=>document.querySelector('#legend .day').textContent===t,last[0]);

  // Side and range change every figure that depends on them.
  await page.click('#side button[data-side="buy"]');
  await page.waitForFunction(()=>document.getElementById('legend').textContent.includes('Best Buy Offer'));
  assert.equal(param('side'),'buy');
  assert.equal(await text('#lastPrice'),number.format(gentebra.buy));
  assert.equal(await page.$eval('#worlds tr[data-world="Gentebra"] td',td=>td.textContent.trim()),number.format(gentebra.buy));
  await page.click('#range button[data-range="All"]');
  assert.equal(param('range'),'All');
  assert.equal(await page.getAttribute('#range button[data-range="All"]','aria-checked'),'true');
  assert.equal(await page.$eval('#detailChangeLabel',e=>e.textContent),'Change All');
  assert.equal(await text('#detailChange'),expectedChange('Gentebra','buy','All').join(' '));
  assert.deepEqual(await page.$$eval('#worlds tr[data-world="Gentebra"] td:not(:first-of-type)',tds=>tds.map(td=>td.textContent.trim())),
    expectedChange('Gentebra','buy','All'));

  // Filtering, sorting and keyboard movement through the list.
  await page.fill('#filter','bra');
  assert.deepEqual(await page.$$eval('#worlds tr',rows=>rows.map(r=>r.dataset.world)),
    index.worlds.map(w=>w.world).filter(w=>w.toLowerCase().includes('bra')));
  await page.fill('#filter','zzz');
  assert.equal(await page.isHidden('#noWorlds'),false);
  await page.fill('#filter','');
  for (const [key,column] of [['ratio',4],['delta',3]]) {
    await page.click(`table.watch th button[data-sort="${key}"]`);
    assert.equal(await page.getAttribute(`table.watch th:nth-child(${column})`,'aria-sort'),'descending');
    const cells=await page.$$eval(`#worlds tr > :nth-child(${column})`,tds=>tds.map(td=>td.textContent.trim()));
    const values=cells.filter(c=>c!=='N/A').map(c=>Number(c.replace(/[%,+]/g,'')));
    assert.deepEqual(values,[...values].sort((a,b)=>b-a),key);
    assert.ok(!cells.includes('N/A') || cells.slice(cells.indexOf('N/A')).every(c=>c==='N/A'),'absent changes sort last');
  }
  await page.click('table.watch th button[data-sort="world"]');
  await page.focus('#worlds tr[data-world="Antica"] .pick');
  await page.keyboard.press('ArrowDown');
  const next=active[active.indexOf('Antica')+1];
  await shown(next);
  assert.equal(await page.evaluate(()=>document.activeElement.closest('tr').dataset.world),next);

  // Help replaces the explanatory paragraph; it opens under its button and closes with Escape.
  await page.click('#helpButton');
  await page.waitForFunction(()=>document.getElementById('help').matches(':popover-open'));
  const help=await text('#help');
  assert.match(help,/Dotted line: the days in between were not observed/);
  assert.match(help,new RegExp(`Daily figures for ${next} run through`));
  assert.match(help,/Search reaches retired worlds as well/);
  assert.match(help,new RegExp(`Server days run from 10:00 to 10:00 CET/CEST.*The market history runs through server day ${index.through}\\.`));
  assert.doesNotMatch(await page.content(),/\u00b7|&middot;/);
  const [button,panel]=await page.evaluate(()=>[document.getElementById('helpButton').getBoundingClientRect().bottom,document.getElementById('help').getBoundingClientRect().top]);
  assert.ok(panel>=button && panel-button<20,'help sits under its button');
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval('#help',e=>e.matches(':popover-open')),false);

  // Expand fills the screen with the chart and returns.
  await page.click('#expand');
  await page.waitForFunction(()=>document.getElementById('expand').getAttribute('aria-pressed')==='true');
  const expanded=await page.evaluate(()=>{const r=document.getElementById('chartPanel').getBoundingClientRect();return {w:r.width/innerWidth,h:r.height/innerHeight,
    mode:document.fullscreenElement?.id ?? (document.getElementById('chartPanel').classList.contains('expanded') ? 'expanded' : null)};});
  assert.ok(expanded.mode && expanded.w>0.99 && expanded.h>0.99,`expanded ${JSON.stringify(expanded)}`);
  await page.click('#expand');
  await page.waitForFunction(()=>document.getElementById('expand').getAttribute('aria-pressed')==='false' && !document.fullscreenElement);

  // A retired world deep-links like any other: labelled, listed while selected, ranges ending on its last day.
  await page.goto(`${root}/markets.html?world=jacabra&side=buy&range=6M`);
  await shown('Jacabra');
  const jacabra=summary('Jacabra');
  assert.deepEqual([jacabra.status,jacabra.offline,jacabra.mergedInto],['retired','2025-11-06','Terribra']);
  assert.equal(await text('#worldMeta .tag'),'RETIRED');
  assert.match(await page.$eval('#worldMeta',e=>e.textContent),/Offline since 2025-11-06, merged into Terribra/);
  assert.equal(await text('#lastChange'),expectedChange('Jacabra','buy','6M').join(' '));
  assert.notEqual(await text('#lastChange'),'N/A','a retired world has a change within its own history');
  assert.equal(await text('#legend .day'),endOf(jacabra),'a retired world reads out its own latest day');
  // In the list a compact R stands for Retired; the full status is its accessible name and tooltip.
  assert.deepEqual(await page.$$eval('#worlds tr[data-world="Jacabra"] .flag',t=>t.map(e=>[e.textContent,e.getAttribute('aria-label')])),
    [['R','Retired: offline since 2025-11-06, merged into Terribra.']]);
  assert.equal(await text('#detailStatus'),'Offline since 2025-11-06, merged into Terribra');
  assert.equal(await page.$$eval('#worlds tr',rows=>rows.length),active.length+1,'the selected retired world stays listed');
  // Regressions found in the final visual pass: a retired world's longer metadata keeps the toolbar on one
  // row, and a deep-linked world is scrolled into view once the details panel has filled.
  assert.ok(await page.$eval('.toolbar-top',e=>e.getBoundingClientRect().height)<=45,'a retired world keeps the toolbar on one row');
  assert.match(await page.getAttribute('#worldMeta','title'),/merged into Terribra/);
  assert.ok(await page.$eval('#worlds tr[data-world="Jacabra"]',row=>{const r=row.getBoundingClientRect(),box=row.closest('.watch-scroll').getBoundingClientRect();
    return r.top>=box.top && r.bottom<=box.bottom+1;}),'the deep-linked world is visible in the list');
  // Its successor is one click away and keeps its own, separate history.
  await page.click('#worldMeta .world-link');
  await shown('Terribra');
  assert.equal(await page.$('#worldMeta .tag'),null);
  assert.equal(await page.isHidden('#detailStatus'),true,'a current world has no retired status line');
  assert.equal(await page.$$eval('#worlds tr',rows=>rows.length),active.length,'retired worlds leave the list again');
  assert.ok(summary('Terribra').formedFrom.includes('Jacabra'));

  // Search reaches retired worlds, marked R in the results and labelled in full in the details.
  await page.fill('#filter','ambra');
  assert.deepEqual(await page.$$eval('#worlds tr',rows=>rows.map(r=>[r.dataset.world,r.querySelector('.flag-retired')?.textContent ?? ''])),
    index.worlds.filter(w=>w.world.toLowerCase().includes('ambra')).map(w=>[w.world,w.status==='retired' ? 'R' : '']));
  await page.click('#worlds tr[data-world="Ambra"]');
  await shown('Ambra');
  assert.match(await text('#detailsWorld'),/^Ambra RETIRED$/);
  assert.match(await page.$eval('#worldMeta',e=>e.textContent),/merged into Sombra/);
  // Following the successor link clears the search, so the successor is listed and selected.
  await page.click('#worldMeta .world-link');
  await shown('Sombra');
  assert.equal(await page.inputValue('#filter'),'');
  assert.equal(await page.$$eval('#worlds tr',rows=>rows.length),active.length);
  assert.equal(await page.getAttribute('#worlds tr[data-world="Sombra"]','aria-selected'),'true');

  // A current world without market data is listed with N/A and says so when selected.
  assert.deepEqual(await page.$$eval('#worlds tr[data-world="Jinxibra"] td',tds=>tds.map(td=>td.textContent.trim())),['N/A','N/A','N/A']);
  await page.click('#worlds tr[data-world="Jinxibra"]');
  await page.waitForFunction(()=>document.getElementById('world').textContent==='Jinxibra');
  await page.waitForFunction(()=>!document.getElementById('status').hidden);
  assert.equal(await text('#status'),'No market data for Jinxibra yet.');
  assert.ok(await page.$eval('#status',s=>{const r=s.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===s;}),
    'the message covers the chart, not the other way round');
  assert.equal(await text('#legend'),'');
  assert.equal(await text('#lastPrice'),'N/A');
  assert.equal(await text('#detailObserved'),'N/A','no observation reads N/A, not a blank');
  assert.doesNotMatch(await page.content(),/\u00b7|&middot;/);
  await page.goto(`${root}/markets.html?world=Nowhere&side=up&range=5D`);
  await shown('Antica');
  assert.deepEqual([param('world'),param('side'),param('range')],['Antica','sell','1Y']);

  // The World column shows names and compact indicators only: no dates, no badges.
  // Visible content only: the screen-reader note in each cell is meant to carry the date.
  const visibleCells=await page.$$eval('#worlds th',ths=>ths.map(t=>[...t.children].filter(c=>!c.classList.contains('sr-only')).map(c=>c.textContent).join(' ')));
  assert.ok(visibleCells.every(t=>!/\d{4}-\d{2}-\d{2}|Retired/i.test(t)),'no date or badge in the World column');
  assert.equal(await page.$('#worlds tr[data-world="Antica"] .flag'),null,'a current, recent world has no indicator');
  // An old latest best offer is an i indicator; its note is the accessible name, the world button's description and the tooltip.
  const aetheraNote=`Latest best offer: ${summary('Aethera').bestOfferDays.last}.`;
  assert.deepEqual(await page.$eval('#worlds tr[data-world="Aethera"] .flag',f=>[f.textContent,f.getAttribute('aria-label'),f.tabIndex]),['i',aetheraNote,0]);
  assert.equal(await page.$eval('#worlds tr[data-world="Aethera"] .pick',b=>document.getElementById(b.getAttribute('aria-describedby')).textContent),aetheraNote);
  const tip=()=>page.$eval('#watchTip',t=>t.hidden ? null : t.textContent);
  await page.hover('#worlds tr[data-world="Aethera"] .flag');
  assert.equal(await tip(),aetheraNote,'hover shows the note');
  await page.mouse.move(0,0);
  assert.equal(await tip(),null);
  await page.focus('#worlds tr[data-world="Aethera"] .pick');
  await page.keyboard.press('Tab');
  assert.ok(await page.evaluate(()=>document.activeElement.classList.contains('flag')),'the keyboard reaches the indicator');
  assert.equal(await tip(),aetheraNote,'focus shows the note');
  await page.keyboard.press('Escape');
  assert.equal(await tip(),null,'Escape dismisses it');
  // An indicator far down the list: the list scrolls before the hover, and the tooltip must survive that scroll.
  await page.hover('#worlds tr[data-world="Penumbra"] .flag');
  assert.equal(await tip(),`Latest best offer: ${summary('Penumbra').bestOfferDays.last}.`,'a scroll just before the hover keeps the tooltip');
  await page.mouse.move(0,0);
  await page.$eval('.watch-scroll',s=>{s.scrollTop=0;});
  assert.equal(await tip(),null,'leaving the indicator closes it');

  // Wide, tablet and phone: the chart leads and never scrolls sideways; narrow screens stack the list below.
  for (const [width,height] of [[1440,900],[768,1024],[390,844]]) {
    await page.setViewportSize({width,height});
    await page.goto(`${root}/markets.html?world=Gentebra&range=3M`);
    await shown('Gentebra');
    const layout=await page.evaluate(()=>{
      const chart=document.querySelector('.chart-panel').getBoundingClientRect(),list=document.querySelector('.watchlist').getBoundingClientRect();
      return {overflow:document.documentElement.scrollWidth-innerWidth,beside:list.left>=chart.right,below:list.top>=chart.bottom,share:chart.height/innerHeight};
    });
    assert.ok(layout.overflow<=0,`${width}px scrolls horizontally by ${layout.overflow}px`);
    assert.ok(width>900 ? layout.beside : layout.below,`${width}px watchlist placement`);
    assert.ok(layout.share>0.6,`${width}px chart height share ${layout.share}`);
    if (shots) await page.screenshot({path:join(shots,`markets-${engine}-${width}.png`),fullPage:true});
    if (width===390) {
      // Phones hide the toolbar metadata; the merge line and its link stay reachable in the details under the chart.
      await page.fill('#filter','zeph');
      await page.click('#worlds tr[data-world="Zephyra"]');
      await shown('Zephyra');
      assert.equal(await page.isHidden('#worldMeta'),true);
      assert.equal(await page.isVisible('#detailStatus'),true);
      assert.equal(await text('#detailStatus'),'Offline since 2025-11-06, merged into Kalanta');
      assert.equal(await text('#worlds tr[data-world="Zephyra"] .flag'),'R');
      await page.click('#detailStatus .world-link');
      await shown('Kalanta');
      assert.equal(await page.inputValue('#filter'),'');
      assert.equal(await page.getAttribute('#worlds tr[data-world="Kalanta"]','aria-selected'),'true');
      assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=0);
    }
  }

  // A missing dataset says so instead of showing an empty chart.
  const broken=await context.newPage();
  await broken.route('**/data/market-history/tibia-coin/index.json',r=>r.fulfill({status:404,body:''}));
  await broken.goto(`${root}/markets.html`);
  await broken.waitForFunction(()=>document.getElementById('status').textContent.includes('could not be loaded'));
  assert.equal(await broken.isVisible('#status'),true);
  await broken.close();

  assert.deepEqual(errors.filter(e=>!e.includes('index.json')),[]);
  console.log(`Markets browser checks passed (${engine}).`);
} finally {
  await browser.close();
}
