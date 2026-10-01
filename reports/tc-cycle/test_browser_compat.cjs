// Exercise the production grouping, file loader and error handler without Object.groupBy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'report.js'), 'utf8');
const block = (a, b) => source.slice(source.indexOf(a), source.indexOf(b, source.indexOf(a)));
(async () => {
  for (const lang of ['en', 'pt']) {
    const root = {innerHTML: '', setAttribute() {}};
    const ctx = vm.createContext({document: {documentElement: {lang}, getElementById: () => root}, console: {error() {}}});
    vm.runInContext(block("'use strict';", 'document.addEventListener('), ctx);
    vm.runInContext('Object.groupBy = undefined;', ctx);
    ctx.R = JSON.parse(fs.readFileSync(path.join(__dirname, 'results.json')));
    const grouped = vm.runInContext(block('  const predOf =', '  const breaks =') + '\npredOf', ctx);
    for (const successor of new Set(ctx.R.predecessor.map(p => p.successor))) {
      assert.deepEqual(Array.from(grouped[successor]), ctx.R.predecessor.filter(p => p.successor === successor));
    }
    vm.runInContext(block('class ReportDataError', '// ---------------------------------------------------------------- report'), ctx);
    ctx.fetch = async () => ({ok: true, json: async () => ({loaded: true})});
    assert.equal((await vm.runInContext("loadReportData('results.json')", ctx)).loaded, true);
    const handler = source.slice(source.indexOf('main().catch(err => {') + 'main().catch(err => {'.length, source.lastIndexOf('  console.error(err);'));
    for (const [fetch, pattern] of [
      [async () => ({ok: false, status: 404}), /HTTP 404/],
      [async () => { throw new TypeError('Network failure'); }, /Network failure/],
      [async () => ({ok: true, json: async () => { throw new SyntaxError('Unexpected end'); }}), /invalid or incomplete JSON/],
    ]) {
      ctx.fetch = fetch;
      ctx.err = await vm.runInContext("loadReportData('results.json').catch(e => e)", ctx);
      assert.equal(vm.runInContext('err instanceof ReportDataError', ctx), true);
      assert.match(ctx.err.message, pattern);
      vm.runInContext(`{${handler}}`, ctx);
      assert.match(root.innerHTML, lang === 'en' ? /data could not be loaded/ : /carregar os dados/);
    }
    ctx.err = new TypeError('Object.groupBy is not a function <unsafe>');
    vm.runInContext(`{${handler}}`, ctx);
    assert.match(root.innerHTML, lang === 'en' ? /JavaScript runtime error/ : /erro de execução de JavaScript/);
    assert.ok(!root.innerHTML.includes('HTTP'));
    assert.ok(root.innerHTML.includes('&lt;unsafe&gt;'));
  }
  console.log('PASS: EN/PT grouping without Object.groupBy, network/HTTP/JSON failures and distinct escaped runtime errors.');
})().catch(err => { console.error(err); process.exitCode = 1; });
