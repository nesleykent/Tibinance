// Start python3 -m http.server 8765, then node tests/browser.mjs.
// Playwright must be installed or TIBINANCE_NODE_MODULES must point to its bundle.
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.TIBINANCE_NODE_MODULES
  ? `${process.env.TIBINANCE_NODE_MODULES}/playwright` : 'playwright');
const browser = await chromium.launch({ headless: true,
  ...(process.env.TIBINANCE_CHROME ? { executablePath: process.env.TIBINANCE_CHROME } : {}) });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/data/observations.json', r => r.fulfill({ json: [] }));
  await page.goto(process.env.TIBINANCE_TEST_URL ?? 'http://127.0.0.1:8765');
  await page.waitForFunction(() => document.getElementById('capturesLoading').hidden);
  const outcome = await page.evaluate(async () => {
    const store = await import('/js/store.js');
    const { offerObservations } = await import('/js/offers.js');
    const check = (ok, message) => { if (!ok) throw new Error(message); };
    const fixture = (hash, world = 'Ustebra', amount = 100) => ({ world, hash,
      type: 'Open PvP', battleye: 'Green', sell: 50000, buy: 49000,
      sellVolume: amount, buyVolume: 25, capturedAt: '2026-10-01T13:00:00',
      offers: [{ side: 'sell', rowIndex: 0, amount, price: 50000,
        total: amount * 50000, endsAt: '2026-10-31T01:28:54', character: 'Private' }],
      filename: 'Private', character: 'Private', image: 'pixels' });
    await store.clear();
    const legacy = fixture('legacy');
    delete legacy.offers;
    await store.put(legacy);
    let rejected = false;
    try { await store.put(fixture('legacy')); } catch { rejected = true; }
    check(rejected, 'Default duplicate protection');
    const enriched = await store.put({ ...fixture('legacy', 'Antica'), capturedAt: '2020-01-01T00:00:00', sell: 1 }, { reprocess: true });
    check(enriched.world === 'Ustebra' && enriched.sell === 50000 && enriched.capturedAt === legacy.capturedAt, 'Historical context preservation');
    const id = enriched.offers[0].offerId;
    for (let i = 0; i < 3; i++) await store.put(fixture('legacy'), { reprocess: true });
    check((await store.all()).length === 1 && (await store.get('legacy')).offers[0].offerId === id, 'Idempotent reprocessing');
    const next = await store.put(fixture('next', 'Ustebra', 50));
    const other = await store.put(fixture('other', 'Antica', 50));
    check(next.offers[0].offerId === id && other.offers[0].offerId !== id, 'Longitudinal world isolation');
    const imported = await store.importRows(await store.all());
    check(imported.skipped === 3 && (await store.all()).length === 3, 'JSON round-trip idempotence');
    const collision = fixture('collision');
    collision.offers.push({ ...collision.offers[0], rowIndex: 1 });
    const two = await store.put(collision);
    check(two.offers[0].offerId !== two.offers[1].offerId, 'Simultaneous collision UUIDs');
    check(two.offers.every(r => r.matchAmbiguous), 'Collision uncertainty');
    const before = JSON.stringify(await store.get('collision'));
    const broken = structuredClone(collision);
    broken.offers[0].endsAt = null;
    rejected = false;
    try { await store.put(broken, { reprocess: true }); } catch { rejected = true; }
    check(rejected && JSON.stringify(await store.get('collision')) === before, 'Atomic rollback');
    for (const input of [[], [collision.offers[0]]]) {
      rejected = false;
      try { await store.put({ ...collision, offers: input }, { reprocess: true }); } catch { rejected = true; }
      check(rejected && JSON.stringify(await store.get('collision')) === before, 'Incomplete reprocessing preserves observations');
    }
    await Promise.all([store.put(fixture('concurrent1', 'Secura')), store.put(fixture('concurrent2', 'Secura'))]);
    check((await store.get('concurrent1')).offers[0].offerId === (await store.get('concurrent2')).offers[0].offerId, 'Concurrent UUID allocation');
    const captures = await store.all();
    check(!JSON.stringify(captures).includes('Private') && !JSON.stringify(captures).includes('pixels'), 'Privacy boundary');
    const offers = offerObservations(captures);
    check(offers.every(r => r.world && r.hash && r.capturedAt), 'Export context');
    await store.remove('collision');
    check(!offerObservations(await store.all()).some(r => r.hash === 'collision'), 'Delete observations with capture');
    await store.clear();
    return { captures: captures.length, observations: offers.length };
  });
  console.log('IndexedDB integration passed', outcome);
  let apiCalls = 0;
  await page.route('**/api.tibiadata.com/**', route => { apiCalls++; return route.abort(); });
  const synthetic = await page.evaluate(() => {
    window.__savedTesseract = window.Tesseract;
    window.__ocrCalls = 0;
    window.Tesseract = { PSM: { SPARSE_TEXT: 11 }, createWorker: async () => ({
      setParameters: async () => {}, terminate: async () => {},
      recognize: async () => { window.__ocrCalls++; return { data: { words: [] } }; }
    }) };
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#444'; ctx.fillRect(0, 0, 32, 32);
    return canvas.toDataURL().split(',')[1];
  });
  const testFile = kind => ({ name: ['2026-10-01', '120000123', 'Synthetic Private', kind].join('_') + '.png',
    mimeType: 'image/png', buffer: Buffer.from(synthetic, 'base64') });
  await page.locator('#file').setInputFiles(testFile('Death'));
  await page.waitForFunction(() => document.querySelector('#queue .msg-bad'));
  assert.equal(await page.evaluate(() => window.__ocrCalls), 0, 'Filename rejection precedes OCR');
  await page.locator('#file').setInputFiles(testFile('Hotkey'));
  await page.waitForFunction(() => document.querySelectorAll('#queue .msg-bad').length === 2);
  const ocrCalls = await page.evaluate(() => window.__ocrCalls);
  assert.ok(ocrCalls > 0, 'Eligible input reaches original Market filter');
  await page.locator('#file').setInputFiles(testFile('Hotkey'));
  await page.waitForFunction(() => document.querySelector('#queue .msg-warn'));
  assert.equal(await page.evaluate(() => window.__ocrCalls), ocrCalls, 'SHA duplicate stops before OCR');
  assert.equal(apiCalls, 0, 'Rejected images never reach character API');
  assert.equal(await page.locator('#queue .cfile').nth(1).textContent(), testFile('Hotkey').name,
    'Full filename remains local feedback after rejection');
  assert.equal(await page.locator('#queue .ccharacter').count(), 0,
    'No separate character line duplicates the filename');
  assert.ok(await page.locator('#queue .cfeedback').evaluateAll(blocks => blocks.every(block => {
    const labels = [...block.querySelectorAll('.cmsg,.cfile')];
    const left = labels[0].getBoundingClientRect().left;
    return labels.every(label => Math.abs(label.getBoundingClientRect().left - left) < 1);
  })), 'Status and filename share the same left alignment');
  assert.equal(await page.locator('[data-force]').count(), 0, 'Validation override removed');
  console.log('Filename, duplicate, Market rejection and UI privacy integration passed');
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.getByLabel('Reprocess saved screenshots').isVisible());
    assert.ok(await page.getByRole('button', { name: 'Export Offers', exact: true }).isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Page overflow at ${width}`);
  }
  if (process.env.TIBINANCE_VISUAL) console.log(JSON.stringify({ preview:
    (await page.screenshot({ type: 'jpeg', quality: 35, fullPage: true })).toString('base64') }));
  await page.evaluate(async () => {
    await (await import('/js/ocr.js')).disposeOcr();
    window.Tesseract = window.__savedTesseract;
  });
  await page.unroute('**/api.tibiadata.com/**');
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Discard All', exact: true }).click();
  // Optional real OCR + file upload flow, requires the local sample and CDN access.
  if (process.env.TIBINANCE_SAMPLE) {
    await page.route('**/api.tibiadata.com/v4/character/**', r => r.fulfill({ json: { character: { character: { world: 'Ustebra' } } } }));
    await page.route('**/api.tibiadata.com/v4/worlds', r => r.fulfill({ json: { worlds: { regular_worlds: [{ name: 'Ustebra', pvp_type: 'Open PvP', battleye_protected: true, battleye_date: 'release' }] } } }));
    const buffer = await readFile(process.env.TIBINANCE_SAMPLE);
    const file = { name: '2026-09-21_124317718_Private Name_Hotkey.webp', mimeType: 'image/webp', buffer };
    await page.locator('#file').setInputFiles(file);
    await page.waitForFunction(() => document.querySelector('[data-save]')?.disabled === false, { timeout: 120000 });
    assert.equal(await page.locator('[data-f="endsAt"]').count(), 15);
    const values = await page.locator('[data-f="endsAt"]').evaluateAll(inputs => inputs.map(i => i.value));
    assert.ok(values.every(v => /^2026-10-\d{2}T\d{2}:\d{2}:\d{2}$/.test(v)), 'All sample dates read');
    assert.deepEqual(values, [
      '2026-10-21T12:40:55', '2026-10-21T12:34:57', '2026-10-21T10:20:48',
      '2026-10-21T09:31:58', '2026-10-21T09:29:49', '2026-10-21T12:24:52',
      '2026-10-21T11:21:51', '2026-10-21T11:17:42', '2026-10-21T11:21:28',
      '2026-10-21T12:31:44', '2026-10-21T12:22:19', '2026-10-21T10:33:26',
      '2026-10-21T09:29:21', '2026-10-21T01:42:20', '2026-10-20T17:14:25'
    ], 'All reference screenshot expiration timestamps match exactly');
    const summary = page.locator('#queue summary');
    await summary.click();
    await page.locator('[data-f="endsAt"]').first().fill('2026-02-30T12:00:00');
    assert.ok(await page.locator('[data-save]').isDisabled(), 'Invalid dates block normal save');
    await page.locator('[data-f="endsAt"]').first().fill(values[0]);
    assert.ok(await page.locator('[data-save]').isEnabled(), 'Date correction restores readiness');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: process.env.TIBINANCE_SCREENSHOT ?? '/private/tmp/tibinance-review.png', fullPage: true });
    await page.locator('[data-save]').click();
    await page.waitForFunction(() => document.querySelector('#queue').children.length === 0);
    const original = await page.evaluate(async () => (await (await import('/js/store.js')).all()));
    assert.equal(original.length, 1);
    assert.equal(original[0].offers.length, 15);
    await page.locator('#file').setInputFiles(file);
    await page.waitForFunction(() => document.querySelector('#queue').textContent.includes('Already in the database'));
    page.once('dialog', d => d.accept());
    await page.getByRole('button', { name: 'Discard All', exact: true }).click();
    // Native confirmation is accepted by the handler before another action.
    await page.getByLabel('Reprocess saved screenshots').check();
    await page.locator('#file').setInputFiles(file);
    await page.waitForFunction(() => document.querySelector('[data-save]')?.disabled === false, { timeout: 120000 });
    const note = await page.locator('#queue').textContent();
    assert.ok(note.includes('Reprocessing:'));
    await page.locator('#queue summary').click();
    await page.locator('[data-save]').click();
    await page.waitForFunction(() => document.querySelector('#queue').children.length === 0);
    const reprocessed = await page.evaluate(async () => (await (await import('/js/store.js')).all()));
    assert.deepEqual(reprocessed, original, 'Real screenshot reprocessing preserves capture and UUIDs');
    console.log('Real screenshot upload, duplicate protection and reprocessing passed');
  }
  assert.deepEqual(errors, []);
  console.log('Responsive controls and clean page runtime passed');
} finally { await browser.close(); }
