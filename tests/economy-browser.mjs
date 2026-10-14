// The Economy page in a real browser: reached from the site menu, read for what it states (figures recomputed here from
// the same data files with js/economy-data.js), driven through its controls, and checked for what it must never do:
// draw an unfinished period, present an assumption as an observation, rank incomparable worlds, or scroll sideways.
// Run with the same local server / Playwright environment as markets-browser.mjs (TIBINANCE_BROWSER=webkit for WebKit).
// Set TIBINANCE_SCREENSHOTS to a directory to keep full-page screenshots for inspection.
import {createRequire} from 'node:module';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import assert from 'node:assert/strict';
import {fmt} from '../js/format.js';
import {periodOf,previousPeriod,sumPeriod,growth,series,withLiquidation} from '../js/economy-data.js';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.TIBINANCE_NODE_MODULES ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
const engine=process.env.TIBINANCE_BROWSER ?? 'chrome';
const root=process.env.TIBINANCE_TEST_URL ?? 'http://127.0.0.1:8765';
const shots=process.env.TIBINANCE_SCREENSHOTS;
const load=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const index=await load('data/economy/gold/index.json');
const antica=await load('data/economy/gold/worlds/antica.json');
const gold=n=>fmt(Math.round(n));
const pct=v=>`${(100*v).toFixed(1)}%`;

const browser=await (engine==='webkit' ? webkit.launch({headless:true}) : chromium.launch({headless:true,...(process.env.TIBINANCE_CHROME ? {executablePath:process.env.TIBINANCE_CHROME} : {channel:'chrome'})}));
try {
  if (shots) await mkdir(shots,{recursive:true});
  const context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:900}});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  await page.route('**/data/observations.json',r=>r.fulfill({json:[]}));
  const text=selector=>page.$eval(selector,e=>e.innerText.trim().replace(/\s+/g,' '));
  // Headings are set in small capitals by CSS: their words are read as written.
  const words=selector=>page.$eval(selector,e=>e.textContent.trim().replace(/\s+/g,' '));
  const tiles=()=>page.$$eval('#tiles .eco-tile',ts=>ts.map(t=>({cls:t.className,label:t.querySelector('.eco-label').textContent,value:t.querySelector('.eco-value').textContent,sub:t.querySelector('.eco-sub')?.textContent ?? ''})));
  const ready=()=>page.waitForSelector('#economy:not([hidden])',{timeout:60000});

  // Reached from the site menu.
  await page.goto(`${root}/`);
  await page.click('header.site [data-site-menu]');
  await page.click('#site-menu a[href="economy.html"]');
  await ready();
  assert.equal(await page.title(),'Tibinance Economy');
  assert.equal(await page.getAttribute('#site-menu a[aria-current="page"]','href'),'economy.html');

  // With no period in the address: Antica, by month, at the latest complete month (an unfinished one would read as a
  // fall), and the address says so.
  const months=series(antica,'month').filter(p=>p.covered>0);
  const latest=months.findLast(p=>p.complete);
  assert.equal(await text('#ecoWorld'),'Antica');
  assert.equal(await page.$eval('#period',s=>s.value),latest.start);
  assert.equal(new URL(page.url()).searchParams.get('period'),latest.start);
  const incomplete=months.filter(p=>!p.complete).map(p=>p.start);
  assert.deepEqual(await page.$$eval('#period option',os=>os.filter(o=>o.textContent.endsWith('(incomplete)')).map(o=>o.value).sort()),incomplete.sort());
  const s=index.worlds.find(w=>w.world==='Antica');
  assert.match(await text('#ecoSpan'),new RegExp(`Kill days ${antica.first} to .*${fmt(s.recovered)} recovered exactly from weekly counts.*Kill coverage ${pct(s.killCoverage).replace('.','\\.')}`));

  // September 2025: the three quantities from valued creatures, apart, with their coverage and the change on August.
  await page.goto(`${root}/economy.html?world=Antica&unit=month&period=2025-09-01`);
  await ready();
  const sep=sumPeriod(antica,['2025-09-01','2025-09-30']),aug=sumPeriod(antica,['2025-08-01','2025-08-31']);
  assert.equal(sep.complete,true);
  let t=await tiles();
  assert.deepEqual(t.slice(0,5).map(x=>[x.label,x.value]),[
    ['Gross potential from valued creatures',gold(sep.grossPotential)],
    ['Direct coin drops',gold(sep.directCoins)],
    ['Potential NPC conversion',gold(sep.npcPotential)],
    ['Kill coverage',pct(sep.killCoverage)],
    ['Players killed by creatures',fmt(sep.playerDeaths)]]);
  const g=growth(sep,aug).value;
  assert.equal(t[0].sub,`${g>=0?'+':''}${pct(g)} on August 2025`);
  assert.match(t[2].sub,/potential, not gold that entered the game/);
  assert.match(t[3].sub,new RegExp(`${fmt(sep.killsValued)} of ${fmt(sep.kills)} kills valued; 30 of 30 days with data`));
  // No active-population history: the per-character figure says it is unavailable, and why.
  assert.equal(t.at(-1).label,'Gold per active character');
  assert.equal(t.at(-1).value,'Unavailable');
  assert.ok(t.every(x=>!x.cls.includes('assumption')),'no assumption without a chosen scenario');

  // A hypothetical liquidation rate is a labelled assumption beside the observations, never in place of them.
  await page.click('#liquidation [data-rate="0.5"]');
  t=await tiles();
  const assumed=t.find(x=>x.cls.includes('assumption'));
  assert.deepEqual([assumed.label,assumed.value],['Coins plus 50% of NPC potential',gold(withLiquidation(sep,0.5))]);
  assert.match(assumed.sub,/an assumption, not an observation/);
  assert.equal(t[0].value,gold(sep.grossPotential),'the gross potential is unchanged by a scenario');
  assert.match(await text('#legend'),/Coins \+ 50% NPC \(assumption\)/);
  assert.match(await words('#liqLabel'),/assumption/);
  await page.click('#liquidation [data-rate=""]');
  assert.ok((await tiles()).every(x=>!x.cls.includes('assumption')));

  // The constant creature set: creatures valued since the first day only.
  await page.check('#stable');
  t=await tiles();
  assert.deepEqual([t[0].label,t[0].value],['Gross potential, constant creature set',gold(sep.grossStable)]);
  await page.uncheck('#stable');

  // Contributions: the month's creatures, the rest summed as other, and a change only between complete months.
  const rows=await page.$$eval('#contrib tbody tr',trs=>trs.map(tr=>[...tr.cells].map(c=>c.textContent)));
  assert.ok(rows.length>=10);
  assert.equal(rows.at(-1)[0],'Other creatures');
  assert.match(await words('#contrib thead'),/Change on the previous month/);
  assert.ok(rows.slice(0,-1).some(r=>/%$/.test(r[6])),'August and September are complete: changes are shown');
  assert.match(await text('#contribNote'),/^Month 2025-09\. The listed creatures hold/);

  // A quarter: the period follows the unit, and the tiles sum the quarter.
  await page.click('#unit [data-unit="quarter"]');
  const q=periodOf('2025-09-01','quarter'),qs=sumPeriod(antica,q),qp=sumPeriod(antica,previousPeriod(q,'quarter'));
  assert.equal(await page.$eval('#period',s=>s.value),q[0]);
  assert.equal(new URL(page.url()).searchParams.get('unit'),'quarter');
  t=await tiles();
  assert.equal(t[0].value,gold(qs.grossPotential));
  assert.equal(t[0].sub,`${growth(qs,qp).value>=0?'+':''}${pct(growth(qs,qp).value)} on Q2 2025`);
  assert.match(await words('#contrib thead'),/Change on the previous quarter/);

  // An unfinished month: the figures stand with their coverage, no change and no creature change is computed.
  const open=months.findLast(p=>!p.complete);
  if (open) {
    await page.click('#unit [data-unit="month"]');
    await page.selectOption('#period',open.start);
    t=await tiles();
    assert.match(t[0].sub,/^Change: not computed/);
    assert.match(await text('#contribNote'),/No change is computed/);
    assert.ok((await page.$$eval('#contrib tbody tr td:nth-child(7)',tds=>tds.map(td=>td.textContent))).every(v=>v==='N/A'||v===''));
  }

  // Every world in the same month: sortable, Antica marked, comparability stated rather than assumed.
  await page.goto(`${root}/economy.html?world=Antica&unit=month&period=2025-09-01`);
  await ready();
  const worldRows=()=>page.$$eval('#worlds tbody tr',trs=>trs.map(tr=>({world:tr.cells[0].textContent,gross:tr.cells[1].textContent,current:tr.classList.contains('current'),note:tr.cells[tr.cells.length-1].textContent})));
  let w=await worldRows();
  assert.ok(w.length>50,`${w.length} worlds`);
  assert.deepEqual(w.filter(r=>r.current).map(r=>r.world),['Antica']);
  assert.equal(w.find(r=>r.world==='Antica').gross,gold(sep.grossPotential),'the table and the tiles agree');
  const num=v=>Number(v.replace(/,/g,''));
  assert.ok(w.every((r,i)=>i===0||num(w[i-1].gross)>=num(r.gross)),'sorted by gross potential, largest first');
  assert.equal(await page.getAttribute('#worlds th:nth-child(2)','aria-sort'),'descending');
  await page.click('#worlds button[data-sort="world"]');
  w=await worldRows();
  assert.deepEqual(w.map(r=>r.world),[...w.map(r=>r.world)].sort((a,b)=>a.localeCompare(b)));
  assert.equal(await page.getAttribute('#worlds th:nth-child(1)','aria-sort'),'ascending');
  await page.check('#comparableOnly');
  const comparable=await worldRows();
  assert.ok(comparable.length>0 && comparable.length<=w.length);
  assert.ok(comparable.every(r=>r.note==='Comparable'));
  assert.ok(w.some(r=>r.note!=='Comparable')||comparable.length===w.length);

  // The world picker in the header changes the world and the address.
  await page.click('#site-world .site-control');
  await page.keyboard.type('gentebra');
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.getElementById('ecoWorld').textContent==='Gentebra');
  assert.equal(new URL(page.url()).searchParams.get('world'),'Gentebra');
  assert.equal(await page.getAttribute('#site-world .site-control','aria-label'),'World: Gentebra');

  // The chart is drawn, with its panes described.
  assert.ok(await page.$eval('#chart',e=>e.querySelectorAll('canvas').length>0));
  assert.match(await page.getAttribute('#chart','aria-label'),/^Gold generation potential of Gentebra per month, with the Tibia Coin Sell Offer and players killed by creatures in separate panes/);

  // Findings and provenance: associations, not causes; sources at their commits.
  const findings=await text('#findings');
  assert.doesNotMatch(findings,/not available/);
  assert.match(findings,/R²/);
  assert.match(findings,/associations, not causes/);
  await page.click('.eco-provenance summary');
  const provenance=await text('#provenance');
  for (const k of index.killstats) assert.ok(provenance.includes(k.commit.slice(0,7)),`kill statistics ${k.repo} at its commit`);
  assert.match(provenance,/CC-BY-SA/);
  assert.match(provenance,/No NPC liquidation rate is assumed/);

  // Copy rules: no middle dot anywhere on the page.
  assert.doesNotMatch(await page.content(),/\u00b7|&middot;/);
  if (shots) await page.screenshot({path:join(shots,`economy-${engine}-1440.png`),fullPage:true});

  // Phone width: nothing scrolls sideways; wide tables scroll inside their own frames.
  for (const width of [768,390]) {
    await page.setViewportSize({width,height:844});
    await page.waitForTimeout(200);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,`no sideways scroll at ${width}px`);
    if (shots) await page.screenshot({path:join(shots,`economy-${engine}-${width}.png`),fullPage:true});
  }

  assert.deepEqual(errors,[]);
  console.log(`PASS ${engine}: Economy page reached from the menu; Antica figures recomputed from the data, latest complete period by default, labelled liquidation assumption, constant creature set, contributions and changes only between complete periods, cross-world sorting and comparability, world picker, findings and provenance, 1440/768/390 layouts`);
} finally {
  await browser.close();
}
