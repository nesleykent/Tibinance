// Markets page in a real browser against the committed market history.
// Run with the same local server / Playwright environment as tables-browser.mjs.
// Set TIBINANCE_SCREENSHOTS to a directory to keep full-page screenshots for inspection.
import {createRequire} from 'node:module';
import {readFile, mkdir, mkdtemp} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
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

  // Markets is reached from the site menu (tests/site-header-browser.mjs covers the menu itself).
  await page.goto(`${root}/`);
  assert.equal(await page.title(),'Tibinance');
  // Capture's page margins: Markets is framed by the same ones.
  const pageEdges=()=>page.$eval('.site .wrap',w=>{const r=w.getBoundingClientRect(),s=getComputedStyle(w);
    return [r.left+parseFloat(s.paddingLeft),r.right-parseFloat(s.paddingRight)];});
  const captureEdges=await pageEdges();
  assert.ok(captureEdges[0]>100,`Capture's margin at 1440px: ${captureEdges[0]}`);
  assert.deepEqual(await page.$$eval('#site-menu a',as=>as.map(a=>[a.textContent,a.getAttribute('href')])),
    [['Capture','./'],['Markets','markets.html'],['Trade','trade.html'],['Research','reports/tc-cycle/']]);
  await page.click('header.site [data-site-menu]');
  await page.click('#site-menu a[href="markets.html"]');
  await shown('Antica');
  assert.equal(await page.title(),'Tibinance Markets');
  assert.equal(await page.getAttribute('#site-menu a[aria-current="page"]','href'),'markets.html');
  assert.equal(await page.$eval('header.site [data-site-menu]',b=>b.textContent.trim()),'Markets');

  // One market, not two sources: no source is named anywhere in the page.
  assert.doesNotMatch(await page.content(),/tibiamarket/i);

  // Terminal layout: the world and quote above the chart, ranges below it, the rail and the list beside it.
  // The chart's toolbar holds the world and its quote only; the rail holds the market side, Sell or Buy, then panel
  // tools, then direct actions.
  assert.equal(await page.$$eval('#chartPanel .toolbar-top button,#chartPanel .toolbar-top [role="radio"]',bs=>bs.length),0);
  const tools=page.getByRole('group',{name:'Tools'});
  const sides=tools.getByRole('radiogroup',{name:'Market side'});
  assert.deepEqual(await sides.getByRole('radio').evaluateAll(rs=>rs.map(r=>[r.textContent,r.getAttribute('aria-checked')])),[['Sell','true'],['Buy','false']]);
  assert.ok(await page.evaluate(()=>{const s=document.getElementById('side').getBoundingClientRect(),t=document.querySelector('[data-dock-target="worldsPanel"]').getBoundingClientRect();return s.bottom<=t.top && s.width<=48;}),'the side leads the rail, compact');
  // One left edge for the world, its readout and the ranges; one right edge for the quote and the price labels' column.
  const lefts=await page.evaluate(()=>['#world','#legend .day','#legend .label'].map(s=>document.querySelector(s).getBoundingClientRect().left));
  assert.ok(lefts.every(l=>Math.abs(l-lefts[0])<=1),`the world, the day and the series share a left edge: ${lefts}`);
  assert.deepEqual(await tools.getByRole('button').evaluateAll(bs=>bs.map(b=>[b.getAttribute('aria-label'),b.hasAttribute('data-dock-target') ? 'panel' : 'action'])),
    [['Worlds','panel'],['Screener','action'],['Events','panel'],['Projections','action'],['Help','panel'],['Export chart image','action'],['Full screen','action']]);
  assert.ok(await page.$('.toolbar-bottom #range'));
  // Inside Capture's margins, with or without the panel: the chart, then the Worlds panel, then the rail at the edge.
  const frame=()=>page.evaluate(()=>{
    const r=s=>document.querySelector(s).getBoundingClientRect(),area=r('.chart-area'),list=r('.watchlist'),rail=r('.dock-rail'),header=r('header.site');
    const scroll=document.querySelector('.watch-scroll');
    return {pageScroll:document.documentElement.scrollHeight-innerHeight,overflow:document.documentElement.scrollWidth-innerWidth,
      areaShare:area.height/(innerHeight-header.height),edges:[area.left,rail.right],chart:area.width,rail:rail.width,list:list.width,
      beside:list.width>0 && list.left>=area.right && rail.left>=list.right,ownScroll:scroll.scrollHeight>scroll.clientHeight};
  });
  const open=await frame();
  assert.equal(await pageEdges().then(String),String(captureEdges),'the header keeps Capture\'s margins');
  assert.deepEqual(open.edges,captureEdges,'the terminal keeps Capture\'s margins');
  assert.ok(open.pageScroll<=0 && open.overflow<=0,'the terminal fits the viewport');
  assert.ok(open.areaShare>0.75,`chart area is ${open.areaShare} of the height under the header`);
  assert.ok(open.beside && open.ownScroll,'the Worlds panel is open beside the chart, with its own scrolling');

  // The rail closes the panel, gives its width to the chart and keeps the chart on the same days.
  const rail=tools.getByRole('button',{name:'Worlds',exact:true});
  assert.deepEqual([await rail.getAttribute('aria-expanded'),await rail.getAttribute('aria-controls'),await rail.getAttribute('title')],['true','worldsPanel','Hide Worlds']);
  const plot=await chartBox();
  // The day under the pointer near the chart's left edge, and at its newest observation.
  const firstDay=async()=>{
    const b=await page.locator('#chart canvas').first().boundingBox();
    // Enter the pane before positioning the crosshair: WebKit can deliver the
    // initial pointer move as mouseenter without a crosshair update.
    await page.mouse.move(b.x+b.width*0.5,b.y+b.height/3);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await page.mouse.move(b.x+b.width*0.03,b.y+b.height/3);
    await page.waitForFunction(last=>document.querySelector('#legend .day').textContent!==last,summary('Antica').latestBestOffer.serverDay);
    return text('#legend .day');
  };
  const before=await firstDay();
  const url=page.url();
  await rail.click();
  await page.waitForFunction(w=>document.getElementById('chart').getBoundingClientRect().width>w+100,plot.w);
  await page.waitForTimeout(100);
  const closed=await frame();
  assert.equal(await rail.getAttribute('aria-expanded'),'false');
  assert.equal(await page.isVisible('#worldsPanel'),false);
  assert.deepEqual(closed.edges,captureEdges,'the margins stay with the panel closed');
  assert.ok(Math.abs(closed.chart-(open.chart+open.list))<=1,`the chart takes the panel's width: ${open.chart}+${open.list} to ${closed.chart}`);
  assert.ok(closed.rail<=48 && closed.overflow<=0 && closed.pageScroll<=0);
  const after=await firstDay();
  assert.ok(Math.abs(Date.parse(after)-Date.parse(before))<=2*864e5,`the same days stay in view: ${before} then ${after}`);
  assert.equal(page.url(),url,'the address keeps only the world, side and range');
  // Remembered in this browser; the keyboard opens it again, at the selected world.
  await page.reload();
  await shown('Antica');
  assert.equal(await rail.getAttribute('aria-expanded'),'false','the closed rail is remembered');
  await rail.focus();
  await page.keyboard.press('Enter');
  assert.equal(await rail.getAttribute('aria-expanded'),'true');
  assert.equal(await page.isVisible('#worlds tr[data-world="Antica"][aria-selected="true"]'),true);
  assert.deepEqual((await frame()).edges,captureEdges);

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
  // The side choice names each side's latest best offer on hover; the quote names the range its change covers.
  assert.deepEqual(await page.$$eval('#side button',bs=>bs.map(b=>b.title)),
    [`Best Sell Offer: ${number.format(gentebra.sell)}`,`Best Buy Offer: ${number.format(gentebra.buy)}`]);
  assert.equal(await text('#lastRange'),'1Y');
  // Copy rule: no middle dots anywhere, generated text included; the metadata is separate items instead.
  assert.doesNotMatch(await page.content(),/\u00b7|&middot;/);
  assert.deepEqual(await page.$$eval('#worldMeta > span',spans=>spans.map(s=>s.textContent)),['Optional PvP','BattlEye Yellow']);
  // The bottom toolbar holds the ranges and the day the history runs through; the top toolbar keeps its single-row height.
  assert.equal(await text('.toolbar-bottom'),`1M 3M 6M YTD 1Y All Server days through ${index.through}`);
  assert.ok(await page.$eval('.toolbar-top',e=>e.getBoundingClientRect().height)<=45,'top toolbar height');
  assert.equal(await page.getAttribute('#worlds tr[data-world="Gentebra"]','aria-selected'),'true');
  assert.match(await page.getAttribute('#chart','aria-label'),/^Gentebra, Best Sell Offer history and daily transaction activity \(count\), range 1Y\./);
  const [prior,last]=closes.slice(-2);
  const history=JSON.parse(await readFile(new URL(`../data/market-history/tibia-coin/${summary('Gentebra').file}`,import.meta.url),'utf8'));
  const lastDayCount=history.observations.filter(o=>o.serverDay===last[0] && o.sell!=null && o.buy!=null).length;
  assert.equal(await text('#legend'),`${last[0]} Best Sell Offer ${number.format(last[1])} ${signed.format(last[1]-prior[1])} `
    + `${percent.format(last[1]/prior[1]-1)} since ${prior[0]}${lastDayCount>1?` last of ${lastDayCount}`:''} Daily average N/A`);
  assert.equal(await text('#volumeLegend'),'Transactions N/A');

  // The legends follow the crosshair: a day in the September gap names the observations around it,
  // and a day with trading shows its average and volume.
  await page.click('#range button[data-range="3M"]');
  const box=await chartBox(),seen=[];
  for (let f=0.05;f<0.95;f+=0.01) {
    await page.mouse.move(box.x+box.w*f,box.y+box.h*0.4);
    seen.push([await text('#legend'),await text('#volumeLegend')]);
  }
  assert.ok(seen.some(([l])=>l.includes('Best Sell Offer not observed between 2026-09-12 and 2026-09-21') && l.endsWith('Daily average N/A')),'gap legend');
  assert.ok(seen.some(([l,v])=>/Daily average \d[\d,]*$/.test(l) && /^Transactions \d[\d,]*$/.test(v)),'trading-day legend');
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

  // Help is a panel of the rail: it takes the Worlds panel's place beside the chart, one panel at a time.
  const helpTool=tools.getByRole('button',{name:'Help',exact:true});
  await helpTool.click();
  assert.deepEqual([await helpTool.getAttribute('aria-expanded'),await rail.getAttribute('aria-expanded')],['true','false']);
  assert.deepEqual([await page.isVisible('#helpPanel'),await page.isVisible('#worldsPanel')],[true,false]);
  assert.equal(await page.getByRole('region',{name:'Reading the chart'}).count(),1);
  const help=await text('#helpPanel');
  assert.match(help,/Dotted line: the days in between were not observed/);
  assert.match(help,new RegExp(`Daily figures for ${next} run through`));
  assert.match(help,/Search reaches retired worlds as well/);
  assert.match(help,new RegExp(`Server days run from 10:00 to 10:00 CET/CEST.*The market history runs through server day ${index.through}\\.`));
  assert.doesNotMatch(await page.content(),/\u00b7|&middot;/);
  assert.ok(await page.evaluate(()=>{const c=document.getElementById('chartPanel').getBoundingClientRect(),h=document.getElementById('helpPanel').getBoundingClientRect();return h.left>=c.right && h.top<c.top+50;}),'help sits beside the chart');
  // Its keys take the selected side's colour, as the legends do.
  assert.equal(await page.$eval('#helpPanel .key-dot',k=>getComputedStyle(k).backgroundColor),await page.$eval('#legend .key-dot',k=>getComputedStyle(k).backgroundColor));
  await rail.click();
  assert.deepEqual([await helpTool.getAttribute('aria-expanded'),await page.isVisible('#helpPanel'),await page.isVisible('#worldsPanel')],['false',false,true]);

  // Full screen takes the whole terminal: the chart grows and the rail keeps its way back.
  const fullScreen=tools.getByRole('button',{name:'Full screen',exact:true});
  const pageChart=(await chartBox()).w;
  await fullScreen.click();
  await page.waitForFunction(()=>document.getElementById('expand').getAttribute('aria-pressed')==='true');
  const expanded=await page.evaluate(()=>{const t=document.getElementById('market').getBoundingClientRect(),rail=document.querySelector('.dock-rail').getBoundingClientRect();
    return {w:t.width/innerWidth,h:t.height/innerHeight,rail:rail.right<=innerWidth && rail.width>0,mode:document.fullscreenElement?.id ?? (document.getElementById('market').classList.contains('expanded') ? 'expanded' : null)};});
  assert.ok(expanded.mode && expanded.w>0.99 && expanded.h>0.99 && expanded.rail,`expanded ${JSON.stringify(expanded)}`);
  assert.ok((await chartBox()).w>pageChart,'the chart grows at full screen');
  const exitFullScreen=tools.getByRole('button',{name:'Exit full screen',exact:true});
  assert.equal(await exitFullScreen.getAttribute('aria-pressed'),'true');
  await exitFullScreen.click();
  await page.waitForFunction(()=>document.getElementById('expand').getAttribute('aria-pressed')==='false' && !document.fullscreenElement);
  // Where element full screen is unavailable (iPhone), the terminal covers the viewport instead, and Escape returns.
  await page.evaluate(()=>Object.defineProperty(document,'fullscreenEnabled',{value:false,configurable:true}));
  await fullScreen.click();
  assert.deepEqual(await page.evaluate(()=>{const t=document.getElementById('market'),r=t.getBoundingClientRect();return [t.classList.contains('expanded'),r.width===innerWidth && r.height===innerHeight];}),[true,true]);
  await page.keyboard.press('Escape');
  assert.equal(await page.$eval('#market',t=>t.classList.contains('expanded')),false);
  assert.equal(await fullScreen.getAttribute('aria-pressed'),'false');
  await page.evaluate(()=>delete document.fullscreenEnabled);

  // Export: an image of the chart itself, drawn from its state, the same size from any window.
  const saved=await mkdtemp(join(tmpdir(),'tibinance-export-'));
  const exportImage=async target=>{
    const download=target.waitForEvent('download');
    await target.click('#exportButton');
    const file=await download,path=join(saved,file.suggestedFilename());
    await file.saveAs(path);
    return {name:file.suggestedFilename(),png:(await readFile(path)).toString('base64'),status:await target.textContent('#exportStatus')};
  };
  // Counts of pixels near the side colours and a probe colour in the chart area, and of dark pixels in the title
  // and footer; the chart area is the image's layout (js/market-export.js) at its pixel ratio.
  const inspect=png=>page.evaluate(async png=>{
    const image=await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const r=image.width/1200,box=(x0,y0,x1,y1)=>ctx.getImageData(x0*r,y0*r,(x1-x0)*r,(y1-y0)*r).data;
    const count=(data,test)=>{let n=0;for(let i=0;i<data.length;i+=4) if(test(data[i],data[i+1],data[i+2])) n++;return n;};
    const near=([R,G,B])=>(r,g,b)=>Math.abs(r-R)+Math.abs(g-G)+Math.abs(b-B)<60;
    const chart=box(32,136,1168,696),dark=(r,g,b)=>r+g+b<200;
    const xs=[];{const d=chart,w=1136*r;for(let i=0;i<d.length;i+=4) if(near([180,83,42])(d[i],d[i+1],d[i+2])||near([47,109,181])(d[i],d[i+1],d[i+2])) xs.push((i/4)%w);}
    return {width:image.width,height:image.height,sell:count(chart,near([180,83,42])),buy:count(chart,near([47,109,181])),probe:count(chart,near([0,255,0])),
      span:xs.length ? (Math.max(...xs)-Math.min(...xs))/(1136*r) : 0,title:count(box(32,32,600,90),dark),footer:count(box(32,708,400,750),dark)};
  },png);
  // The series alone, in the image's fixed layout: events, shown by default, add notes under the chart and are
  // covered by tests/market-events-browser.mjs.
  await page.click('#eventsToggle');
  await page.uncheck('#eventMarkers');
  await page.click('#side button[data-side="sell"]');
  await page.click('#range button[data-range="1Y"]');
  let image=await exportImage(page);
  assert.equal(image.name,`tibinance-${next.toLowerCase()}-sell-1y-${index.through}.png`);
  assert.equal(image.status,`Saved ${image.name}.`);
  let pixels=await inspect(image.png);
  assert.deepEqual([pixels.width,pixels.height],[2400,1560],'twice the image layout from a 1x screen');
  assert.ok(pixels.sell>2000 && pixels.buy<50,`the Sell series ${JSON.stringify(pixels)}`);
  assert.ok(pixels.span>0.85,`the days shown fill the plot: ${pixels.span}`);
  assert.ok(pixels.title>300 && pixels.footer>100,`title and branding ${JSON.stringify(pixels)}`);
  await page.click('#side button[data-side="buy"]');
  await page.click('#range button[data-range="3M"]');
  image=await exportImage(page);
  assert.equal(image.name,`tibinance-${next.toLowerCase()}-buy-3m-${index.through}.png`);
  pixels=await inspect(image.png);
  assert.ok(pixels.buy>2000 && pixels.sell<50,`the Buy series ${JSON.stringify(pixels)}`);
  // A layer added to the chart takes part in the image with its key and annotation, with no change to the export.
  await page.evaluate(async()=>{const {LAYERS}=await import('/js/market-chart.js');
    window.probeLayer={depth:9,add:()=>null,draw(){},keys:()=>[{mark:'bar',color:'#00ff00',label:'Probe'}],annotate(ctx){ctx.fillStyle='#00ff00';ctx.fillRect(200,200,60,60);}};
    LAYERS.push(window.probeLayer);});
  pixels=await inspect((await exportImage(page)).png);
  assert.ok(pixels.probe>1000,`the probe layer is drawn: ${pixels.probe}`);
  await page.evaluate(async()=>{const {LAYERS}=await import('/js/market-chart.js');LAYERS.splice(LAYERS.indexOf(window.probeLayer),1);});
  await page.check('#eventMarkers');
  await page.click('#eventsToggle');
  await page.click('#side button[data-side="sell"]');
  await page.click('#range button[data-range="1Y"]');
  await page.click('[data-dock-target="worldsPanel"]');
  // A world without market data has nothing to export.
  await page.fill('#filter','jinx');
  await page.click('#worlds tr[data-world="Jinxibra"]');
  await page.waitForFunction(()=>document.getElementById('status').textContent.includes('No market data'));
  assert.equal(await page.isDisabled('#exportButton'),true);
  assert.match(await page.getAttribute('#exportButton','title'),/No market data for Jinxibra/);
  await page.fill('#filter','');
  await page.click(`#worlds tr[data-world="${next}"]`);
  await shown(next);
  assert.equal(await page.isDisabled('#exportButton'),false);

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
  // Its successor is one click away and keeps its own, separate history. Beside the open Worlds panel the toolbar
  // line is cut short (its whole text is its tooltip) and the details carry the link; with the panel closed the
  // toolbar has room for it.
  assert.equal(await page.isVisible('#detailStatus .world-link'),true);
  await rail.click();
  await page.click('#worldMeta .world-link');
  await shown('Terribra');
  await rail.click();
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
  await page.click('#detailStatus .world-link');
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

  // Until a choice is remembered, the panel opens only where the chart keeps room beside it; phones always list
  // the worlds under the chart, whatever the rail last did, and show no rail.
  for (const [width,height,expanded] of [[1024,768,'false'],[1280,800,'true']]) {
    const fresh=await browser.newContext({viewport:{width,height}});
    const view=await fresh.newPage();
    await view.goto(`${root}/markets.html`);
    await view.waitForFunction(()=>document.getElementById('market').getAttribute('aria-busy')==='false');
    assert.equal(await view.getAttribute('[data-dock-target="worldsPanel"]','aria-expanded'),expanded,`${width}px default`);
    assert.equal(await view.isVisible('#worldsPanel'),expanded==='true');
    // Opened here anyway, the panel narrows the chart like a small screen: the toolbar wraps rather than overlap.
    if (expanded==='false') await view.click('[data-dock-target="worldsPanel"]');
    assert.ok(await view.evaluate(()=>{const parts=['#world','.symbol-quote'].map(s=>document.querySelector(s).getBoundingClientRect());
      return parts.every((a,i)=>parts.slice(i+1).every(b=>a.right<=b.left+1 || b.right<=a.left+1 || a.bottom<=b.top+1 || b.bottom<=a.top+1));}),`${width}px toolbar parts overlap`);
    await fresh.close();
  }
  await rail.click();
  await page.setViewportSize({width:390,height:844});
  // On a phone the rail is a row under the chart, without the Worlds tool: the worlds are always listed.
  assert.equal(await page.isVisible('.dock-rail'),true);
  assert.deepEqual(await tools.getByRole('button').filter({visible:true}).evaluateAll(bs=>bs.map(b=>b.getAttribute('aria-label'))),['Screener','Events','Projections','Help','Export chart image','Full screen']);
  assert.ok(await page.evaluate(()=>{const c=document.getElementById('chartPanel').getBoundingClientRect(),r=document.querySelector('.dock-rail').getBoundingClientRect();return r.top>=c.bottom && r.height<60;}),'the rail is a row under the chart');
  assert.equal(await page.isVisible('#worlds tr[data-world="Antica"]'),true,'phones list the worlds with the rail closed');
  // Help opens between the rail and the worlds.
  await helpTool.click();
  assert.ok(await page.evaluate(()=>{const r=document.querySelector('.dock-rail').getBoundingClientRect(),h=document.getElementById('helpPanel').getBoundingClientRect(),d=document.querySelector('.details').getBoundingClientRect();
    return h.height>0 && h.top>=r.bottom && h.bottom<=d.top;}),'help opens under the rail, above the details');
  await helpTool.click();
  // The same image from a phone (the series alone, as above).
  await page.click('#eventsToggle');
  await page.uncheck('#eventMarkers');
  pixels=await inspect((await exportImage(page)).png);
  await page.check('#eventMarkers');
  await page.click('#eventsToggle');
  assert.deepEqual([pixels.width,pixels.height],[2400,1560]);
  assert.ok(pixels.sell>2000 && pixels.span>0.85,`phone export ${JSON.stringify(pixels)}`);
  // At full screen a phone shows the chart and the rail's actions.
  await page.evaluate(()=>Object.defineProperty(document,'fullscreenEnabled',{value:false,configurable:true}));
  await fullScreen.click();
  assert.deepEqual(await tools.getByRole('button').filter({visible:true}).evaluateAll(bs=>bs.map(b=>b.getAttribute('aria-label'))),['Screener','Projections','Export chart image','Exit full screen']);
  assert.ok(await page.evaluate(()=>{const c=document.getElementById('chartPanel').getBoundingClientRect(),r=document.querySelector('.dock-rail').getBoundingClientRect();return c.height>innerHeight*0.8 && r.bottom<=innerHeight+1;}));
  await exitFullScreen.click();
  await page.evaluate(()=>delete document.fullscreenEnabled);
  await page.setViewportSize({width:1440,height:900});
  await rail.click();
  assert.equal(await rail.getAttribute('aria-expanded'),'true');

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
