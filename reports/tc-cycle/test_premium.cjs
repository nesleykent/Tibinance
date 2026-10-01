const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const read = name => fs.readFileSync(path.join(__dirname, name), 'utf8');
const source = read('report.js');
const context = vm.createContext({});
vm.runInContext(`const ok = v => v != null && Number.isFinite(v);\n${source.match(/^const DAY = .*$/m)[0]}\n${source.slice(source.indexOf('function premiumWindow('), source.indexOf('function dumbbell('))}`, context);
const summary = context.premiumWindow;
const r = JSON.parse(read('results.json')), c = JSON.parse(read('complement.json'));
const benchmark = new Map(r.history.filter(x => x.world === r.benchmark).map(x => [x.date, x]));
let comparisons = 0;
for (const row of c.crossWorld.worlds.filter(x => !c.crossWorld.breaks.includes(x.world))) {
  const series = r.history.filter(x => x.world === row.world);
  for (const [weeks, field] of [[8, 'last8PremiumPct'], [26, 'recentPremiumPct'], [0, 'medianPremiumPct']]) {
    const result = summary(series, benchmark, row.side, weeks, r.asOf);
    assert.ok(Math.abs(result.premiumPct - row[field]) < 1e-8, `${row.world} ${row.side} ${weeks}`);
    comparisons++;
  }
}
// Missing or invalid benchmark prices cannot become observations; the lower boundary is exclusive.
const series = ['2026-01-04', '2026-01-11', '2026-01-18', '2026-01-25'].map((date, i) => ({date, ask: [100, 121, 144, 999][i]}));
const base = new Map(series.map(x => [x.date, {ask:100}]));
assert.equal(summary(series, base, 'ask', 1, '2026-01-18').weeks, 1);
assert.ok(Math.abs(summary(series, base, 'ask', 2, '2026-01-18').premiumPct - 32) < 1e-8); // geometric midpoint of 1.21 and 1.44
base.delete('2026-01-18');
const sparse = summary(series, base, 'ask', 1, '2026-01-18');
assert.equal(sparse.last, '2026-01-11');
assert.equal(sparse.weeks, 1);
assert.equal(summary(series, new Map(), 'ask', 8, '2026-01-18').premiumPct, null);
assert.equal(summary(series, base, 'bid', 8, '2026-01-18').weeks, 0);
console.log(`PASS: ${comparisons} research comparisons; calendar boundaries, sparse pairs, no future data, empty sides, log-median arithmetic.`);
