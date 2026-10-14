// The Economy terminal in a real browser: reached from the site menu, read for what it states (every figure recomputed
// here from the same data files with js/economy-data.js), driven through its controls like Markets, and checked for what
// it must never do: show a figure the list and the chart disagree on, present an assumption as an observation, list a
// retired world as active, or scroll sideways.
// Run with the same local server / Playwright environment as markets-browser.mjs (TIBINANCE_BROWSER=webkit for WebKit).
// Set TIBINANCE_SCREENSHOTS to a directory to keep screenshots for inspection.
import {createRequire} from 'node:module';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {fmt} from '../js/format.js';
import {MEASURES,ratePeriods,rangeChange,contributions,periodOf,rangeStartOf,sumPeriod,sellOfferPeriods} from '../js/economy-data.js';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.TIBINANCE_NODE_MODULES ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
const engine=process.env.TIBINANCE_BROWSER ?? 'chrome';
const root=process.env.TIBINANCE_TEST_URL ?? 'http://127.0.0.1:8765';
const shots=process.env.TIBINANCE_SCREENSHOTS;
const load=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const overview=await load('data/economy/gold/overview.json');
const daily=async dir=>load(`data/economy/gold/worlds/${dir}.json`);
const gold=n=>fmt(Math.round(n));
const percent=new Intl.NumberFormat('en-US',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2,signDisplay:'exceptZero'});
// The latest complete period of a world at an interval, and its change over a range: the page's own arithmetic.
const expected=async(dir,interval,measure,range)=>{
  const periods=ratePeriods(await daily(dir),interval),field=MEASURES[measure].field;
  const last=periods.findLast(p=>p.rate.grossPotential!==null);
  return {last,value:last.rate[field],rates:last.rate,change:rangeChange(periods,field,range)};
};

const browser=await (engine==='webkit' ? webkit.launch({headless:true}) : chromium.launch({headless:true,...(process.env.TIBINANCE_CHROME ? {executablePath:process.env.TIBINANCE_CHROME} : {channel:'chrome'})}));
try {
  if (shots) await mkdir(shots,{recursive:true});
  const context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:900},acceptDownloads:true});
  // Every run starts with the dock as a first visit leaves it.
  await context.addInitScript(()=>{ if (!sessionStorage.getItem('seeded')) { localStorage.removeItem('tibinance.economy.dock'); sessionStorage.setItem('seeded','1'); } });
  // Observe the library's public chart API without adding test hooks to the shipped application.
  await context.addInitScript(()=>{
    Object.defineProperty(window,'LightweightCharts',{configurable:true,set(library){
      window.economyTestCharts=[]; window.economyTestSeries=[];
      const wrapped={...library,createChart(...args){const chart=library.createChart(...args);window.economyTestCharts.push(chart);
        const add=chart.addSeries.bind(chart);chart.addSeries=(...args)=>{const series=add(...args);window.economyTestSeries.push(series);return series;};
        return chart;}};
      Object.defineProperty(window,'LightweightCharts',{configurable:true,writable:true,value:wrapped});
    }});
  });
  const page=await context.newPage();
  const expectedFailures=new Set();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error' && !(expectedFailures.has(m.location().url) && /503|ERR_FAILED/.test(m.text()))) errors.push(m.text());});
  await page.route('**/data/observations.json',r=>r.fulfill({json:[]}));
  const text=sel=>page.$eval(sel,e=>e.innerText.trim().replace(/\s+/g,' '));
  const ready=()=>page.waitForFunction(()=>document.getElementById('economy').getAttribute('aria-busy')==='false',{timeout:60000});
  const param=name=>new URL(page.url()).searchParams.get(name);
  const row=world=>page.$eval(`#worlds tr[data-world="${world}"]`,tr=>[...tr.cells].map(c=>c.textContent.trim()));
  const listed=()=>page.$$eval('#worlds tr[data-world]',trs=>trs.map(tr=>tr.dataset.world));
  const shown=async world=>{await page.waitForFunction(w=>document.getElementById('world').textContent===w,world);await ready();await page.waitForTimeout(100);};

  // ---- A first visit exposes the entire recorded gold history, independently of TC price coverage.
  await page.goto(`${root}/`);
  await page.click('header.site [data-site-menu]');
  await page.click('#site-menu a[href="economy.html"]');
  await ready();
  assert.equal(await page.title(),'Tibinance Economy');
  assert.equal(await page.getAttribute('#site-menu a[aria-current="page"]','href'),'economy.html');
  assert.equal(await text('#world'),'Antica');
  assert.equal(param('range'),'All','a first visit must not hide the history before the last year');
  assert.equal(await page.getAttribute('#range [data-range="All"]','aria-checked'),'true');
  await page.waitForTimeout(100);
  const initialHistory=await daily('antica');
  const initialFirst=periodOf(initialHistory.first,'week')[0];
  const visibleFirst=await page.evaluate(()=>{
    const d=window.economyTestCharts[0].timeScale().getVisibleRange().from;
    return typeof d==='string'?d:`${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`;
  });
  assert.equal(visibleFirst,initialFirst,'the initial chart reaches the oldest gold data');
  const firstGold=await page.evaluate(()=>window.economyTestSeries.filter(s=>s.options().lineVisible===false)
    .find(s=>s.options().visible).data().find(p=>p.value!==undefined));
  assert.equal(firstGold.time,initialFirst,'gold before 2025 is plotted even with TC price enabled');
  assert.ok(firstGold.value>0);
  assert.equal(await text('#lastRange'),'All');
  assert.ok((await text('#through')).includes(`History ${initialHistory.first} to `),'the available start date is visible');
  if (shots) await page.screenshot({path:join(shots,`economy-${engine}-full-history.png`),fullPage:true});
  // Explicit shorter ranges remain available, and the existing interaction checks use 1Y.
  await page.click('#range [data-range="1Y"]');

  assert.deepEqual([param('world'),param('measure'),param('interval'),param('range')],['Antica','gross','week','1Y']);
  assert.equal(await page.locator('#measure #priceToggle').count(),1,'Tibia Coin price has a labelled control beside the gold series');
  assert.match(await text('#priceToggle'),/^Tibia Coin price/i);
  assert.equal(await page.getAttribute('#priceToggle','aria-pressed'),'true','Tibia Coin price is plotted by default');
  assert.ok(await page.evaluate(()=>window.economyTestSeries[1].data().some(p=>Number.isFinite(p.value))),'the price series contains actual observed values');

  // ---- The status: the latest complete week in gold per day, its change over the range, all three measures.
  let e=await expected('antica','week','gross','1Y');
  assert.equal(await text('#lastValue'),gold(e.value));
  assert.equal(await text('#lastChange'),`${e.change.delta>0?'+':''}${fmt(Math.round(e.change.delta))} ${percent.format(e.change.ratio)}`);
  assert.equal(await text('#lastRange'),'1Y');
  assert.deepEqual([await text('#measureGross'),await text('#measureCoins'),await text('#measureNpc')],[gold(e.rates.grossPotential),gold(e.rates.directCoins),gold(e.rates.npcPotential)]);
  assert.equal(await page.getAttribute('#measure [data-measure="gross"]','aria-pressed'),'true');
  // The readout at rest: the latest complete week, its measures, kills with their coverage, players killed.
  const legend=await text('#legend');
  assert.match(legend,new RegExp(`^Week ${e.last.start} to ${e.last.end.slice(5)}`,'i'));
  for (const name of ['Gross potential','Kills/day']) assert.ok(legend.includes(name),`${name} in the readout`);
  assert.ok(legend.includes(`${(100*e.last.killCoverage).toFixed(1)}% valued`));
  assert.doesNotMatch(await page.locator('#economy').textContent(),/Players killed|Direct coins|>Coins</);
  assert.match(await page.getAttribute('#chart','aria-label'),/^Antica, gross potential from valued creatures in gold per day, by week, range 1Y\./);
  assert.ok((await text('#through')).includes(`History ${initialHistory.first} to `));
  assert.ok(initialHistory.first);

  // ---- The watchlist: the active worlds, the selected one marked, its figures equal to the chart's.
  const active=['All',...overview.worlds.filter(w=>!w.ended && w.dir!=='all').map(w=>w.world).sort((a,b)=>a.localeCompare(b))];
  assert.deepEqual(await listed(),active);
  assert.equal(await text('#worldCount'),String(active.length-1));
  assert.equal(await page.getAttribute('#worlds tr[data-world="Antica"]','aria-selected'),'true');
  assert.deepEqual((await row('Antica')).slice(1),[gold(e.value),percent.format(e.change.ratio)],'the list and the chart agree');
  // Sorted by gold per day, largest first, then back by name.
  await page.click('table.watch th button[data-sort="value"]');
  const values=await page.$$eval('#worlds tr[data-world] td:nth-child(2)',tds=>tds.map(td=>Number(td.textContent.replace(/,/g,''))).filter(Number.isFinite));
  assert.ok(values.every((v,i)=>i===0||values[i-1]>=v),'largest first');
  assert.equal(await page.getAttribute('table.watch th:nth-child(2)','aria-sort'),'descending');
  await page.click('table.watch th button[data-sort="world"]');
  // A retired world appears when a search names it, marked R.
  const retired=overview.worlds.find(w=>w.ended);
  assert.ok(!(await listed()).includes(retired.world));
  await page.fill('#filter',retired.world.toLowerCase());
  assert.ok((await listed()).includes(retired.world));
  assert.equal(await page.$eval(`#worlds tr[data-world="${retired.world}"] .flag-retired`,f=>f.textContent),'R');
  await page.fill('#filter','');

  // All sums gold and overlays a separately labelled cross-world median TC price.
  await page.click('#worlds tr[data-world="All"] .pick'); await shown('All');
  assert.equal(param('world'),'All');
  assert.equal(await page.getAttribute('#priceToggle','disabled'),null);
  assert.equal(await page.getAttribute('#priceToggle','aria-pressed'),'true');
  assert.match(await page.getAttribute('#priceToggle','title'),/daily median across observed worlds/);
  assert.equal(await page.evaluate(()=>window.economyTestCharts[0].priceScale('left').options().visible),true);
  assert.ok(await page.evaluate(()=>window.economyTestSeries[1].data().some(p=>Number.isFinite(p.value))));
  assert.match(await text('#legend'),/TC Sell Offer \(world median\)/);
  assert.match(await page.locator('#chartData thead').textContent(),/World-days with data/);
  assert.match(await page.locator('#chartData thead').textContent(),/TC Sell.*Price days.*Worlds priced.*Price world-days/);
  const globalMarket=(await load('data/market-history/tibia-coin/index.json')).worlds;
  const globalHistory=await daily('all');
  for (const interval of ['day','month','week']) {
    await page.click(`#interval [data-interval="${interval}"]`);
    const total=await expected('all',interval,'gross','1Y');
    assert.equal(await text('#lastValue'),gold(total.value));
    assert.equal((await row('All'))[1],gold(total.value),'the global watchlist and chart agree');
    const prices=sellOfferPeriods(globalMarket,interval);
    const plotted=await page.evaluate(()=>window.economyTestSeries[1].data().filter(p=>Number.isFinite(p.value)).map(p=>[p.time,p.value]));
    assert.deepEqual(plotted,[...prices].map(([day,p])=>[day,p.sell]),`${interval}: All plots global TC medians`);
    assert.equal(await text('#measurePrice'),gold([...prices.values()].at(-1).sell));
    assert.match(await text('#legend'),/daily world medians; [\d,]+ worlds, [\d,]+ world-days/);

    assert.ok((await text('#detailNote')).includes(`${total.last.worldDaysCovered.toLocaleString('en-US')}/${total.last.worldDays.toLocaleString('en-US')} world-days`));
  }
  const globalPriceWindow=await page.evaluate(()=>window.economyTestCharts[0].timeScale().getVisibleLogicalRange());
  await page.click('#priceToggle');
  assert.equal(await page.getAttribute('#priceToggle','aria-pressed'),'false');
  assert.equal(await page.evaluate(()=>window.economyTestCharts[0].priceScale('left').options().visible),false);
  await page.click('#priceToggle');
  assert.equal(await page.getAttribute('#priceToggle','aria-pressed'),'true');
  const globalPriceWindowAfter=await page.evaluate(()=>window.economyTestCharts[0].timeScale().getVisibleLogicalRange());
  assert.ok(Math.abs(globalPriceWindow.from-globalPriceWindowAfter.from)<0.001 && Math.abs(globalPriceWindow.to-globalPriceWindowAfter.to)<0.001,'global TC toggle preserves the gold timeline');
  if (shots) await page.screenshot({path:join(shots,`economy-${engine}-all-worlds.png`)});
  await page.click('#range [data-range="All"]');
  await page.click('#valueMode [data-mode="accumulated"]');
  const globalLast=(await expected('all','week','gross','All')).last;
  const globalSum=sumPeriod(globalHistory,[globalHistory.first,globalLast.end]);
  assert.equal(await text('#lastValue'),gold(globalSum.grossPotential));
  assert.ok(globalSum.grossPotential>0);
  assert.equal(await page.evaluate(()=>window.economyTestCharts[0].priceScale('left').options().mode),0,'global TC retains its linear gold-per-coin unit beside log accumulated gold');
  assert.equal(await page.getAttribute('#priceToggle','aria-pressed'),'true');
  await page.reload(); await ready();
  assert.equal(await text('#world'),'All');
  assert.equal(await text('#lastValue'),gold(globalSum.grossPotential),'global accumulation survives reload');
  assert.equal(await page.getAttribute('#priceToggle','aria-pressed'),'true','global TC remains enabled after reload');
  assert.ok(await page.evaluate(()=>window.economyTestSeries[1].data().some(p=>Number.isFinite(p.value))));
  await page.setViewportSize({width:390,height:844}); await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,'All fits a phone viewport');
  if (shots) await page.screenshot({path:join(shots,`economy-${engine}-all-worlds-390.png`)});
  await page.click('[data-dock-target="creaturesPanel"]');
  assert.match(await text('#creatureNote'),/individual world/);
  await page.setViewportSize({width:1440,height:900}); await page.waitForTimeout(100);
  if (!await page.locator('#worldsPanel').isVisible()) await page.click('[data-dock-target="worldsPanel"]');
  await page.click('#worlds tr[data-world="Antica"] .pick'); await shown('Antica');
  assert.equal(await page.getAttribute('#priceToggle','aria-pressed'),'true','world-specific price preference survives All');
  await page.click('#valueMode [data-mode="daily"]');
  await page.click('#range [data-range="1Y"]');

  // ---- Another world from the list: the chart, the status and the address follow.
  await page.click('#worlds tr[data-world="Gentebra"] .pick');
  await shown('Gentebra');
  assert.equal(param('world'),'Gentebra');
  e=await expected('gentebra','week','gross','1Y');
  assert.equal(await text('#lastValue'),gold(e.value));
  assert.equal(await text('#detailLast'),gold(e.value));
  assert.equal(await text('#detailsWorld'),'Gentebra');
  // Up and Down move through the list, as on Markets.
  await page.focus('#worlds tr[data-world="Gentebra"] .pick');
  await page.keyboard.press('ArrowDown');
  const next=active[active.indexOf('Gentebra')+1];
  await shown(next);
  assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),next,'keyboard world focus survives the completed load');
  await page.click('#worlds tr[data-world="Antica"] .pick');
  await shown('Antica');

  // ---- The measure: coins, in the Sell colour; the list follows.
  await page.click('#measure [data-measure="coins"]');
  e=await expected('antica','week','coins','1Y');
  assert.equal(await text('#lastValue'),gold(e.value));
  assert.equal(param('measure'),'coins');
  assert.equal((await row('Antica'))[1],gold(e.value));
  assert.equal(await text('#detailLastLabel'),'Direct gold per day');

  // ---- The interval: months; then the range from the performance tiles.
  await page.click('#interval [data-interval="month"]');
  e=await expected('antica','month','coins','1Y');
  assert.equal(await text('#lastValue'),gold(e.value));
  assert.equal((await row('Antica'))[1],gold(e.value),'the list follows the interval');
  const tiles=await page.$$eval('#detailPerformance button',bs=>bs.map(b=>[b.dataset.range,b.querySelector('.perf-value').textContent]));
  for (const [range,value] of tiles) {
    const c=(await expected('antica','month','coins',range)).change;
    assert.equal(value,c ? percent.format(c.ratio) : 'N/A',`performance ${range}`);
  }
  await page.click('#detailPerformance [data-range="3M"]');
  assert.equal(await text('#lastRange'),'3M');
  assert.equal(await page.getAttribute('#range [data-range="3M"]','aria-checked'),'true');
  assert.equal(param('range'),'3M');
  await page.click('#measure [data-measure="coins"]');
  await page.click('#range [data-range="1Y"]');

  // ---- The TC Sell Offer, on request, on its own scale; named as a median of observed days.
  await page.click('#priceToggle');
  assert.equal(param('price'),'0','a hidden price is explicitly retained in the URL');
  assert.equal(param('series'),'gross','the price control does not toggle a gold series');
  await page.reload(); await ready();
  assert.equal(await page.getAttribute('#priceToggle','aria-pressed'),'false');
  const explored=await page.evaluate(async()=>{
    const chart=window.economyTestCharts[0],range=chart.timeScale().getVisibleLogicalRange();
    chart.timeScale().setVisibleLogicalRange({from:range.to-6,to:range.to});
    await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
    return chart.timeScale().getVisibleLogicalRange();
  });
  await page.click('#priceToggle');
  await page.waitForTimeout(80);
  const compared=await page.evaluate(()=>window.economyTestCharts[0].timeScale().getVisibleLogicalRange());
  assert.ok(Math.abs(compared.from-explored.from)<0.001 && Math.abs(compared.to-explored.to)<0.001,`comparison retains the explored time window: ${JSON.stringify({explored,compared})}`);
  assert.equal(await page.getAttribute('#priceToggle','aria-pressed'),'true');
  assert.match(await text('#legend'),/TC Sell Offer [\d,]+ median of \d+ days?/);
  assert.match(await page.getAttribute('#chart','aria-label'),/median TC Sell Offer per period on the left scale/);
  await page.click('#priceToggle');
  await page.click('#range [data-range="1Y"]');

  // ---- Assumptions: a liquidation rate and the constant creature set are labelled, dashed, never in place of the measure.
  await page.click('[data-dock-target="assumptionsPanel"]');
  const before=await text('#lastValue');
  await page.click('#liquidation [data-rate="0.5"]');
  e=await expected('antica','month','gross','1Y');
  assert.match(await text('#legend'),new RegExp(`Gold \\+ 50% NPC ${gold(e.rates.directCoins+0.5*e.rates.npcPotential).replace(/,/g,',')} assumption`));
  assert.equal(await text('#lastValue'),before,'the measure is unchanged by an assumption');
  assert.equal(param('rate'),'0.5');
  await page.click('#stable');
  assert.match(await text('#legend'),new RegExp(`Constant set ${gold(e.rates.grossStable)} comparison`));
  assert.match(await page.getAttribute('#chart','aria-label'),/an assumption\. With the constant creature set/);
  await page.click('#stable');
  await page.click('#liquidation [data-rate=""]');
  assert.doesNotMatch(await text('#legend'),/assumption|comparison/);

  // ---- Creatures behind the latest complete month, the rest summed as other.
  await page.click('[data-dock-target="creaturesPanel"]');
  const month=await page.$eval('#creatureMonth',s=>s.value);
  const contrib=await load('data/economy/gold/contributions/antica.json');
  const c=contributions(contrib,periodOf(`${month}-01`,'month'));
  const items=await page.$$eval('#creatureList li',lis=>lis.map(li=>[li.querySelector('.eco-list-name').textContent,li.querySelector('.eco-list-value').textContent]));
  assert.equal(items.length,c.rows.length+1);
  assert.equal(items[0][1],gold(c.rows[0].grossPotential));
  assert.equal(items.at(-1)[0],'Other creatures');
  assert.match(await text('#creatureNote'),new RegExp(`^${month}: ${gold(c.total.grossPotential).replace(/,/g,',')} gold of gross potential`));

  // ---- Research and method.
  await page.click('[data-dock-target="findingsPanel"]');
  const results=await load('reports/economy/results.json');
  const beaten=Object.values(results.forecasting.byHorizon).some(x=>['A','B','C','D','E'].some(m=>x.models[m].maeLogPct<x.models.constant.maeLogPct));
  assert.match(await text('#findings'),beaten ? /beats no change at some horizon/ : /No gold model beats the no-change forecast/);
  await page.click('[data-dock-target="helpPanel"]');
  const method=await text('#provenance');
  assert.match(method,/CC-BY-SA/);
  for (const k of (await load('data/economy/gold/index.json')).killstats) assert.ok(method.includes(k.commit.slice(0,7)));
  await page.click('[data-dock-target="worldsPanel"]');

  // ---- The crosshair reads another period.
  const plot=await page.$eval('#chart table tr td:nth-child(2)',el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  const atRest=await text('#legend .day');
  await page.mouse.move(plot.x+plot.w*0.3,plot.y+plot.h*0.5);
  await page.waitForTimeout(80);
  assert.notEqual(await text('#legend .day'),atRest);
  await page.mouse.move(plot.x+plot.w*0.5,plot.y-40);
  await page.waitForTimeout(80);

  // ---- Export: an image named for the view.
  const download=page.waitForEvent('download');
  await page.click('#exportButton');
  const file=await download;
  assert.match(file.suggestedFilename(),/^tibinance-economy-antica-gross-daily-month-1y-\d{4}-\d\d-\d\d\.png$/);
  if (shots) await page.screenshot({path:join(shots,`economy-${engine}-1440.png`)});

  // ---- Phone width: chart first, then the list; nothing sideways.
  const beforeResize=await page.evaluate(()=>window.economyTestCharts[0].timeScale().getVisibleLogicalRange());
  for (const width of [768,600,472,390,320]) {
    await page.setViewportSize({width,height:844});
    await page.waitForTimeout(250);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,`no sideways scroll at ${width}px`);
    const afterResize=await page.evaluate(()=>window.economyTestCharts[0].timeScale().getVisibleLogicalRange());
    assert.ok(Math.abs(afterResize.from-beforeResize.from)<0.001 && Math.abs(afterResize.to-beforeResize.to)<0.001,`time window survives resize to ${width}px`);
    if (shots) await page.screenshot({path:join(shots,`economy-${engine}-${width}.png`),fullPage:true});
  }

  // Series toggles use Tab and Space; radio groups support arrows/Home/End.
  await page.setViewportSize({width:1440,height:900});
  await page.goto(`${root}/economy.html?world=Antica&interval=week`); await ready();
  await page.locator('#measure [data-measure="coins"]').focus(); await page.keyboard.press('Space');
  assert.equal(await page.getAttribute('#measure [data-measure="coins"]','aria-pressed'),'true');
  assert.equal(await text('#lastValue'),gold((await expected('antica','week','coins','1Y')).value));
  await page.click('#measure [data-measure="coins"]');
  await page.locator('#interval [data-interval="week"]').focus(); await page.keyboard.press('ArrowRight');
  assert.equal(param('interval'),'month');
  for (const id of ['valueMode','range','interval']) assert.equal(await page.locator(`#${id} button[tabindex="0"]`).count(),1);
  await page.locator('#range [data-range="1Y"]').focus(); await page.keyboard.press('End');
  assert.equal(param('range'),'All');
  await page.click('#detailPerformance [data-range="1Y"]');
  await page.locator('#detailPerformance [data-range="1Y"]').focus(); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.range),'1Y','performance action retains focus');

  await page.click('[data-dock-target="assumptionsPanel"]');
  await page.locator('#liquidation [data-rate=""]').focus(); await page.keyboard.press('End');
  assert.equal(param('rate'),'1');
  await page.click('#stable');
  if (await page.getAttribute('#priceToggle','aria-pressed')!=='true') await page.click('#priceToggle');
  const allOptionsUrl=page.url();
  assert.equal(await page.evaluate(()=>window.economyTestCharts.length),1,'all comparisons reuse one chart instance');
  const selected=(await expected('antica','month','gross','1Y')).last;
  await page.click('[data-dock-target="helpPanel"]');
  await page.locator('.eco-data summary').click();
  const columns=await page.locator('#chartData thead').innerText();
  assert.match(columns,/Constant set/i); assert.match(columns,/assumption/i); assert.match(columns,/Price days/i);
  const exact=await page.locator('#chartData tr.current').innerText();
  for (const value of [selected.rate.grossPotential,selected.rate.directCoins,selected.rate.npcPotential,selected.rate.grossStable,selected.rate.kills]) assert.ok(exact.includes(gold(value)),`exact daily average ${value}`);
  assert.ok(await page.locator('#chartData tbody tr').count()>40);
  await page.setViewportSize({width:320,height:760});
  const dataFrame=page.locator('.eco-data-frame');
  await dataFrame.focus(); await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>document.querySelector('.eco-data-frame').scrollLeft>0);
  assert.ok(await dataFrame.evaluate(e=>e.scrollLeft)>0,'exact values scroll by keyboard');
  const overflow=await page.evaluate(()=>[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth && !e.closest('.eco-data-frame')).slice(0,4).map(e=>({tag:e.tagName,id:e.id,cls:e.className,right:e.getBoundingClientRect().right,text:e.textContent.slice(0,40)})));
  if (shots) await page.screenshot({path:join(shots,`economy-${engine}-help-320.png`)});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,JSON.stringify(overflow));
  await page.click('#interval [data-interval="day"]'); await page.click('#range [data-range="All"]');
  await page.waitForTimeout(100);
  const wholeHistory=await page.evaluate(()=>{
    const range=window.economyTestCharts[0].timeScale().getVisibleRange();
    const iso=d=>typeof d==='string'?d:`${d.year}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`;
    return [iso(range.from),iso(range.to)];
  });
  const anticaHistory=await daily('antica');
  assert.equal(wholeHistory[0],anticaHistory.first,'All retains the first recorded day even on a phone');

  // Independent series: rendering, exact-range accumulation, units, URL persistence and all hidden.
  await page.setViewportSize({width:1440,height:900});
  await page.goto(`${root}/economy.html?world=Antica&interval=week&range=3M`); await ready();
  const goldSeries=()=>page.evaluate(()=>window.economyTestSeries.filter(s=>s.options().lineVisible===false)
    .map(s=>({visible:s.options().visible,last:s.data().at(-1)?.value})));
  assert.deepEqual((await goldSeries()).map(s=>s.visible),[true,false,false]);
  const initialWindow=await page.evaluate(()=>window.economyTestCharts[0].timeScale().getVisibleLogicalRange());
  await page.click('#measure [data-measure="coins"]');
  await page.click('#measure [data-measure="npc"]');
  assert.deepEqual((await goldSeries()).map(s=>s.visible),[true,true,true]);
  assert.equal(param('series'),'gross,coins,npc');
  await page.click('#killsToggle');
  assert.equal(param('series'),'gross,coins,npc','hiding kills preserves every gold series');
  assert.equal(await page.evaluate(()=>window.economyTestSeries[0].options().visible),false);
  assert.doesNotMatch(await text('#legend'),/Kills\/day/);
  await page.click('#valueMode [data-mode="accumulated"]');
  const modeWindow=await page.evaluate(()=>window.economyTestCharts[0].timeScale().getVisibleLogicalRange());
  assert.ok(Math.abs(modeWindow.from-initialWindow.from)<0.001 && Math.abs(modeWindow.to-initialWindow.to)<0.001,'visibility and mode retain the chart window');
  assert.equal(param('mode'),'accumulated');
  assert.equal(await page.evaluate(()=>window.economyTestCharts[0].priceScale('right').options().mode),1,'accumulated gold uses a logarithmic scale');
  assert.equal(await page.getAttribute('#priceToggle','aria-pressed'),'true','Tibia Coin price remains shown in accumulated mode');
  assert.equal(await page.evaluate(()=>window.economyTestCharts[0].priceScale('left').options().mode),0,'price keeps its independent linear gold-per-TC scale');
  assert.equal(await page.evaluate(()=>window.economyTestCharts[0].priceScale('left').options().visible),true,'the price axis is visible');
  assert.ok(await page.evaluate(()=>window.economyTestSeries[1].data().some(p=>Number.isFinite(p.value))),'price is plotted alongside all accumulated gold series');
  for (const interval of ['week','month','day']) {
    await page.click(`#interval [data-interval="${interval}"]`);
    for (const range of ['1M','3M','YTD','All']) {
      await page.click(`#range [data-range="${range}"]`);
      const {last}=await expected('antica',interval,'npc',range);
      const sum=sumPeriod(await daily('antica'),[rangeStartOf(last.end,range) ?? (await daily('antica')).first,last.end]);
      assert.deepEqual((await goldSeries()).map(s=>s.last),[sum.grossPotential,sum.directCoins,sum.npcPotential],`${interval}/${range}: chart sums raw daily gold`);
      assert.equal(await text('#lastValue'),gold(sum.npcPotential),`${interval}/${range}: headline, ${page.url()}, sums ${JSON.stringify([sum.grossPotential,sum.directCoins,sum.npcPotential])}`);
      assert.ok((await text('#legend')).includes('accumulated gold'));
      assert.ok((await text('#legend')).includes(`${sum.covered}/${sum.days} days with data`));
      const row=await page.locator('#chartData tr.current').textContent();
      assert.ok(row.includes(gold(sum.grossPotential)) && row.includes(gold(sum.directCoins)) && row.includes(gold(sum.npcPotential)),`table matches plotted sums ${interval}/${range}: ${row}`);
      if (!sum.complete) assert.match(await text('#through'),/partial subtotal/);
    }
  }
  const shared=page.url(); await page.reload(); await ready();
  assert.equal(page.url(),shared);
  assert.deepEqual((await goldSeries()).map(s=>s.visible),[true,true,true]);
  assert.equal(await page.getAttribute('#killsToggle','aria-pressed'),'false');
  // Keep screenshots of this feature at desktop and phone widths, with all selected gold series visible.
  await page.click('#range [data-range="3M"]');
  if (!await page.locator('#worldsPanel').isVisible()) await page.click('[data-dock-target="worldsPanel"]');
  if (shots) await page.screenshot({path:join(shots,`economy-${engine}-accumulated-desktop.png`)});
  for (const width of [390,320]) {
    await page.setViewportSize({width,height:844}); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
    for (const label of ['Gross potential','Direct gold','NPC potential','TC Sell Offer']) assert.ok((await page.locator('#legend').innerText()).includes(label));
    if (shots) await page.screenshot({path:join(shots,`economy-${engine}-accumulated-${width}.png`)});
  }
  await page.setViewportSize({width:1440,height:900});
  for (const k of ['gross','coins','npc']) await page.click(`#measure [data-measure="${k}"]`);
  assert.deepEqual((await goldSeries()).map(s=>s.visible),[false,false,false]);
  await page.reload(); await ready();
  assert.deepEqual((await goldSeries()).map(s=>s.visible),[false,false,false]);
  await page.click('#measure [data-measure="coins"]');
  await page.locator('#valueMode [data-mode="accumulated"]').focus(); await page.keyboard.press('Home');
  assert.equal(await text('#lastValue'),gold((await expected('antica','day','coins','3M')).value));
  assert.equal(await page.evaluate(()=>window.economyTestCharts[0].priceScale('right').options().mode),0,'daily averages return to a linear scale');
  assert.equal(await page.evaluate(()=>window.economyTestCharts.length),1);
  await page.goto(allOptionsUrl); await ready();

  // The exact-data fallback remains usable when the chart CDN is unavailable.
  const chartUrl='https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.1/dist/lightweight-charts.standalone.production.js';
  expectedFailures.add(chartUrl);
  await page.route(chartUrl,r=>r.abort('failed'));
  await page.goto(allOptionsUrl); await ready();
  assert.match(await text('#chart'),/Interactive chart unavailable/);
  assert.equal(await page.locator('#exportButton').isDisabled(),true);
  if (!await page.locator('#helpPanel').isVisible()) await page.click('[data-dock-target="helpPanel"]');
  await page.locator('.eco-data summary').click();
  assert.ok(await page.locator('#chartData tbody tr').count()>40);
  assert.equal(await text('#lastValue'),gold(selected.rate.grossPotential));
  await page.unroute(chartUrl);

  // Failed requests never relabel previous data; a keyboard retry remains operable after repeated failure.
  await page.setViewportSize({width:1440,height:900});
  await page.goto(`${root}/economy.html?world=Antica&interval=week`); await ready();
  if (!await page.locator('#worldsPanel').isVisible()) await page.click('[data-dock-target="worldsPanel"]');
  const failure=`${root}/data/economy/gold/contributions/gentebra.json`;
  expectedFailures.add(failure);
  await page.route(failure,r=>r.fulfill({status:503,body:'test-only failure'}));
  await page.click('#worlds tr[data-world="Gentebra"] .pick');
  await page.waitForSelector('#retry:not([hidden])');
  assert.match(await text('#status'),/Gentebra.*Still showing Antica/);
  await page.click('#measure [data-measure="coins"]');
  assert.equal(await text('#world'),'Antica');
  assert.equal(param('world'),'Antica');
  assert.equal(await text('#lastValue'),gold((await expected('antica','week','coins','1Y')).value));
  assert.equal(await page.getAttribute('#worlds tr[data-world="Antica"]','aria-selected'),'true');
  await page.locator('#retry').focus(); await page.keyboard.press('Enter');
  await page.waitForSelector('#retry:not([hidden])');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'retry');
  await page.unroute(failure);
  await page.locator('#retry').focus(); await page.keyboard.press('Enter'); await shown('Gentebra');
  assert.equal(await page.evaluate(()=>document.activeElement.textContent.trim()),'Gentebra');
  assert.equal(await page.locator('#loadFeedback').isVisible(),false);

  const stale=`${root}/data/economy/gold/contributions/astera.json`;
  expectedFailures.add(stale);
  let releaseStale, seenStale, doneStale;
  const held=new Promise(resolve=>{releaseStale=resolve;});
  const seen=new Promise(resolve=>{seenStale=resolve;});
  const done=new Promise(resolve=>{doneStale=resolve;});
  await page.route(stale,async r=>{seenStale(); await held; await r.fulfill({status:503,body:'test-only stale failure'}); doneStale();});
  await page.click('#worlds tr[data-world="Astera"] .pick'); await seen;
  await page.click('#worlds tr[data-world="Secura"] .pick'); await shown('Secura');
  releaseStale(); await done; await page.waitForLoadState('networkidle');
  assert.equal(await text('#world'),'Secura');
  assert.equal(await page.locator('#loadFeedback').isVisible(),false);
  await page.unroute(stale);

  // An attempted navigation can stop after beforeunload without ever reaching pagehide.
  await page.evaluate(()=>dispatchEvent(new Event('beforeunload')));
  await page.click('#worlds tr[data-world="Belobra"] .pick'); await shown('Belobra');
  assert.equal(await page.locator('#loadFeedback').isVisible(),false);
  // Exercise the cache-restoration lifecycle explicitly (Chrome automation disables its actual cache).
  await page.evaluate(()=>{
    dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
    dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
  });
  await page.click('#worlds tr[data-world="Calmera"] .pick'); await shown('Calmera');

  // A test-only delayed font-ready promise must not let startup replace a world already chosen by the user.
  const startup=await context.newPage();
  startup.on('pageerror',error=>errors.push(error.message));
  await startup.addInitScript(()=>{
    const ready=document.fonts.ready;
    Object.defineProperty(document.fonts,'ready',{get:()=>new Promise(resolve=>{window.releaseEconomyFonts=()=>ready.then(resolve);})});
  });
  let releaseSelected, seenSelected;
  const selectedHold=new Promise(resolve=>{releaseSelected=resolve;});
  const selectedSeen=new Promise(resolve=>{seenSelected=resolve;});
  await startup.route(failure,async r=>{seenSelected(); await selectedHold; await r.continue();});
  await startup.goto(`${root}/economy.html`);
  await startup.waitForFunction(()=>typeof window.releaseEconomyFonts==='function');
  if (!await startup.locator('#worldsPanel').isVisible()) await startup.click('[data-dock-target="worldsPanel"]');
  await startup.fill('#filter','Gentebra');
  await startup.click('#worlds tr[data-world="Gentebra"] .pick'); await selectedSeen;
  await startup.evaluate(()=>window.releaseEconomyFonts());
  await startup.evaluate(()=>new Promise(requestAnimationFrame));
  releaseSelected();
  await startup.waitForFunction(()=>document.getElementById('world').textContent==='Gentebra' && document.getElementById('economy').getAttribute('aria-busy')==='false');
  assert.equal(new URL(startup.url()).searchParams.get('world'),'Gentebra');
  await startup.close();

  // Initial load also offers retry and only wires one set of controls after recovery.
  const indexUrl=`${root}/data/economy/gold/index.json`;
  expectedFailures.add(indexUrl);
  await page.route(indexUrl,r=>r.fulfill({status:503,body:'test-only initial failure'}));
  await page.goto(`${root}/economy.html`); await page.waitForSelector('#retry:not([hidden])');
  await page.locator('#retry').focus(); await page.keyboard.press('Enter');
  await page.waitForSelector('#retry:not([hidden])');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'retry');
  await page.unroute(indexUrl);
  const initialWorldFailure=`${root}/data/economy/gold/contributions/antica.json`;
  expectedFailures.add(initialWorldFailure);
  await page.route(initialWorldFailure,r=>r.fulfill({status:503,body:'test-only world failure after index retry'}));
  await page.locator('#retry').focus(); await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('Antica data could not be loaded'));
  assert.equal(await page.evaluate(()=>document.activeElement.id),'retry','initial data retry followed by a world failure retains Retry focus');
  await page.unroute(initialWorldFailure);
  await page.locator('#retry').focus(); await page.keyboard.press('Enter'); await shown('Antica');
  await page.locator('#measure [data-measure="coins"]').focus(); await page.keyboard.press('Space');
  assert.equal(await page.getAttribute('#measure [data-measure="coins"]','aria-pressed'),'true');
  await page.waitForFunction(()=>new URL(location.href).searchParams.get('measure')==='coins');
  assert.equal(param('measure'),'coins','Space toggles exactly one series after retry');
  assert.equal(await page.locator('input[type="checkbox"]').count(),0);
  assert.doesNotMatch(await page.content(),/\u00b7|&middot;/);
  assert.deepEqual(errors,[]);
  console.log(`PASS ${engine}: Economy terminal arithmetic, world list, measures/ranges/intervals, scenarios, full chart table, independent series, exact-range accumulation, keyboard and focus, export, preserved chart windows, 1440/768/600/472/390/320 layouts, chart-CDN fallback, failed-world identity, stale requests and keyboard retry`);
} finally {
  await browser.close();
}
