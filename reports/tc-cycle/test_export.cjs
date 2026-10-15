// Run against a local static server: REPORT_URL=http://localhost:8765/reports/tc-cycle/ node test_export.cjs
// Requires Playwright and an installed Chrome; no production dependency.
const assert = require('node:assert/strict');
const {chromium} = require('playwright');
(async () => {
  const errors = [];
  // A browser per language: rasterizing both editions' 142 exhibits in one Chrome exhausts it, and it closes the page.
  for (const lang of ['', 'pt-br.html']) {
    const browser = await chromium.launch({channel: 'chrome', headless: true});
    try {
      const page = await browser.newPage({viewport: {width: 1440, height: 1000}});
      page.on('pageerror', e => errors.push(e.message));
      // The report shows one page at a time; the inflation exhibits are on chapter 03 (#s01).
      await page.goto((process.env.REPORT_URL || 'http://localhost:8765/reports/tc-cycle/') + lang + '#s01');
      await page.waitForSelector('#ch-inflation-prices svg');
      const card = page.locator('#card-inflation-prices');
      await card.locator('[data-chart-range="1Y"]').click();
      const snapshot = await card.locator('[data-export]').evaluate(button => {
        const {figure, filename} = exportSnapshot(button);
        return {text: figure.textContent, controls: figure.querySelectorAll('button,select,.tip,.xhair').length, filename};
      });
      assert.equal(snapshot.controls, 0); assert.match(snapshot.text, /1Y/); assert.match(snapshot.text, /Antica/);
      assert.match(snapshot.filename, /antica-monthly-offer-prices.*1y.*\.png$/);
      // Exercise the actual download, not only the snapshot builder.
      const download = page.waitForEvent('download'); await card.locator('[data-export]').click();
      assert.equal(await (await download).failure(), null);
      const checks = await page.evaluate(async () => {
        const results = [];
        const encode = HTMLCanvasElement.prototype.toBlob;
        HTMLCanvasElement.prototype.toBlob = function (...args) {
          const figure = document.querySelector('.export-figure');
          const bounds = figure.getBoundingClientRect();
          for (const cell of figure.querySelectorAll('th,td,.card-note')) {
            const rect = cell.getBoundingClientRect();
            if (rect.right > bounds.right + 1 || rect.bottom > bounds.bottom + 1) throw new Error('Export clips table content');
          }
          // Inspect the PNG pixels, not just the live DOM: CSS-only legend marks
          // can retain their labels while silently collapsing in the serialized SVG.
          for (const label of figure.querySelectorAll('.legend > span:has(.sw)')) {
            const rect = label.getBoundingClientRect();
            if (rect.width <= 20 || rect.height <= 10) throw new Error('Missing whole-label surface');
            const x = Math.floor((rect.left - bounds.left + 1) * 2), y = Math.floor((rect.top - bounds.top + rect.height / 2) * 2);
            const actual = [...this.getContext('2d').getImageData(x, y, 1, 1).data].slice(0, 3);
            const probe = document.createElement('canvas').getContext('2d');
            probe.fillStyle = getComputedStyle(label).borderLeftColor; probe.fillRect(0, 0, 1, 1);
            const expected = [...probe.getImageData(0, 0, 1, 1).data].slice(0, 3);
            if (actual.reduce((sum, value, i) => sum + Math.abs(value - expected[i]), 0) > 30) throw new Error('PNG is missing its colored legend label');
          }
          return encode.apply(this, args);
        };
        // Every page in turn, as the index opens it: each exhibit on it is rasterized, and no table sits outside one.
        for (const id of [...document.querySelectorAll('#section-select option')].map(o => o.value)) {
          location.hash = id;
          await new Promise(r => setTimeout(r, 50));
          if ([...document.querySelectorAll('table.data')].some(t => !t.closest('[data-export-figure]'))) throw new Error(`Table outside an exhibit on ${id}`);
          for (const button of document.querySelectorAll('[data-export]')) {
            const snapshot = exportSnapshot(button);
            const originalRows = snapshot.figure.querySelectorAll('tbody tr').length;
            const blob = await renderExport(snapshot);
            const bitmap = await createImageBitmap(blob);
            results.push({size: blob.size, width: bitmap.width, height: bitmap.height, rows: originalRows});
            bitmap.close();
          }
        }
        HTMLCanvasElement.prototype.toBlob = encode;
        return results;
      });
      assert.ok(checks.length >= 40);
      checks.forEach(c => { assert.ok(c.size > 1000); assert.ok(c.width >= 1200); assert.ok(c.height > 100); });
      assert.ok(checks.some(c => c.rows >= 40));
      console.log(`PASS ${lang || 'en'}: ${checks.length} figures rasterized at 2x, complete table snapshots, selected range and actual PNG download.`);
    } finally { await browser.close(); }
  }
  assert.deepEqual(errors, []);
})().catch(e => { console.error(e); process.exitCode = 1; });
