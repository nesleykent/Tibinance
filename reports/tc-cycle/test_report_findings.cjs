// Regression cases for the saved reviewer findings; does not rewrite research data.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'report.js'), 'utf8');
const between = (start, end) => {
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert.ok(a >= 0 && b > a, `Missing source block: ${start}`);
  return source.slice(a, b);
};
const line = start => between(start, '\n');
const run = (lang, code, values = {}) => {
  const ctx = vm.createContext({document: {documentElement: {lang}}, ...values});
  vm.runInContext(between("'use strict';", 'document.addEventListener('), ctx);
  vm.runInContext("const RANGE = t(' to ', ' a ');", ctx);
  return vm.runInContext(code, ctx);
};
function dates(lang, captureDates) {
  return run(lang, between('  const cutoffDay =', '  const peakBy =') + '\n[captureWindow, captureBetween]',
    {R: {asOf: captureDates.at(-1)}, cur: {captureDates}});
}
for (const [lang, expected] of [
  ['en', ['21 to 27 Sep', '21 and 27 September']],
  ['pt', ['21 a 27/09', '21/09 e 27/09']],
]) assert.equal(JSON.stringify(dates(lang, ['2026-09-21', '2026-09-27'])), JSON.stringify(expected));
for (const [lang, expected] of [
  ['en', ['30 Sep to 3 Oct', '30 September and 3 October']],
  ['pt', ['30/09 a 03/10', '30/09 e 03/10']],
]) assert.equal(JSON.stringify(dates(lang, ['2026-09-30', '2026-10-03'])), JSON.stringify(expected));
for (const lang of ['en', 'pt']) {
  const d = dates(lang, ['2026-12-31', '2027-01-02']);
  assert.ok(d.every(s => s.includes('2026') && s.includes('2027')));
  const labels = run(lang, line('  const mergerDateLabel =') + '\n[mergerDateLabel({confirmedDate:null}), mergerDateLabel({confirmedDate:"2026-11-01"})]');
  assert.equal(JSON.stringify(labels), JSON.stringify(lang === 'en' ? ['first possible date', 'confirmed date'] : ['primeira data possível', 'data confirmada']));
  const p = run(lang, line('  const pIs =') + '\n[pv(.049), pv(.052), pv(.166458)]');
  assert.equal(JSON.stringify(p), JSON.stringify(lang === 'en' ? ['0.049', '0.052', '0.17'] : ['0,049', '0,052', '0,17']));
  const relevant = run(lang, line('  const relevantMergers =') + '\nrelevantMergers.map(e => e.successor)',
    {W: {Luzibra: {}}, ME: [{successor: 'Deslumbra', participants:['Luzibra','Yubra']}, {successor:'Other',participants:['Absent']}]});
  assert.equal(JSON.stringify(relevant), '["Deslumbra"]');
  const start = lang === 'en' ? "${gapVerdict === 'unknown' ? `In ${bench}, offers" : "${gapVerdict === 'unknown' ? `Em ${bench}, offers";
  const end = lang === 'en' ? '. Because a quote' : '. Como uma quote';
  const clause = between(start, end);
  const missing = run(lang, '`' + clause + '`', {gapVerdict:'unknown', bench:'Antica'});
  assert.ok(!missing.includes('N/A'));
  assert.match(missing, lang === 'en' ? /too few paired days/ : /poucos dias pareados/);
}
const statuses = run('pt', line('    const statuses =') + '\nstatuses', {wp:[
  {status:'Cenário de ofertas'}, {status:'Condicional: cotação defasada'}, {status:'Suspenso: fusão anunciada'},
]});
assert.equal(statuses, 'scenario de offers; condicional: quote defasada; suspenso: merger anunciada');
const counts = between('  const nw =', '  // The universe');
for (const n of [1, 2]) {
  const en = between('the ${nw(limited.length)}', ' from ${sgn(lo.v');
  const pt = between("${limited.length === 1 ? 'o único world", ' de ${sgn(lo.v');
  const e = run('en', counts + '\n`' + en + '`', {limited:Array(n)});
  const p = run('pt', counts + '\n`' + pt + '`', {limited:Array(n)});
  assert.match(e, n === 1 ? /one world that allows.*ranges$/ : /two worlds that allow.*range$/);
  assert.match(p, n === 1 ? /o único world que permite.*vai$/ : /os dois worlds que permitem.*vão$/);
}
console.log('PASS: EN/PT capture ranges across months and years, confirmed merger labels, irrelevant mergers, p-values near 0.05, absent paired days and PT scenario statuses.');

// Executive cards use the report's existing research results, never fixed display numbers.
for (const lang of ['en', 'pt']) {
  const kpis = between('  <div class="kpis" role="list"', '  <div class="report-layout">');
  const values = {bench:'Test World', antica:{ask:51234,date:'2027-01-05'},
    cur:{changePct:12.34,start:'2026-07-12',end:'2027-01-05',toLastWeeklyPct:10.87}, nov:{date:'2027-02-14',base:56789,low:54000,high:58000},
    r13:{horizon:13,n:71,ensemble:4.56,constant:8.91}, anticaSpread:{nowPct:2.34,nowDate:'2027-01-05'}};
  const html = run(lang, '`' + kpis + '`', values);
  assert.equal((html.match(/role="listitem"/g) || []).length, 5);
  // Every headline figure states its evidential status; the scenario is the ensemble's and its band is heuristic.
  assert.equal((html.match(/class="evidence evidence-/g) || []).length, 5);
  for (const expected of ['Test World Spot', 'Rise from Trough', 'Feb 2027 Ensemble Scenario', 'Heuristic stress band', '13-Week OOS Error', 'Execution Cost',
    'Model-implied', 'Backtested', lang === 'en' ? 'not a calibrated probability interval' : 'não um intervalo de probabilidade calibrado',
    lang === 'en' ? '12 Jul 2026' : '12/07/2026', lang === 'en' ? '+10.9% on weekly medians' : '+10,9% em weekly medians',
    lang === 'en' ? '51,234' : '51.234', lang === 'en' ? '+12.3%' : '+12,3%', lang === 'en' ? '71 weekly origins' : '71 origins semanais',
    lang === 'en' ? '4.6%' : '4,6%', lang === 'en' ? '8.9%' : '8,9%', lang === 'en' ? '2.3%' : '2,3%']) assert.ok(html.includes(expected), expected);
  assert.ok(!html.includes('44,600'));
}
console.log('PASS: five executive cards follow source values, forecast month, dates, evidential status and EN/PT formatting.');
