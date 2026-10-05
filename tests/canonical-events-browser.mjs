// Cross-context proof: the same canonical identities in Markets, Research, markers and exports.
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { eventsFor, queryEvents } from '../js/events.js';
const require = createRequire(import.meta.url);
const { webkit, chromium } = require(`${process.env.TIBINANCE_NODE_MODULES}/playwright`);
const engine = process.env.TIBINANCE_BROWSER === 'chrome' ? chromium : webkit;
const browser = await engine.launch({ headless: true, ...(engine === chromium ? { channel: 'chrome' } : {}) });
const root = process.env.TIBINANCE_TEST_URL ?? 'http://127.0.0.1:8876';
const dataset = JSON.parse(await readFile(new URL('../data/events/events.json', import.meta.url), 'utf8'));
const events = eventsFor(dataset), ids = events.map(e => e.id), sorted = a => [...a].sort();
const shots = '/tmp/canonical-events-shots'; await mkdir(shots, {recursive:true});
try {
  const page = await browser.newPage({ viewport: {width:1440,height:900}, locale:'en-US', timezoneId:'America/Sao_Paulo' });
  if (process.env.TIBINANCE_CHART_LIBRARY) {
    const body=await readFile(process.env.TIBINANCE_CHART_LIBRARY,'utf8');
    await page.route('https://cdn.jsdelivr.net/npm/lightweight-charts@5.2.1/**', route => route.fulfill({body,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}}));
  }
  const errors=[], sources=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/\/events\.json(?:\?|$)/.test(r.url()))sources.push(new URL(r.url()).pathname)});
  const agendaIds=()=>page.locator('#eventAgenda [data-event]').evaluateAll(rows=>rows.map(r=>r.dataset.event));
  for (const [name,url] of [
    ['tib','markets.html?asset=tibia-token&range=All'],
    ['antica','markets.html?asset=tibia-coin&world=Antica&range=All'],
    ['luzibra','markets.html?asset=tibia-coin&world=Luzibra&range=All'],
    ['terribra','markets.html?asset=tibia-coin&world=Terribra&range=All']
  ]) {
    await page.goto(`${root}/${url}`);
    await page.waitForFunction(()=>document.getElementById('market').getAttribute('aria-busy')==='false');
    assert.equal(await page.locator('#status').isVisible(),false,name);
    if(await page.locator('#eventsToggle').getAttribute('aria-expanded')!=='true')await page.locator('#eventsToggle').click();
    assert.deepEqual(await agendaIds(),ids,`${name}: full canonical collection`);
    assert.match(await page.locator('#eventsContext').innerText(),/295 recorded events/);
    await page.locator('#eventCategory').selectOption('economy');
    assert.deepEqual(await agendaIds(),queryEvents(events,{category:'economy'}).map(e=>e.id));
    await page.locator('#eventCategory').selectOption('');
    await page.locator('#eventScope').selectOption('world');
    assert.deepEqual(await agendaIds(),queryEvents(events,{scope:'world'}).map(e=>e.id));
    await page.locator('#eventScope').selectOption('');
    assert.deepEqual(await agendaIds(),ids);
    // Select a canonical event by stable ID and focus it, independent of the Market's scope.
    const id='world-created-2025-11-06-terribra-opened';
    await page.locator(`#eventAgenda [data-event="${id}"]`).click();
    await page.locator('#eventFocus').click();
    await page.waitForFunction(id=>[...document.querySelectorAll('#eventMarks [data-events]')].some(b=>b.dataset.events.split(' ').includes(id)),id);
    const markerIds=await page.locator('#eventMarks [data-events]').evaluateAll(rows=>rows.flatMap(r=>r.dataset.events.split(' ')));
    assert.ok(markerIds.every(id=>ids.includes(id)));
    await page.screenshot({path:`${shots}/${name}-desktop.png`});
    if(name==='tib') {
      const downloadPromise=page.waitForEvent('download');await page.locator('#exportButton').click();
      const download=await downloadPromise;await download.saveAs(`${shots}/tib-events-export.png`);
      assert.ok((await readFile(`${shots}/tib-events-export.png`)).length>10000);
    }
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(await agendaIds(),ids,`${name}: mobile retains the collection`);
    await page.locator('#eventCalendar').scrollIntoViewIfNeeded();
    await page.screenshot({path:`${shots}/${name}-mobile.png`});
    await page.setViewportSize({width:1440,height:900});
  }
  // Actual asset picker navigation, rather than only direct URLs.
  await page.locator('#asset').selectOption('tibia-token');
  await page.waitForFunction(()=>document.querySelector('#world').textContent==='Tibia Token (TIB)' && document.querySelector('#market').getAttribute('aria-busy')==='false');
  assert.deepEqual(await agendaIds(),ids);
  await page.locator('#asset').selectOption('tibia-coin');
  await page.waitForFunction(()=>document.querySelector('#world').textContent==='Antica' && document.querySelector('#market').getAttribute('aria-busy')==='false');
  assert.deepEqual(await agendaIds(),ids);
  for(const edition of ['index.html','pt-br.html']) {
    await page.goto(`${root}/reports/tc-cycle/${edition}`);
    await page.waitForFunction(()=>document.getElementById('report').getAttribute('aria-busy')==='false');
    await page.locator('a[href="#robustness"]').click();
    const calendar=page.locator('[data-canonical-events]');
    assert.deepEqual((await calendar.getAttribute('data-canonical-events')).split(' '),ids);
    assert.equal(await calendar.locator('tbody tr').count(),events.length);
    // Existing chapter world selectors may change price exhibits, never Events.
    const picker=page.locator('#site-world .site-control'); await picker.click();
    await page.locator('#world-picker input').fill('Luzibra');
    await page.getByRole('option',{name:'Luzibra',exact:true}).click();
    assert.deepEqual((await calendar.getAttribute('data-canonical-events')).split(' '),ids);
    await calendar.scrollIntoViewIfNeeded();
    await page.screenshot({path:`${shots}/research-${edition}-desktop.png`});
    const exportIds=await calendar.locator('tbody tr').evaluateAll(rows=>rows.map(r=>r.textContent));
    assert.equal(exportIds.length,events.length);
    const pngPromise=page.waitForEvent('download');await calendar.locator('[data-export]').click();
    const png=await pngPromise;await png.saveAs(`${shots}/research-${edition}-events.png`);
    assert.ok((await readFile(`${shots}/research-${edition}-events.png`)).length>10000);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual((await calendar.getAttribute('data-canonical-events')).split(' '),ids);
    await calendar.scrollIntoViewIfNeeded();await page.screenshot({path:`${shots}/research-${edition}-mobile.png`});
    await page.setViewportSize({width:1440,height:900});
  }
  assert.ok(sources.length>=8);assert.deepEqual([...new Set(sources)],['/data/events/events.json']);
  assert.deepEqual(errors,[]);
  console.log('PASS: canonical collection across TIB, TC, Antica, Luzibra, Terribra and EN/PT Research; explicit filters, focus, markers, PNG exports, asset switching, desktop/mobile.');
} finally {await browser.close();}
