// Projections on the Markets chart, in a real browser against the committed projection dataset and market history.
// Run with the same local server / Playwright environment as markets-browser.mjs.
import {createRequire} from 'node:module';
import {readFile, mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.TIBINANCE_NODE_MODULES ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
const engine=process.env.TIBINANCE_BROWSER ?? 'chrome';
const root=process.env.TIBINANCE_TEST_URL ?? 'http://127.0.0.1:8765';
const read=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const dataset=await read('data/market-projections/tibia-coin.json');
const n=new Intl.NumberFormat('en-US');
const scenario=(world,side)=>dataset.worlds.find(w=>w.world===world)[side];
// The edition's facts, read from the dataset rather than written in: Antica's anchor (its last observation) and the
// horizon's last week move with every Research update.
const antica=dataset.worlds.find(w=>w.world==='Antica').anchor,anchorDay=antica.serverDay,horizonEnd=dataset.method.last;
const addDays=(day,k)=>new Date(Date.parse(`${day}T00:00:00Z`)+k*86400000).toISOString().slice(0,10);

const browser=await (engine==='webkit' ? webkit.launch({headless:true}) : chromium.launch({headless:true,...(process.env.TIBINANCE_CHROME ? {executablePath:process.env.TIBINANCE_CHROME} : {channel:'chrome'})}));
try {
  const context=await browser.newContext({locale:'en-US',timezoneId:'America/Sao_Paulo',viewport:{width:1440,height:900},acceptDownloads:true});
  await context.addInitScript(()=>{ if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tibinance.markets.dock',''); sessionStorage.setItem('seeded','1'); } });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  const open=async(world,range='1Y',side='sell')=>{
    await page.goto(`${root}/markets.html?world=${world}&side=${side}&range=${range}`);
    await page.waitForFunction(w=>document.getElementById('world').textContent===w && document.getElementById('market').getAttribute('aria-busy')==='false',world);
    await page.waitForTimeout(150);
  };
  const text=sel=>page.$eval(sel,e=>e.innerText.trim().replace(/\s+/g,' '));
  const toggle=page.locator('#projectionsToggle');
  const chartBox=()=>page.$eval('#chart',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  // The plot: the chart's first pane cell, left of its price scale (Lightweight Charts lays panes out in a table).
  const plotBox=()=>page.$eval('#chart table tr td:nth-child(2)',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  // The day under the pointer at a fraction of the plot's width.
  const dayAt=async f=>{const b=await plotBox();await page.mouse.move(b.x+b.w*f,b.y+b.h*0.35);await page.waitForTimeout(30);return text('#legend .day');};
  const legend=()=>text('.chart-legend');

  // ---- Off until shown: the page opens as before, and the address never mentions projections.
  await open('Antica');
  assert.deepEqual([await toggle.getAttribute('aria-pressed'),await toggle.getAttribute('title')],['false','Show projections']);
  assert.equal(await text('#projectionLegend'),'');
  const historyEnd=await dayAt(0.999);
  assert.equal(historyEnd,anchorDay,'hidden, the chart ends with the history');
  const url=page.url();
  await toggle.click();
  await page.waitForTimeout(150);
  assert.deepEqual([await toggle.getAttribute('aria-pressed'),await toggle.getAttribute('title')],['true','Hide projections']);
  assert.equal(page.url(),url,'projection state is not part of the address');

  // ---- The Research's scenario for this world and side: its last week at rest, with its band.
  const sell=scenario('Antica','sell'),buy=scenario('Antica','buy');
  await page.mouse.move(5,5);
  const [lastDay,central,low,high]=sell.at(-1);
  // A stale Antica quote limits its confidence; the legend and label then say so.
  const limited=dataset.worlds.find(w=>w.world==='Antica').stale;
  assert.equal(await text('#projectionLegend'),`Projection ${n.format(central)} band ${n.format(low)} to ${n.format(high)} on ${lastDay}${limited?' limited confidence':''}`);
  assert.match(await page.getAttribute('#chart','aria-label'),new RegExp(`Projection from the last observation: Research offer scenario to ${lastDay}, central ${n.format(central)}, heuristic stress band ${n.format(low)} to ${n.format(high)}${limited?', limited confidence \\(stale quote\\)':''}\\.$`));

  // ---- The boundary: the last observed day reads the observation; the next day reads the first projected week.
  let seen=new Map();
  for (let f=0.40;f<=0.60;f+=0.0005) { const d=await dayAt(f); if (!seen.has(d)) seen.set(d,await legend()); }
  assert.ok(seen.get(anchorDay).startsWith(`${anchorDay} Best Sell Offer ${n.format(antica.sell)} `),'the anchor day is the last observation');
  const [w1,c1,l1,h1]=sell[0];
  // When the Research cutoff falls after the anchor, the days up to it are in no projected week.
  for (const d of [...seen.keys()].filter(d=>d>anchorDay && d<addDays(w1,-6))) assert.ok(!seen.get(d).includes(' week to '),`${d} reads no week`);
  const next=[...seen.keys()].filter(d=>d>=addDays(w1,-6)).sort()[0];
  assert.equal(seen.get(next),`${next} Projection ${n.format(c1)} band ${n.format(l1)} to ${n.format(h1)} week to ${w1}${limited?" Conditional: stale quote":""}`);
  assert.ok(next<=w1,'the first days after the anchor belong to the first projected week');

  // ---- Horizon and range: the window ahead matches the range behind, up to the 52 weeks.
  await page.mouse.move(5,5);
  assert.equal(await dayAt(0.999)>=addDays(anchorDay,350),true,'1Y shows the whole horizon');
  assert.match(await legend(),new RegExp(`Projection [\\d,]+ band [\\d,]+ to [\\d,]+ week to ${lastDay}|week to ${horizonEnd.slice(0,8)}`));
  await page.click('#range button[data-range="1M"]');
  await page.waitForTimeout(100);
  const monthEnd=await dayAt(0.999);
  assert.ok(monthEnd>addDays(anchorDay,25) && monthEnd<=addDays(anchorDay,34),`1M shows about a month ahead: ${monthEnd}`);
  assert.equal(new URL(page.url()).searchParams.get('range'),'1M');
  await page.click('#range button[data-range="All"]');
  await page.waitForTimeout(100);
  assert.ok(await dayAt(0.999)>=addDays(horizonEnd,-7),'All shows the whole horizon');

  // ---- The side: the Buy Offers' own scenario.
  await page.click('#side button[data-side="buy"]');
  await page.mouse.move(5,5);
  await page.waitForTimeout(100);
  assert.equal(await text('#projectionLegend'),`Projection ${n.format(buy.at(-1)[1])} band ${n.format(buy.at(-1)[2])} to ${n.format(buy.at(-1)[3])} on ${lastDay}${limited?" limited confidence":""}`);
  await page.click('#side button[data-side="sell"]');

  // ---- Hidden again: the market series, the range and the address are as they were; the window ends with history.
  await page.click('#range button[data-range="1Y"]');
  const series=()=>page.evaluate(()=>({last:document.getElementById('lastPrice').textContent,change:document.getElementById('lastChange').textContent,
    legend:document.getElementById('legend').innerText,range:document.querySelector('#range [aria-checked="true"]').dataset.range,url:location.search}));
  await page.mouse.move(5,5);
  const shown=await series();
  await toggle.click();
  await page.mouse.move(5,5);
  await page.waitForTimeout(100);
  assert.deepEqual(await series(),shown,'hiding changes no market value, range or address');
  assert.equal(await text('#projectionLegend'),'');
  assert.equal(await dayAt(0.999),anchorDay);
  assert.doesNotMatch(await page.getAttribute('#chart','aria-label'),/Projection/);
  await toggle.click();
  // Remembered on this device across visits.
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('market').getAttribute('aria-busy')==='false');
  assert.equal(await toggle.getAttribute('aria-pressed'),'true');

  // ---- Conditions the Research sets: a merge suspends, a stale quote is conditional, confidence can be limited.
  await open('Luzibra','3M');
  await page.mouse.move(5,5);
  const luzibraRows=scenario('Luzibra','sell'),luzibra=luzibraRows.filter(r=>r[1]!==null),luzibraSuspended=luzibraRows.find(r=>r[1]===null)[0];
  assert.equal(await text('#projectionLegend'),`Projection ${n.format(luzibra.at(-1)[1])} band ${n.format(luzibra.at(-1)[2])} to ${n.format(luzibra.at(-1)[3])} on ${luzibra.at(-1)[0]} limited confidence suspended from ${luzibraSuspended}`);
  assert.equal(await dayAt(0.999),luzibra.at(-1)[0],'the window stops where the Research suspends the scenario');
  await open('Cantabra','6M','buy');
  await page.mouse.move(5,5);
  assert.match(await text('#projectionLegend'),/limited confidence$/);
  const stale=await dayAt(0.97);
  assert.ok(stale>anchorDay,`a stale quote's scenario runs after the history: ${stale}`);
  assert.match(await legend(),/Conditional: stale quote/);

  // ---- Unavailable, with the reason, where the Research has no scenario to place.
  for (const [world,reason] of [['Aethera','The Research projects the worlds it captures; Aethera is not among them.'],['Jacabra','A retired world has no projection.']]) {
    await open(world,'1Y');
    await page.mouse.move(5,5);
    assert.equal(await text('#projectionLegend'),`Projection unavailable: ${reason}`);
    assert.match(await page.getAttribute('#chart','aria-label'),new RegExp(`Projection unavailable: ${reason.replace(/[.;]/g,'.')}`));
  }
  await open('Jacabra','All');
  assert.ok((await dayAt(0.999))<='2025-11-06','a retired world keeps its own axis');
  await page.goto(`${root}/markets.html?world=Jinxibra`);
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('No market data'));
  assert.equal(await page.isVisible('#status'),true);

  // ---- With Events: the same events in the same days, still inspectable; markers stay in the history.
  const eventIds=()=>page.$$eval('#eventMarks .event-mark',bs=>bs.flatMap(b=>b.dataset.events.split(' ')).sort());
  const eventRight=()=>page.$$eval('#eventMarks .event-mark',bs=>Math.max(...bs.map(b=>b.getBoundingClientRect().right)));
  await open('Antica','1Y');
  const withProjection=await eventIds();
  const boundary=await (async()=>{for (let f=0.4;f<0.7;f+=0.002){if(await dayAt(f)>anchorDay){const b=await plotBox();return b.x+b.w*f;}}return Infinity;})();
  assert.ok(await eventRight()<=boundary+12,'event markers stand in the history');
  await page.locator('#eventMarks .event-mark').first().hover();
  assert.equal(await page.$eval('#eventTip',t=>t.hidden),false,'an event marker still shows its details');
  await page.mouse.move(5,5);
  await toggle.click();
  assert.deepEqual(await eventIds(),withProjection,'projections change no event');
  await toggle.click();

  // ---- Export: the projection and its notes when shown, nothing of it when hidden; the image says what is projected.
  const saved=await mkdtemp(join(tmpdir(),'tibinance-projections-'));
  const exportPng=async()=>{const download=page.waitForEvent('download');await page.click('#exportButton');const file=await download,path=join(saved,file.suggestedFilename());await file.saveAs(path);return (await readFile(path)).toString('base64');};
  const inspect=png=>page.evaluate(async png=>{
    const image=await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const r=image.width/1200,box=(x0,y0,x1,y1)=>ctx.getImageData(x0*r,y0*r,(x1-x0)*r,(y1-y0)*r).data;
    const count=(data,[R,G,B],t=24)=>{let k=0;for(let i=0;i<data.length;i+=4) if(Math.abs(data[i]-R)+Math.abs(data[i+1]-G)+Math.abs(data[i+2]-B)<t) k++;return k;};
    const right=box(620,140,1100,640),left=box(40,140,560,640);
    return {height:image.height/r,bandRight:count(right,[237,222,216]),bandLeft:count(left,[237,222,216]),inkRight:count(right,[36,35,42],60),tintRight:count(right,[247,247,248],4)};
  },png);
  await page.click('#eventsToggle');
  await page.uncheck('#eventMarkers');
  await page.click('#eventsToggle');   // the events' own notes are tested in market-events-browser.mjs
  let image=await inspect(await exportPng());
  assert.equal(image.height,780+12+2*20,`two lines of projection notes ${JSON.stringify(image)}`);
  assert.ok(image.bandRight>2000 && image.bandLeft<50,`the band after the boundary only ${JSON.stringify(image)}`);
  assert.ok(image.inkRight>150,`the dashed central line ${JSON.stringify(image)}`);
  await toggle.click();
  image=await inspect(await exportPng());
  assert.equal(image.height,780,'hidden on the page, absent from the image');
  assert.ok(image.bandRight<50 && image.tintRight<50,`no projection drawn ${JSON.stringify(image)}`);
  await toggle.click();
  // An unavailable projection says so in the image, in one line.
  await open('Aethera','1Y');
  image=await inspect(await exportPng());
  assert.equal(image.height,780+12+20);
  await page.click('#eventsToggle');
  await page.check('#eventMarkers');
  await page.click('#eventsToggle');

  // ---- Phones: the tool in the rail row, the readout and the window ahead, no sideways scroll.
  await page.setViewportSize({width:390,height:844});
  await open('Antica','3M');
  assert.equal(await toggle.isVisible(),true);
  assert.equal(await toggle.getAttribute('aria-pressed'),'true');
  assert.match(await text('#projectionLegend'),new RegExp(`^Projection [\\d,]+ band [\\d,]+ to [\\d,]+ on ${horizonEnd}( limited confidence)?$`));
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0);
  await page.setViewportSize({width:1440,height:900});

  assert.deepEqual(errors,[]);

  // ---- Without the projection data the market works as before; the tool is disabled.
  const bare=await browser.newContext({viewport:{width:1440,height:900}});
  const plain=await bare.newPage();
  const pageErrors=[];plain.on('pageerror',e=>pageErrors.push(e.message));
  await plain.addInitScript(()=>localStorage.setItem('tibinance.markets.projections','shown'));
  await plain.route('**/data/market-projections/*.json',route=>route.fulfill({status:404,body:''}));
  await plain.goto(`${root}/markets.html?world=Antica`);
  await plain.waitForFunction(()=>document.getElementById('market').getAttribute('aria-busy')==='false');
  assert.equal(await plain.isDisabled('#projectionsToggle'),true);
  assert.equal(await plain.getAttribute('#projectionsToggle','aria-pressed'),'false');
  assert.equal(await plain.$eval('#projectionLegend',e=>e.textContent),'');
  assert.deepEqual(pageErrors,[]);
  await bare.close();

  console.log(`Market projections browser checks passed (${engine}).`);
} finally {
  await browser.close();
}
