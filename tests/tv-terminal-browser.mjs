// The TradingView terminal on Markets and Economy (js/tv-terminal.js, js/tv-drawings.js, js/tv-indicators.js,
// js/tv-theme.js) in a real browser: drawing, selecting, moving, undoing and keeping drawings per world; the object
// tree; TradingView's hotkeys; the world search; chart styles; indicators and their templates; the price-scale modes;
// bar replay; the theme. Run with the same local server / Playwright environment as markets-browser.mjs.
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.TIBINANCE_NODE_MODULES ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
const engine=process.env.TIBINANCE_BROWSER ?? 'chrome';
const root=process.env.TIBINANCE_TEST_URL ?? 'http://127.0.0.1:8765';
const browser=await (engine==='webkit' ? webkit.launch({headless:true}) : chromium.launch({headless:true,...(process.env.TIBINANCE_CHROME ? {executablePath:process.env.TIBINANCE_CHROME} : {channel:'chrome'})}));
try {
  const context=await browser.newContext({locale:'en-US',viewport:{width:1440,height:900},colorScheme:'light'});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
  const mod=await page.evaluate(()=>/Mac|iPhone|iPad/.test(navigator.platform)) ? 'Meta' : 'Control';
  const shown=world=>page.waitForFunction(w=>document.getElementById('world').textContent===w && document.getElementById('market').getAttribute('aria-busy')==='false' && document.querySelector('#legend .day'),world);
  const stored=key=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  const DRAWINGS='tibinance.tv.drawings.markets:tibia-coin:Antica';
  // A point in the price pane, as a share of its width and height.
  const pane=async(fx,fy)=>{const b=await page.locator('#chart canvas').first().boundingBox();return [b.x+b.width*fx,b.y+b.height*fy];};
  const click=async(fx,fy)=>{const [x,y]=await pane(fx,fy);await page.mouse.move(x,y);await page.mouse.click(x,y);};
  const tool=id=>page.getAttribute(`#drawbar [data-tool="${id}"]`,'aria-checked');

  await page.goto(`${root}/markets.html?world=Antica`);
  await shown('Antica');
  await page.evaluate(()=>{for (const k of Object.keys(localStorage)) if (k.startsWith('tibinance.tv.')) localStorage.removeItem(k);});
  await page.reload();
  await shown('Antica');

  // ---- The frame: TradingView's top toolbar, drawing toolbar, the world in the symbol search, the clock.
  assert.equal(await page.textContent('#tvSymbolName'),'Antica');
  assert.deepEqual(await page.$$eval('#drawbar [data-tool]',bs=>bs.map(b=>b.dataset.tool)),
    ['cursor','trend','ray','hline','hray','vline','crossline','channel','fib','rect','measure','text','arrowup']);
  assert.equal(await tool('cursor'),'true');
  assert.match(await page.textContent('#tvClock'),/^\d\d:\d\d:\d\d \(CES?T\)$/);

  // ---- A trend line, click and click: kept for this world, drawn, selected, undone and redone.
  await page.click('#drawbar [data-tool="trend"]');
  assert.equal(await tool('trend'),'true');
  await click(0.3,0.5);
  await click(0.6,0.4);
  let saved=await stored(DRAWINGS);
  assert.equal(saved.length,1);
  assert.equal(saved[0].type,'trend');
  assert.deepEqual([saved[0].color,saved[0].width],['#2962ff',2],"TradingView's trend line");
  assert.ok(saved[0].points[0].time<saved[0].points[1].time && saved[0].points[0].price>0,'anchored to days and prices');
  assert.equal(await tool('cursor'),'true','back to the cursor after one drawing');
  assert.equal(await page.isVisible('.tv-float'),true,'the new drawing is selected, its toolbar shown');
  assert.equal(await page.isDisabled('#tvUndo'),false);
  await page.keyboard.press(`${mod}+z`);
  assert.equal(await stored(DRAWINGS),null,'undone');
  await page.keyboard.press(`${mod}+Shift+z`);
  assert.equal((await stored(DRAWINGS)).length,1,'redone');

  // Dragging the line moves both points by the same days and prices.
  const before=(await stored(DRAWINGS))[0];
  const [mx,my]=await pane(0.45,0.45);
  await page.mouse.move(mx,my);
  await page.mouse.down();await page.mouse.move(mx+80,my+30,{steps:5});await page.mouse.up();
  const moved=(await stored(DRAWINGS))[0];
  assert.ok(moved.points[0].time>before.points[0].time && moved.points[0].price<before.points[0].price,`moved ${JSON.stringify(moved.points)}`);
  // The selected drawing's toolbar: line width, colour; Delete removes it, undo brings it back.
  await page.click('.tv-float [data-f="width"]');
  assert.equal((await stored(DRAWINGS))[0].width,3);
  await page.click('.tv-float [data-f="color"]');
  await page.click('.tv-colors [data-value="#f23645"]');
  assert.equal((await stored(DRAWINGS))[0].color,'#f23645');
  await page.keyboard.press('Delete');
  assert.equal(await stored(DRAWINGS),null);
  await page.click('#tvUndo');
  assert.equal((await stored(DRAWINGS)).length,1);

  // ---- Hotkeys pick tools; a horizontal line is one click; Escape returns to the cursor.
  await page.mouse.move(5,300);
  await page.keyboard.press('Alt+KeyH');
  assert.equal(await tool('hline'),'true');
  await click(0.5,0.3);
  await page.keyboard.press('Alt+KeyF');
  assert.equal(await tool('fib'),'true');
  await page.keyboard.press('Escape');
  assert.equal(await tool('cursor'),'true');
  assert.deepEqual((await stored(DRAWINGS)).map(d=>d.type),['trend','hline']);

  // ---- The object tree lists them; hiding and removing from it.
  await page.click('[data-dock-target="drawingsPanel"]');
  assert.deepEqual(await page.$$eval('#drawingsList .tv-obj-name',s=>s.map(e=>e.textContent)),['Horizontal line','Trend line']);
  await page.click('#drawingsList li:first-child [data-o="hide"]');
  assert.equal((await stored(DRAWINGS)).find(d=>d.type==='hline').hidden,true);
  await page.click('#drawingsList li:first-child [data-o="remove"]');
  assert.deepEqual((await stored(DRAWINGS)).map(d=>d.type),['trend']);

  // ---- Drawings belong to their world: another world starts empty, and the first keeps its own after a reload.
  await page.keyboard.press(`${mod}+k`);
  await page.keyboard.type('gentebra');
  await page.keyboard.press('Enter');
  await shown('Gentebra');
  assert.equal(await page.textContent('#tvSymbolName'),'Gentebra');
  assert.equal(await page.isVisible('#drawingsEmpty'),true,'no drawings on Gentebra');
  await page.goto(`${root}/markets.html?world=Antica`);
  await shown('Antica');
  assert.equal(await page.$$eval('#drawingsList li',l=>l.length),1,'Antica keeps its trend line');

  // ---- Chart style, remembered.
  await page.click('#tvStyle');
  await page.click('.tv-popup [data-value="step"]');
  assert.equal(await stored('tibinance.tv.style.markets'),'step');
  assert.equal(await page.getAttribute('#tvStyle','data-style'),'step');

  // ---- Indicators: added from the dialog, read out in the legend, removed there; RSI takes a pane of its own.
  const panes=()=>page.$$eval('#chart table tr',rows=>rows.length);   // a pane and its separator are rows of the chart's table
  const panesBefore=await panes();
  await page.click('#tvIndicators');
  await page.click('dialog[open] li[data-id="sma"]');
  await page.click('dialog[open] li[data-id="rsi"]');
  await page.keyboard.press('Escape');
  assert.match(await page.textContent('#indicatorLegend'),/MA 20.*RSI 14/);
  await page.waitForFunction(n=>document.querySelectorAll('#chart table tr').length>n,panesBefore,{timeout:5000}).catch(()=>{});
  assert.ok(await panes()>panesBefore,`RSI in its own pane: ${panesBefore} rows, then ${await panes()}`);
  assert.deepEqual((await stored('tibinance.tv.indicators.markets')).map(i=>i.type),['sma','rsi']);
  // A template keeps the set; applied again after the indicators are gone.
  await page.click('#tvTemplates');
  await page.fill('.tv-popup input','Trend');
  await page.click('.tv-popup button[type="submit"]');
  await page.click('#indicatorLegend [data-ind-remove]');
  await page.click('#indicatorLegend [data-ind-remove]');
  assert.equal(await page.textContent('#indicatorLegend'),'');
  await page.waitForFunction(n=>document.querySelectorAll('#chart table tr').length===n,panesBefore,{timeout:5000}).catch(()=>{});
  assert.equal(await panes(),panesBefore,'the empty pane goes with its indicator');
  await page.click('#tvTemplates');
  await page.click('.tv-popup [data-value="apply:Trend"]');
  assert.match(await page.textContent('#indicatorLegend'),/MA 20.*RSI 14/);

  // ---- Price-scale modes: percent and log exclude each other; Alt+L toggles log.
  await page.click('.tv-scale [data-scale="percent"]');
  assert.deepEqual(await page.$$eval('.tv-scale button',bs=>bs.map(b=>b.getAttribute('aria-pressed'))),['true','false','true']);
  await page.keyboard.press('Alt+KeyL');
  assert.deepEqual(await page.$$eval('.tv-scale button',bs=>bs.map(b=>b.getAttribute('aria-pressed'))),['false','true','true']);
  await page.keyboard.press('Alt+KeyR');
  const pressed=()=>page.$$eval('.tv-scale button',bs=>bs.map(b=>b.getAttribute('aria-pressed')));
  assert.deepEqual(await pressed(),['false','false','true'],'Alt+R resets');
  // Auto toggles, as TradingView's: off keeps the scale where it is, on fits the values again.
  await page.click('.tv-scale [data-scale="auto"]');
  assert.deepEqual(await pressed(),['false','false','false']);
  await page.click('.tv-scale [data-scale="auto"]');
  assert.deepEqual(await pressed(),['false','false','true']);
  // A mode chosen stays through another range, side and world.
  await page.click('.tv-scale [data-scale="log"]');
  await page.click('#range [data-range="3M"]');
  await page.click('#side [data-side="buy"]');
  assert.deepEqual(await pressed(),['false','true','true'],'log kept');
  await page.click('.tv-scale [data-scale="log"]');
  await page.click('#side [data-side="sell"]');
  await page.click('#range [data-range="1Y"]');

  // ---- Bar replay: a day chosen on the chart, then one bar at a time; leaving restores the whole history.
  await page.click('#tvReplay');
  assert.equal(await page.isVisible('#replayBar'),true);
  await click(0.5,0.5);
  const day=await page.textContent('#replayBar output');
  assert.match(day,/^\d{4}-\d{2}-\d{2}$/);
  await page.click('#replayBar [data-r="step"]');
  const next=await page.textContent('#replayBar output');
  assert.ok(next>day,`a step forward: ${day} to ${next}`);
  await page.click('#replayBar [data-r="exit"]');
  assert.equal(await page.isHidden('#replayBar'),true);
  assert.equal(await page.getAttribute('#tvReplay','aria-pressed'),'false');

  // ---- Theme: dark on press, before first paint on the next visit, and the chart follows.
  const background=()=>page.evaluate(()=>getComputedStyle(document.querySelector('.chart-area')).backgroundColor);
  assert.equal(await page.getAttribute('html','data-theme'),'light');
  assert.equal(await background(),'rgb(255, 255, 255)');
  await page.click('#tvTheme');
  assert.equal(await page.getAttribute('html','data-theme'),'dark');
  assert.equal(await background(),'rgb(15, 15, 15)');
  await page.reload();
  await shown('Antica');
  assert.equal(await page.getAttribute('html','data-theme'),'dark','remembered');
  // An exported image takes the chart's own ground, never the page's gap colour.
  const corner=async()=>{
    const download=page.waitForEvent('download');await page.click('#exportButton');
    const png=(await readFile(await (await download).path())).toString('base64');
    return page.evaluate(async png=>{const i=await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());const c=new OffscreenCanvas(i.width,i.height).getContext('2d');c.drawImage(i,0,0);return [...c.getImageData(4,4,1,1).data.slice(0,3)];},png);
  };
  assert.deepEqual(await corner(),[15,15,15],'Markets image on the dark pane');
  await page.click('#tvTheme');

  // ---- Economy: the same terminal; its interval in the top toolbar; drawings kept per world.
  await page.goto(`${root}/economy.html?world=Antica`);
  await page.waitForFunction(()=>document.getElementById('economy').getAttribute('aria-busy')==='false');
  assert.equal(await page.textContent('#tvSymbolName'),'Antica');
  await page.click('header.site #interval [data-interval="month"]');
  assert.equal(new URL(page.url()).searchParams.get('interval'),'month');
  assert.deepEqual(await corner(),[255,255,255],'Economy image on the light pane, not the page grey');
  // The viewer's log survives every redraw; the gold mode applies its own scale only when it changes.
  const scaleShown=()=>page.$$eval('.tv-scale button',bs=>bs.map(b=>b.getAttribute('aria-pressed')));
  await page.click('.tv-scale [data-scale="log"]');
  await page.click('#killsToggle');
  await page.click('#range [data-range="6M"]');
  assert.deepEqual(await scaleShown(),['false','true','true'],'log kept through redraws');
  await page.click('#valueMode [data-mode="accumulated"]');
  await page.click('.tv-scale [data-scale="percent"]');
  await page.click('#range [data-range="1Y"]');
  assert.deepEqual(await scaleShown(),['true','false','true'],'percent kept on accumulated gold');
  await page.click('#valueMode [data-mode="daily"]');
  assert.deepEqual(await scaleShown(),['false','false','true'],'daily gold returns to the normal scale');
  await page.click('#killsToggle');
  await page.click('#drawbar [data-tool="hline"]');
  await click(0.5,0.4);
  assert.deepEqual((await stored('tibinance.tv.drawings.economy:Antica')).map(d=>d.type),['hline']);

  assert.deepEqual(errors,[]);
  console.log(`PASS ${engine}: TradingView terminal: drawings (draw, select, drag, restyle, delete, undo/redo, per world), object tree, hotkeys, world search, chart style, indicators and templates, scale modes, replay, theme, Economy interval`);
} finally {
  await browser.close();
}
