// Events on the Markets chart, in a real browser against the committed event dataset and market history.
// Run with the same local server / Playwright environment as markets-browser.mjs.
import {createRequire} from 'node:module';
import {readFile, mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import assert from 'node:assert/strict';
import {rangeStart} from '../js/market-series.js';
import {eventsFor, exportNotes} from '../js/market-events.js';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.TIBINANCE_NODE_MODULES ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
const engine=process.env.TIBINANCE_BROWSER ?? 'chrome';
const root=process.env.TIBINANCE_TEST_URL ?? 'http://127.0.0.1:8765';
const read=async path=>JSON.parse(await readFile(new URL(`../${path}`,import.meta.url),'utf8'));
const index=await read('data/market-history/tibia-coin/index.json');
const dataset=await read('data/market-events/events.json');
const byId=new Map(dataset.events.map(e=>[e.id,e]));
const summary=world=>index.worlds.find(w=>w.world===world);

const browser=await (engine==='webkit' ? webkit.launch({headless:true}) : chromium.launch({headless:true,...(process.env.TIBINANCE_CHROME ? {executablePath:process.env.TIBINANCE_CHROME} : {channel:'chrome'})}));
try {
  const context=await browser.newContext({locale:'en-US',timezoneId:'America/Sao_Paulo',viewport:{width:1440,height:900},acceptDownloads:true});
  // The Worlds panel closed, so the chart has the page's width.
  await context.addInitScript(()=>{ if (!sessionStorage.getItem('seeded')) { localStorage.setItem('tibinance.markets.dock',''); sessionStorage.setItem('seeded','1'); } });
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  const open=async(world,range,side='sell')=>{
    await page.goto(`${root}/markets.html?world=${world}&side=${side}&range=${range}`);
    await page.waitForFunction(w=>document.getElementById('world').textContent===w && document.getElementById('market').getAttribute('aria-busy')==='false',world);
    await page.waitForTimeout(150);   // the chart lays its markers out on its next frame
  };
  // The markers as the page offers them: their events, and their boxes.
  const marks=()=>page.$$eval('#eventMarks .event-mark',bs=>bs.map(b=>{const r=b.getBoundingClientRect();
    return {ids:b.dataset.events.split(' '),label:b.getAttribute('aria-label'),left:r.left,right:r.right,top:r.top,bottom:r.bottom,tab:b.tabIndex};}));
  const shownIds=async()=>(await marks()).flatMap(m=>m.ids);
  const chartBox=()=>page.$eval('#chart',e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
  const day=()=>page.$eval('#legend .day',e=>e.textContent);
  const tipText=()=>page.$eval('#eventTip',t=>t.hidden ? null : t.innerText.replace(/\s+/g,' ').trim());

  // ---- Plotted on their own day, even where no price was observed: a retired world's merge after its last offer.
  await open('Jacabra','All','buy');
  const jacabra=summary('Jacabra');
  const merge=byId.get('world-merge-2025-11-06-terribra');
  assert.ok(jacabra.bestOfferDays.last<merge.start && jacabra.dailyStatisticsDays.last<merge.start,'Jacabra has no market data on its merge day');
  let shown=await marks();
  const mergeMark=shown.find(m=>m.ids.includes(merge.id));
  assert.ok(mergeMark,`the merge is marked: ${JSON.stringify(shown.map(m=>m.ids))}`);
  assert.equal(mergeMark.label,`2025-11-06, Jacabra and Obscubra merged into Terribra: ${merge.description}`);
  // The marker stands on its day: the crosshair over it reads that day.
  let box=await chartBox();
  await page.mouse.move((mergeMark.left+mergeMark.right)/2,box.y+box.h/3);
  assert.equal(await day(),'2025-11-06');
  // Every marker lies along the foot of the price pane, in the chart, none over another.
  const overlapFree=list=>list.every((a,i)=>list.slice(i+1).every(b=>a.right<=b.left+0.5 || b.right<=a.left+0.5));
  assert.ok(shown.every(m=>m.left>=box.x-1 && m.right<=box.x+box.w+1 && m.bottom<=box.y+box.h && m.top>box.y+box.h*0.75),'markers along the foot of the chart');

  // ---- Global events on every world, a world's own only on it (and on the worlds it names).
  await open('Antica','All');
  const antica=await shownIds();
  assert.ok(antica.length>30,`Antica shows the global events: ${antica.length}`);
  for (const id of antica) assert.equal(byId.get(id).worlds,'all',`Antica shows only global events: ${id}`);
  assert.ok(antica.includes('update-2025-04-08-monk-released'));
  await open('Luzibra','All');
  const luzibra=await shownIds();
  for (const id of ['world-created-2025-05-21-luzibra-opened','store-2025-07-29-premium-restriction-lifted','economy-2026-06-30-transfers-opened','world-merge-2026-09-21-deslumbra-announced'])
    assert.ok(luzibra.includes(id),`Luzibra shows ${id}`);
  assert.ok(!luzibra.includes('economy-2025-07-29-transfer-block-lifted'),'not another world\'s event');
  assert.ok(summary('Luzibra').dailyStatisticsDays.first>'2025-05-21','Luzibra opened before its first market day');
  shown=await marks();
  box=await chartBox();
  const opening=shown.find(m=>m.ids.includes('world-created-2025-05-21-luzibra-opened'));
  assert.ok(opening.left-box.x<box.w*0.05,'the opening starts the axis');
  // Global events reach the world too.
  assert.ok(luzibra.some(id=>byId.get(id).worlds==='all'));

  // ---- Filtered by the days in view: what shows is what overlaps the visible range, nothing else.
  for (const range of ['1M','3M','1Y']) {
    await open('Antica',range);
    const from=rangeStart(index.through,range),to=index.through;
    const ids=new Set(await shownIds());
    const overlapping=(a,b)=>eventsFor(dataset,'Antica').filter(e=>e.end>=a && e.start<=b).map(e=>e.id);
    for (const id of ids) assert.ok(overlapping(addDays(from,-1),to).includes(id),`${range}: ${id} is outside the days in view`);
    for (const id of overlapping(addDays(from,1),to)) assert.ok(ids.has(id),`${range}: ${id} is in view but not marked`);
    assert.ok(overlapFree(await marks()),`${range}: markers overlap`);
  }
  assert.ok((await shownIds()).length>(await (async()=>{await open('Antica','1M');return shownIds();})()).length,'a shorter range shows fewer events');

  // ---- Events on the same or nearby days become one marker that names them all; markers never overlap.
  await open('Terribra','1Y');
  shown=await marks();
  const together=shown.find(m=>m.ids.includes('world-created-2025-11-06-terribra-opened'));
  assert.ok(together.ids.includes('world-merge-2025-11-06-terribra'),'the opening and the merge share a marker');
  assert.match(together.label,/^\d+ events\. 2025-11-06, Terribra opened: .*2025-11-06, Jacabra and Obscubra merged into Terribra: /);
  assert.equal(await page.$eval(`#eventMarks [data-events="${together.ids.join(' ')}"]`,b=>b.getAttribute('aria-label')),together.label);
  assert.ok(overlapFree(shown));
  await open('Antica','All');
  assert.ok(overlapFree(await marks()),'the densest view: no marker over another');
  // The Skill Event and the Rapid Respawn of 2026-06-05 share every world's marker.
  assert.ok((await marks()).some(m=>m.ids.includes('xp-skill-2026-06-05-skill-event') && m.ids.includes('rapid-respawn-2026-06-05-rapid-respawn')));

  // ---- Inspecting by pointer: the days, title and description of each event, and the marker active on the chart.
  await open('Jacabra','All','buy');
  const chartPixels=()=>page.evaluate(async()=>{
    const canvases=[...document.querySelectorAll('#chart canvas')];
    const r=document.getElementById('chart').getBoundingClientRect();
    const out=new OffscreenCanvas(Math.round(r.width),Math.round(r.height)),ctx=out.getContext('2d');
    for (const c of canvases) { const b=c.getBoundingClientRect(); ctx.drawImage(c,b.left-r.left,b.top-r.top,b.width,b.height); }
    // The upper half of the price pane: where only an active marker's line or band reaches.
    const d=ctx.getImageData(0,0,out.width,Math.round(out.height*0.5)).data;
    let n=0;for(let i=0;i<d.length;i+=4) if(Math.abs(d[i]-117)+Math.abs(d[i+1]-57)+Math.abs(d[i+2]-166)<80) n++;return n;});
  const before=await chartPixels();
  const mergeButton=page.locator(`#eventMarks [data-events~="${merge.id}"]`);
  await mergeButton.hover();
  assert.equal(await tipText(),`2025-11-06 M ${merge.title} ${merge.description}`);
  assert.ok(await chartPixels()>before+50,'the active merge spans the chart with its line');
  await page.mouse.move(10,10);
  assert.equal(await tipText(),null,'leaving the marker closes its details');
  assert.ok(await chartPixels()<=before+5);
  // A marker of several events lists each.
  await open('Terribra','1Y');
  await page.locator(`#eventMarks [data-events~="world-merge-2025-11-06-terribra"]`).hover();
  const several=await tipText();
  assert.match(several,/2025-11-06 N Terribra opened Terribra opened as a new game world.*2025-11-06 M Jacabra and Obscubra merged into Terribra/);
  // The details stay on screen.
  const tip=await page.$eval('#eventTip',t=>{const r=t.getBoundingClientRect();return {l:r.left,r:r.right,t:r.top,b:r.bottom};});
  assert.ok(tip.l>=0 && tip.r<=1440 && tip.t>=0 && tip.b<=900,JSON.stringify(tip));

  // ---- By keyboard: one tab stop; arrows, Home and End move between markers in time order; Escape closes.
  await page.mouse.move(10,10);
  shown=await marks();
  assert.deepEqual(shown.filter(m=>m.tab===0).map(m=>m.ids),[shown[0].ids],'one marker in the tab order, the first');
  const focused=()=>page.evaluate(()=>document.activeElement.closest('#eventMarks') ? document.activeElement.dataset.events : document.activeElement.id || document.activeElement.tagName);
  // Tab from just before the markers lands on that one marker: the chart's status comes first, its last control is
  // the market side's Buy.
  await page.evaluate(()=>[...document.querySelectorAll('#chartHead button')].at(-1).focus());
  await page.keyboard.press('Tab');
  assert.equal(await focused(),shown[0].ids.join(' '));
  assert.ok((await tipText()).startsWith(byId.get(shown[0].ids[0]).start),'focus shows the details');
  await page.keyboard.press('ArrowRight');
  assert.equal(await focused(),shown[1].ids.join(' '));
  assert.ok((await tipText()).includes(byId.get(shown[1].ids[0]).title));
  await page.keyboard.press('End');
  assert.equal(await focused(),shown.at(-1).ids.join(' '));
  await page.keyboard.press('Home');
  assert.equal(await focused(),shown[0].ids.join(' '));
  await page.keyboard.press('ArrowLeft');
  assert.equal(await focused(),shown[0].ids.join(' '),'the first marker stays first');
  await page.keyboard.press('Escape');
  assert.equal(await tipText(),null,'Escape closes the details');
  assert.equal(await focused(),shown[0].ids.join(' '),'and keeps the focus');
  assert.equal(await page.$eval('#market',t=>t.classList.contains('expanded')),false);
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.$$eval('#eventMarks .event-mark',bs=>bs.filter(b=>b.tabIndex===0).map(b=>b.dataset.events)).then(x=>x[0]),shown[1].ids.join(' '),'the tab stop follows the focus');
  await page.keyboard.press('Tab');
  assert.notEqual(await page.evaluate(()=>!!document.activeElement.closest('#eventMarks')),true,'Tab leaves the markers');
  assert.equal(await tipText(),null);

  // ---- By tap or click: the details stay until another tap; the market is untouched.
  const legendBefore=await page.$eval('#legend',e=>e.innerText);
  const firstButton=page.locator('#eventMarks .event-mark').first();
  await firstButton.click();
  await page.mouse.move(700,300);
  assert.notEqual(await tipText(),null,'a click keeps the details open');
  await page.mouse.click(700,40);
  assert.equal(await tipText(),null,'a click elsewhere closes them');
  await page.mouse.move(5,5);
  assert.equal(await page.$eval('#legend',e=>e.innerText),legendBefore);

  // ---- Hidden and shown again: the market series, the address and the ranges stay as they were.
  await open('Antica','1Y');
  await page.click('#eventsToggle');
  await page.waitForTimeout(200);
  const toggle=page.locator('#eventMarkers');
  assert.equal(await toggle.isChecked(),true);
  const seriesState=()=>page.evaluate(()=>({url:location.search,last:document.getElementById('lastPrice').textContent,change:document.getElementById('lastChange').textContent,
    legend:document.getElementById('legend').innerText,range:document.querySelector('#range [aria-checked="true"]').dataset.range}));
  const withEvents=await seriesState();
  const sellPixels=()=>page.evaluate(()=>{const c=[...document.querySelectorAll('#chart canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];
    const d=c.getContext('2d').getImageData(0,0,c.width,Math.round(c.height*0.7)).data;let n=0;for(let i=0;i<d.length;i+=4) if(Math.abs(d[i]-180)+Math.abs(d[i+1]-83)+Math.abs(d[i+2]-42)<60) n++;return n;});
  const sellBefore=await sellPixels();
  await toggle.click();
  assert.equal(await toggle.isChecked(),false);
  assert.equal((await marks()).length,0,'no markers while hidden');
  assert.deepEqual(await seriesState(),withEvents,'the market is untouched');
  assert.ok(Math.abs(await sellPixels()-sellBefore)<=sellBefore*0.01,'the series draw the same');
  // Remembered on this device, not in the address.
  await page.reload();
  await page.waitForFunction(()=>document.getElementById('market').getAttribute('aria-busy')==='false');
  await page.waitForTimeout(150);
  assert.equal(await toggle.isChecked(),false);
  if (!await toggle.isVisible()) await page.click('#eventsToggle');
  assert.equal((await marks()).length,0);
  await toggle.click();
  await page.waitForTimeout(100);
  assert.ok((await marks()).length>5,'shown again');
  // Other worlds, sides and ranges keep the choice and redraw their own events.
  await page.click('#side button[data-side="buy"]');
  await page.click('#range button[data-range="3M"]');
  await page.waitForTimeout(100);
  const buy3m=new Set(await shownIds());
  assert.ok(buy3m.size>0 && [...buy3m].every(id=>byId.get(id).end>=rangeStart(index.through,'3M')),'the side and range change the market, the events follow the days');

  // ---- Export: the markers in view, explained under the chart by the shared layer; nothing when hidden.
  const saved=await mkdtemp(join(tmpdir(),'tibinance-events-'));
  const exportPng=async()=>{const download=page.waitForEvent('download');await page.click('#exportButton');const file=await download,path=join(saved,file.suggestedFilename());await file.saveAs(path);return (await readFile(path)).toString('base64');};
  const inspect=png=>page.evaluate(async png=>{
    const image=await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const r=image.width/1200,box=(x0,y0,x1,y1)=>ctx.getImageData(x0*r,y0*r,(x1-x0)*r,(y1-y0)*r).data;
    const count=(data,[R,G,B])=>{let n=0;for(let i=0;i<data.length;i+=4) if(Math.abs(data[i]-R)+Math.abs(data[i+1]-G)+Math.abs(data[i+2]-B)<60) n++;return n;};
    // The chart's foot (where markers stand), and everything under the chart (the notes).
    const foot=box(32,640,1168,696),under=box(32,700,1168,image.height/r-90);
    return {height:image.height/r,game:count(foot,[128,89,9]),world:count(foot,[117,57,166]),notesGame:count(under,[128,89,9]),notesWorld:count(under,[117,57,166]),
      notesInk:count(under,[36,35,42])};
  },png);
  await open('Terribra','1Y');
  const visible=(await marks()).flatMap(m=>m.ids).map(id=>({...byId.get(id),category:{...dataset.categories.find(c=>c.id===byId.get(id).category),rank:dataset.categories.findIndex(c=>c.id===byId.get(id).category)}}));
  const notes=exportNotes(visible);
  const lines=1+notes.rows.length+(notes.more?1:0);
  let image=await inspect(await exportPng());
  assert.ok(image.height >= 780+12+lines*20,`the image grows by its notes: ${JSON.stringify(image)} for ${lines} lines`);
  // Terribra's opening and merge share a marker with the next day's XP/Skill Event: a mixed marker is drawn in ink.
  assert.ok(image.game>40,`markers drawn at the chart's foot ${JSON.stringify(image)}`);
  assert.ok(image.notesGame>40 && image.notesWorld>20 && image.notesInk>500,`keys and lines under the chart ${JSON.stringify(image)}`);
  if (!await toggle.isVisible()) await page.click('#eventsToggle');
  await toggle.click();
  image=await inspect(await exportPng());
  assert.equal(image.height,780,'hidden on the page, absent from the image');
  assert.ok(image.game<5 && image.world<5,`no markers ${JSON.stringify(image)}`);
  await toggle.click();
  // The busiest view keeps its notes short: recurring events counted, the rest listed up to six, then how many more.
  await open('Antica','All');
  const all=exportNotes((await marks()).flatMap(m=>m.ids).map(id=>({...byId.get(id),category:dataset.categories.find(c=>c.id===byId.get(id).category)})));
  image=await inspect(await exportPng());
  assert.ok(image.height >= 780+12+(1+all.rows.length+(all.more?1:0))*20, 'legend wraps into additional export rows');
  assert.ok(all.rows.length===6 && all.more>0 && image.height<1600,`notes stay short: ${image.height}`);

  // ---- A world without market data plots nothing, events included.
  await page.goto(`${root}/markets.html?world=Jinxibra`);
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('No market data'));
  assert.equal((await marks()).length,0);

  // ---- Phones: the markers stay along the chart's foot, and a tap shows their details.
  await open('Terribra','1Y');
  // Markers laid out for the wider chart never widen the page while the chart catches up with the resize.
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth),0,'no sideways scroll on resize');
  await page.waitForTimeout(150);
  shown=await marks();
  box=await chartBox();
  assert.ok(shown.length>=2 && overlapFree(shown) && shown.every(m=>m.left>=box.x-1 && m.right<=box.x+box.w+1),`phone markers ${JSON.stringify({box,shown:shown.map(m=>[Math.round(m.left),Math.round(m.right)])})}`);
  await page.locator('#eventMarks .event-mark').nth(1).click();
  const phoneTip=await page.$eval('#eventTip',t=>{const r=t.getBoundingClientRect();return {l:r.left,r:r.right,hidden:t.hidden};});
  assert.ok(!phoneTip.hidden && phoneTip.l>=0 && phoneTip.r<=390,JSON.stringify(phoneTip));
  await page.setViewportSize({width:1440,height:900});

  assert.deepEqual(errors,[]);

  // ---- Without its event data the market works as before; the Events tool says nothing can be shown.
  const bare=await browser.newContext({viewport:{width:1440,height:900}});
  const plain=await bare.newPage();
  const pageErrors=[];plain.on('pageerror',e=>pageErrors.push(e.message));
  await plain.route('**/data/market-events/events.json',route=>route.fulfill({status:404,body:''}));
  await plain.goto(`${root}/markets.html?world=Antica`);
  await plain.waitForFunction(()=>document.getElementById('market').getAttribute('aria-busy')==='false');
  assert.equal(await plain.$eval('#status',s=>s.hidden),true,'the chart is drawn');
  await plain.click('#eventsToggle');
  assert.equal(await plain.isDisabled('#eventMarkers'),true);
  assert.equal(await plain.$$eval('#eventMarks .event-mark',b=>b.length),0);
  assert.deepEqual(pageErrors,[]);
  await bare.close();

  console.log(`Market events browser checks passed (${engine}).`);
} finally {
  await browser.close();
}

function addDays(day,n){return new Date(Date.parse(`${day}T00:00:00Z`)+n*86400000).toISOString().slice(0,10);}
