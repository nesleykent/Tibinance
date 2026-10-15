// The Forecast history panel and layer on the Markets chart, in a real browser against the committed forecast archive
// and market history. Expected editions, dates and values are read from the archive with the same functions the page
// uses (js/forecast-archive.js), never written in.
// Run with the same local server / Playwright environment as markets-browser.mjs.
import {createRequire} from 'node:module';
import {readFile, mkdtemp} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {SIDE_KEY, endOfDay, historyEditions, horizonPoint, scenarioSeries} from '../js/forecast-archive.js';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.TIBINANCE_NODE_MODULES ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
const engine=process.env.TIBINANCE_BROWSER ?? 'chrome';
const root=process.env.TIBINANCE_TEST_URL ?? 'http://127.0.0.1:8765';
const file=path=>new URL(`../${path}`,import.meta.url);
const archive=JSON.parse(await readFile(file('data/forecast-archive/index.json'),'utf8'));
const market=JSON.parse(await readFile(file('data/market-history/tibia-coin/index.json'),'utf8'));
const outputs=async f=>JSON.parse(gunzipSync(await readFile(file(`data/forecast-archive/objects/${f.outputs}.json.gz`))).toString());
const n=new Intl.NumberFormat('en-US');
const today=new Date().toISOString().slice(0,10);
const W='Antica';
const listed=(day,options)=>historyEditions(archive,endOfDay(day),options);
const now=listed(today);
assert.ok(now.published.length>=2,'the archive holds at least two published editions');
// The worlds the Research has no path for: one the panel must say so for.
const first=await outputs(now.published[0].forecast);
const pathless=market.worlds.find(w=>w.status!=='retired' && !first.worldPaths.some(p=>p.world===w.world))?.world;

const browser=await (engine==='webkit' ? webkit.launch({headless:true}) : chromium.launch({headless:true,...(process.env.TIBINANCE_CHROME ? {executablePath:process.env.TIBINANCE_CHROME} : {channel:'chrome'})}));
try {
  const context=await browser.newContext({locale:'en-US',timezoneId:'America/Sao_Paulo',viewport:{width:1440,height:900},acceptDownloads:true});
  // Every check starts with the rail closed, as on a first visit.
  await context.addInitScript(()=>{ if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tibinance.markets.dock',''); sessionStorage.setItem('seeded','1'); } });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  const requests=[];page.on('request',r=>requests.push(new URL(r.url()).pathname));
  const text=sel=>page.$eval(sel,e=>e.innerText.trim().replace(/\s+/g,' '));
  const label=()=>page.getAttribute('#chart','aria-label');
  const open=async(world,side='sell')=>{
    await page.goto(`${root}/markets.html?world=${world}&side=${side}&range=1Y`);
    await page.waitForFunction(w=>document.getElementById('world').textContent===w && document.getElementById('market').getAttribute('aria-busy')==='false',world);
  };
  const editions=()=>page.$$eval('#historyEditions li',lis=>lis.map(li=>({title:li.querySelector('.history-draw span:last-child').textContent,
    point:li.querySelector('.history-point').textContent.replace(/\s+/g,' '),checked:li.querySelector('button').getAttribute('aria-pressed')==='true',disabled:li.querySelector('button').disabled,cls:li.className})));
  const settle=()=>page.waitForFunction(()=>!document.getElementById('historyContext').textContent.startsWith('Loading'));
  const plotBox=()=>page.$eval('#chart table tr td:nth-child(2)',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  const dayAt=async f=>{const b=await plotBox();await page.mouse.move(b.x+b.w*f,b.y+b.h*0.35);await page.waitForTimeout(40);return text('#legend .day');};

  // ---- Nothing loads until the panel opens: the market works as before.
  await open(W);
  assert.deepEqual(requests.filter(p=>p.includes('/forecast-archive/')),[],'the archive loads only with its panel');
  assert.equal(await text('#historyLegend'),'');
  await page.click('#historyToggle');
  await settle();
  assert.equal(await page.getAttribute('#historyToggle','aria-expanded'),'true');

  // ---- The editions public today, newest first, each with its evidence and its point 4 weeks ahead for this world.
  let shown=await editions();
  assert.deepEqual(shown.map(e=>e.title),now.published.map(x=>`Edition of ${x.forecast.dataCutoff}`));
  const point=async(x,weeks,side='sell')=>horizonPoint(scenarioSeries(await outputs(x.forecast),W,SIDE_KEY[side]),weeks);
  for (const [i,x] of now.published.entries()) {
    const p=await point(x,4);
    assert.ok(shown[i].point.includes(`week of ${p.target}: ${n.format(Math.round(p.base))}, band ${n.format(Math.round(p.low))} to ${n.format(Math.round(p.high))}`),shown[i].point);
  }
  const metas=await page.$$eval('#historyEditions li',lis=>lis.map(li=>li.querySelector('.history-meta').textContent));
  now.published.forEach((x,i)=>assert.equal(metas[i],`Public since ${x.publication.at.slice(0,10)}, ${x.publication.level==='website' ? 'website deployment' : 'repository only: no website deployment recorded'}`));
  assert.match(await text('#historyContext'),new RegExp(`^${now.published.length} editions of the Research offer scenario were public on ${today}`));
  await page.selectOption('#historyHorizon','13');
  shown=await editions();
  assert.ok(shown[0].point.startsWith(`13 weeks ahead, week of ${(await point(now.published[0],13)).target}`));
  // No accuracy yet where no target week has closed, and no request for evaluations that do not exist.
  if (!archive.chain.evaluations) {
    assert.match(await text('#historyAccuracy'),/^No target week of these editions has closed with an observation for Antica yet/);
    assert.ok(!requests.some(p=>p.endsWith('evaluations.jsonl')));
  }

  // ---- As of a date: only what was public by the end of that day; the evidence filter can drop repository-only ones.
  const days=[...new Set(archive.forecasts.map(f=>f.evidence?.website?.at ?? f.evidence?.repository?.at).filter(Boolean).map(t=>t.slice(0,10)))].sort();
  for (const day of [days[0],days.at(-1)]) {
    await page.fill('#historyAsOf',day);
    await page.dispatchEvent('#historyAsOf','change');
    await settle();
    assert.equal((await editions()).length,listed(day).published.length,`as of ${day}`);
  }
  const before=new Date(Date.parse(`${days[0]}T00:00:00Z`)-86400000).toISOString().slice(0,10);
  await page.fill('#historyAsOf',before);
  await page.dispatchEvent('#historyAsOf','change');
  await page.waitForFunction(()=>document.getElementById('historyContext').textContent.startsWith('No edition'));
  assert.equal((await editions()).length,0);
  await page.fill('#historyAsOf',today);
  await page.dispatchEvent('#historyAsOf','change');
  await page.selectOption('#historyEvidence','website');
  await settle();
  assert.equal((await editions()).length,listed(today,{fallback:false}).published.length,'website evidence only');
  await page.selectOption('#historyEvidence','repository');
  await page.click('#historyArchived');
  assert.match(await text('#historyUnpublished'),/^Archived, never published/);
  assert.equal(await page.$$eval('#historyUnpublished li',lis=>lis.length),now.unpublished.length);
  await page.click('#historyArchived');

  // ---- Draw: choosing an edition shows the paths; each keeps its slot; three at most.
  await page.selectOption('#historyHorizon','4');
  const end=market.through;
  assert.equal(await dayAt(0.999),end,'before any choice the chart ends with the history');
  await page.locator('#historyEditions button').nth(0).click();
  await page.waitForFunction(()=>document.getElementById('chart').getAttribute('aria-label').includes('Past forecasts drawn'));
  assert.equal(await page.getAttribute('#historyPaths','aria-pressed'),'true');
  const one=now.published[0];
  assert.match(await label(),new RegExp(`Past forecasts drawn: edition ${one.forecast.dataCutoff} of the Research offer scenario, public since ${one.publication.at.slice(0,10)}`));
  assert.match(await text('#historyLegend'),new RegExp(`^1\\. Edition ${one.forecast.dataCutoff}`));
  assert.ok(await dayAt(0.95)>end,'the axis runs past the history to show the path');
  await page.locator('#historyEditions button').nth(1).click();
  await page.waitForFunction(()=>(document.getElementById('chart').getAttribute('aria-label').match(/edition \d{4}-\d\d-\d\d of/g) ?? []).length===2);
  shown=await editions();
  assert.deepEqual(shown.slice(0,2).map(e=>e.cls),['history-edition is-drawn slot-1','history-edition is-drawn slot-2']);
  // Unchoosing the first frees its slot; the second keeps its colour and number.
  await page.locator('#historyEditions button').nth(0).click();
  await page.waitForFunction(()=>(document.getElementById('chart').getAttribute('aria-label').match(/edition \d{4}-\d\d-\d\d of/g) ?? []).length===1);
  assert.equal((await editions())[1].cls,'history-edition is-drawn slot-2');
  if (now.published.length>=4) {
    for (const i of [0,2]) await page.locator('#historyEditions button').nth(i).click();
    await page.waitForTimeout(300);
    shown=await editions();
    assert.equal(shown.filter(e=>e.checked).length,3);
    assert.ok(shown.filter(e=>!e.checked).every(e=>e.disabled),'three at most');
    await page.locator('#historyEditions button').nth(2).click();
    await page.waitForTimeout(300);
  }
  const drawn=(await editions()).filter(e=>e.checked).length;

  // ---- Export: the drawn editions' notes in the image when shown; nothing of them when hidden.
  const saved=await mkdtemp(join(tmpdir(),'tibinance-history-'));
  const exportHeight=async()=>{
    const download=page.waitForEvent('download');await page.click('#exportButton');
    const f=await download,path=join(saved,f.suggestedFilename());await f.saveAs(path);
    const png=(await readFile(path)).toString('base64');
    return page.evaluate(async png=>{const i=await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());return i.height/(i.width/1200);},png);
  };
  await page.click('#eventsToggle');
  await page.click('#eventMarkers');
  await page.click('#historyToggle');
  const shownHeight = await exportHeight();
  await page.click('#historyPaths');
  await page.waitForFunction(()=>!document.getElementById('chart').getAttribute('aria-label').includes('Past forecasts'));
  const hiddenHeight = await exportHeight();
  // The common title/details/footer band can grow; the forecast notes alone add one line per edition.
  assert.equal(shownHeight - hiddenHeight,12+drawn*20,'one line of notes per drawn edition, absent when hidden');
  assert.equal(await dayAt(0.999),end,'hidden, the chart ends with the history again');
  assert.equal((await editions()).filter(e=>e.checked).length,drawn,'hiding keeps the choice');
  await page.click('#historyPaths');
  await page.waitForFunction(()=>document.getElementById('chart').getAttribute('aria-label').includes('Past forecasts'));

  // ---- The side and the world: the panel and the paths follow the page.
  await page.click('#side [data-side="buy"]');
  await page.waitForFunction(()=>document.getElementById('chart').getAttribute('aria-label').startsWith('Antica, Best Buy Offer'));
  await page.waitForFunction(()=>document.getElementById('chart').getAttribute('aria-label').includes('Past forecasts'));
  const buy=await point(now.published[1],4,'buy');
  assert.ok((await editions())[1].point.includes(n.format(Math.round(buy.base))),'the Buy Offer path');
  if (pathless) {
    await page.goto(`${root}/markets.html?world=${pathless}&side=sell&range=1Y`);
    await page.waitForFunction(w=>document.getElementById('world').textContent===w && document.getElementById('market').getAttribute('aria-busy')==='false',pathless);
    await page.waitForFunction(()=>document.getElementById('historyContext').textContent.startsWith('None of'));
    assert.match(await text('#historyContext'),new RegExp(`has a path for ${pathless}`));
    assert.ok((await editions()).every(e=>e.disabled && !e.checked));
    assert.doesNotMatch(await label(),/Past forecasts/);
  }

  // ---- Phone width: the panel under the chart, nothing sideways.
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
  assert.doesNotMatch(await page.content(),/\u00b7|&middot;/);
  assert.deepEqual(errors,[]);
  console.log(`PASS ${engine}: Forecast history loads with its panel; editions public by a date and evidence level, values per horizon from the archive, archived-only listed apart, up to three drawn with stable slots, axis past the history, export notes, side and world follow, 390 layout`);
} finally {
  await browser.close();
}
