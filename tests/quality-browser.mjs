// Refactor guards: responsive theme, contrast/focus/motion, static config overrides and timer lifecycle.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium, webkit } = require(process.env.TIBINANCE_NODE_MODULES ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
const engine = process.env.TIBINANCE_BROWSER ?? 'chrome';
const root = process.env.TIBINANCE_TEST_URL ?? 'http://127.0.0.1:8765';
const shots = process.env.TIBINANCE_SCREENSHOTS;
const launch = () => engine === 'webkit' ? webkit.launch({ headless: true }) : chromium.launch({ headless: true, channel: 'chrome' });
const news = { news: [{ id: 9019, date: '2026-10-13', news: 'Changes', category: 'development', type: 'news', url: 'https://www.tibia.com/' }] };
const worlds = { worlds: { players_online: 100, regular_worlds: [{ name: 'Antica', players_online: 50 }, { name: 'Secura', players_online: 50 }] } };
const fixtures = context => context.route('**/v4/**', route => route.fulfill({ json: route.request().url().includes('/news/') ? news : worlds }));
const ready = async page => {
  await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'));
  await page.evaluate(() => document.fonts.ready);
};
if (shots) await mkdir(shots, { recursive: true });
for (const route of ['markets.html', 'economy.html', 'markets-overview.html', 'economy-overview.html', 'trade.html', 'index.html']) {
  // Fresh process per route avoids sharing application storage and long-running browser state.
  const browser = await launch();
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', reducedMotion: 'reduce' });
    await fixtures(context);
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.goto(`${root}/${route}`); await ready(page);
    if (route === 'markets-overview.html') await page.waitForSelector('#summaryCards li');
    if (route === 'economy-overview.html') await page.waitForSelector('#statCards .tv-stat');
    assert.match(await page.title(), /Tibinance/);
    assert.ok((await page.locator('body').innerText()).length > 100);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => window.tvTheme.set(theme), theme);
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} ${theme} ${width}: page overflow`);
        if (shots && [1440,390].includes(width)) await page.screenshot({ path: `${shots}/${engine}-${route}-${theme}-${width}.png` });
      }
      const contrast = await page.evaluate(() => {
        const resolve = name => {
          const probe = document.createElement('span'); probe.style.color = `var(${name})`; document.body.append(probe);
          const color = getComputedStyle(probe).color.match(/[\d.]+/g).slice(0,3).map(Number); probe.remove(); return color;
        };
        const luminance = rgb => rgb.map(n => n/255).map(n => n <= .04045 ? n/12.92 : ((n+.055)/1.055)**2.4).reduce((v,n,i) => v+n*[.2126,.7152,.0722][i],0);
        const ratio = (a,b) => (Math.max(luminance(a),luminance(b))+.05)/(Math.min(luminance(a),luminance(b))+.05);
        return Object.fromEntries(['--tv-bg','--tv-bg-3','--tv-popup','--tv-row-selected'].flatMap(bg => ['--tv-text','--tv-text-2','--tv-up-text','--tv-down-text','--tv-warning-text','--tv-link'].map(name => [`${name}/${bg}`, ratio(resolve(name),resolve(bg))])));
      });
      for (const [name, value] of Object.entries(contrast)) assert.ok(value >= 4.5, `${route} ${theme} ${name} contrast ${value}`);

    }
    const field = page.locator('input:not([type="file"]):visible').first();
    if (await field.count()) {
      await field.focus();
      assert.ok(await field.evaluate(el => { const s = getComputedStyle(el); return s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) >= 2; }), `${route}: visible keyboard field focus`);
    }
    assert.equal(await page.evaluate(() => { const el = document.querySelector('.reprocess-track,.tv-btn'); return el ? getComputedStyle(el).transitionDuration : '0s'; }), '0s');
    assert.deepEqual(errors, [], `${route}: runtime errors`);
    console.log(`PASS ${engine}: ${route}, light/dark, 1440/768/390/320, contrast/focus/reduced motion`);
  } finally { await browser.close(); }
}

const browser = await launch();
try {
  const context = await browser.newContext();
  await fixtures(context);
  await context.route('**/js/public-config.js', route => route.fulfill({ contentType: 'text/javascript', body: "export const publicConfig = {TIBINANCE_API_BASE_URL:'https://public.example.test/v4',TIBINANCE_DEFAULT_WORLD:'Secura',TIBINANCE_MARKET_RANGE:'3M',TIBINANCE_ECONOMY_RANGE:'6M'};" }));
  await context.addInitScript(() => {
    const start = window.setInterval.bind(window), clear = window.clearInterval.bind(window), timers = new Map();
    window.setInterval = (callback, ms, ...args) => { const id = start(callback, ms, ...args); timers.set(id, ms); return id; };
    window.clearInterval = id => { timers.delete(id); clear(id); };
    window.qualityTimers = timers;
  });
  const page = await context.newPage();
  await page.goto(`${root}/markets.html`); await ready(page);
  assert.equal(await page.textContent('#world'), 'Secura');
  assert.equal(new URL(page.url()).searchParams.get('range'), '3M');
  await page.goto(`${root}/economy.html`); await ready(page);
  assert.equal(await page.textContent('#world'), 'Secura');
  assert.equal(new URL(page.url()).searchParams.get('range'), '6M');
  assert.ok(await page.evaluate(() => [...window.qualityTimers.values()].includes(300000)));
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pagehide', { persisted: true })));
  assert.ok(await page.evaluate(() => ![...window.qualityTimers.values()].some(ms => ms === 300000 || ms === 1000)));
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  assert.deepEqual(await page.evaluate(() => [...window.qualityTimers.values()].filter(ms => ms === 300000 || ms === 1000).sort((a,b) => a-b)), [1000,300000]);
  console.log(`PASS ${engine}: public env overrides reach API/world/range consumers; page lifetime stops and resumes timers once`);
} finally { await browser.close(); }
