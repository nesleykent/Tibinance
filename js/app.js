import { STATISTICS_FIELDS, STATISTICS_SIDES, STATISTICS_CSV_HEADERS, statisticsCSVValues, cleanStatistics } from './statistics.js';
import { disposeOcr } from './ocr.js';
import { ingestScreenshot, prepareCapture } from './ingestion.js';
import { analyse } from './validation.js';
import * as store from './store.js';
import { fmt, esc, spread, num } from './format.js';
import { normalizeEndsAt, offerObservations } from './offers.js';

const $ = id => document.getElementById(id);
// Timestamps are stored as YYYY-MM-DDTHH:MM:SS; the UI shows them the way the Market does.
const showTimestamp = v => typeof v === 'string' ? v.replace('T', ', ') : '';

/* ------------------------------------------------------------------ cards */
const cards = new Map();

function cardEl(id) {
  let el = $(`card-${id}`);
  if (!el) {
    el = document.createElement('article');
    el.id = `card-${id}`;
    el.className = 'card';
    $('queue').append(el);
    $('queue').hidden = false;
  }
  return el;
}

function rowsHtml(state, side) {
  const rows = state.rows[side];
  const noun = side === 'sell' ? 'Sell' : 'Buy';
  const body = rows.map((r, i) => `
    <div class="rowline ${r.bad ? 'bad' : ''}">
      <input data-s="${side}" data-i="${i}" data-f="amount" value="${fmt(r.amount)}"
             aria-label="${noun} offer ${i + 1}, amount in Tibia Coins">
      <input data-s="${side}" data-i="${i}" data-f="price"  value="${fmt(r.price)}"
             aria-label="${noun} offer ${i + 1}, price per coin in gold">
      <input data-s="${side}" data-i="${i}" data-f="total"  value="${r.total ? fmt(r.total) : ''}"
             aria-label="${noun} offer ${i + 1}, total price in gold">
      <input data-s="${side}" data-i="${i}" data-f="endsAt" value="${esc(showTimestamp(r.endsAt))}"
             placeholder="YYYY-MM-DD, HH:MM:SS" aria-label="${noun} offer ${i + 1}, Ends At">
      <span class="flag ${r.bad ? 'bad' : 'ok'}" aria-hidden="true"
            title="${r.bad ? 'amount × price does not equal the total' : 'amount × price matches the total'}"
            >${r.bad ? '✕' : '✓'}</span>
      <button class="rowdel" data-s="${side}" data-i="${i}"
              title="Remove this offer; it will not count towards the volume"
              aria-label="Remove ${noun} offer ${i + 1}">✕</button>
    </div>`).join('');
  return `<div class="side">
    <h4>${noun} Offers <span class="n">${rows.length}</span></h4>
    <div class="rowhead">
      <span>Amount</span>
      <span>Piece Price</span>
      <span>Total Price</span>
      <span>Ends At</span>
      <span title="amount × price must equal the total">=</span>
      <span></span>
    </div>
    ${body || '<p class="norows">no offers read</p>'}
    <button class="btn mini-add" data-add="${side}">+ Add Offer</button>
  </div>`;
}

function statisticsHtml(state) {
  const labels = {transactions:'Number of Transactions', highestPrice:'Highest Price', averagePrice:'Average Price', lowestPrice:'Lowest Price'};
  return `<section class="statistics-review"><h4>30-day Statistics</h4>
    <div class="statistics-sides">${STATISTICS_SIDES.map(side => `<fieldset><legend>${side === 'buy' ? 'Buy' : 'Sell'} Offers</legend>
      ${STATISTICS_FIELDS.map(key => `<label>${labels[key]}<input data-stat-side="${side}" data-stat-field="${key}" inputmode="numeric"
        aria-label="${side === 'buy' ? 'Buy' : 'Sell'} Statistics, ${labels[key]}" value="${esc(state.statisticsInputs?.[side]?.[key] ?? state.statistics30d?.[side]?.[key] ?? '')}"></label>`).join('')}</fieldset>`).join('')}</div>
  </section>`;
}

function render(state) {
  const el = cardEl(state.id);
  const label = state.uiFilename ?? 'Filename unavailable';
  el.title = label;
  const identity = `<span class="cfile">${esc(label)}</span>`;
  // Review identifiers live only in this local queue, never in a capture record.
  const line = (cls, flag, message, tone = '') => {
    el.className = `card ${cls}`;
    el.innerHTML = `<div class="cline"><span class="cflag" aria-hidden="true">${flag}</span>
      <span class="cfeedback"><span class="cmsg ${tone}">${esc(message)}</span>${identity}</span></div>`;
  };

  if (state.status === 'error') {
    line('bad', '✕', state.error, 'msg-bad');
    updateQueueBar(); return;
  }
  if (state.status === 'dup') {
    line('warn', '⇄', state.dupNote ?? 'Already in the database', 'msg-warn');
    updateQueueBar(); return;
  }
  if (state.status !== 'review') {
    line('', '…', state.stage ?? 'working…');
    updateQueueBar(); return;
  }

  const a = analyse(state);
  state.analysis = a;
  state.open ??= !a.ok;              // problems open themselves
  el.className = `card ${a.ok ? 'ok' : 'warn'}`;

  const w = state.world;
  const time = (state.capturedAt ?? '').slice(11);
  const head = w
    ? `<b class="cworld">${esc(w.world)}</b>
       <span class="cbe be-${esc(w.battleye)}" aria-hidden="true" title="${esc(w.type)}, BattlEye ${esc(w.battleye)}">●</span>
       <span class="sr-only">${esc(w.type)}, BattlEye ${esc(w.battleye)}</span>
       <span class="ctime">${esc(time)}</span>`
    : `<b class="cworld">N/A</b><span class="cbe" aria-hidden="true">○</span><span class="ctime"></span>`;
  // Each figure sits in its own fixed-width cell so the columns line up down
  // the whole list; ragged numbers are unreadable when scanning a batch.
  const nums = state.viewType === 'statistics' ? `<span class="cn">30-day Statistics</span>` : a.sell
    ? `<span class="cn price"><b>${fmt(a.sell)}</b>/<b>${fmt(a.buy)}</b></span>
       <span class="cn spread${a.spread < 0 ? ' neg' : ''}">Δ${fmt(a.spread)}</span>
       <span class="cn vol" title="Captured Sell / Buy Depth (TC)">${fmt(a.sellVolume)}/${fmt(a.buyVolume)}</span>
       <span class="cn gold">${fmt(a.goldDemand)}/${fmt(a.goldSupply)}</span>`
    : '';

  el.innerHTML = `<details ${state.open ? 'open' : ''}>
    <summary><span class="cline">
      <span class="cflag" aria-hidden="true">${a.ok ? '✓' : '⚠'}</span>
      ${head}
      <span class="cnums">${nums}</span>
      <span class="cfeedback">
        <span class="cmsg ${a.ok ? '' : 'msg-warn'}">${state.reprocess ? 'Reprocessing: ' : ''}${esc(state.saveError ?? (a.ok ? 'Ready to save' : a.warn[0] ?? 'Needs attention'))}</span>
        ${identity}
      </span>
    </span></summary>
    <div class="cbody">
      ${state.viewType === 'statistics' ? statisticsHtml(state) : `<div class="rows">${rowsHtml(state, 'sell')}${rowsHtml(state, 'buy')}</div>`}
      ${a.warn.length ? `<div class="steps msg-warn">${a.warn.map(x => `<div>⚠ ${esc(x)}</div>`).join('')}</div>` : ''}
      ${state.saveError ? `<div class="steps msg-warn" role="alert">${esc(state.saveError)}</div>` : ''}
      ${(state.ocrNotices ?? []).length ? `<div class="steps msg-note">${state.ocrNotices.map(x => `<div>ⓘ ${esc(x)}</div>`).join('')}</div>` : ''}
      <div class="btnrow">
        <button class="btn primary" data-save="${state.id}" ${a.ok ? '' : 'disabled'}>Save</button>
        ${a.ok ? '' : '<span class="fine">Correct the issues before saving.</span>'}
        <button class="btn" data-discard="${state.id}">Discard</button>
      </div>
    </div>
  </details>`;
  el.querySelector('details').addEventListener('toggle', e => { if (e.target.isConnected) state.open = e.target.open; });
  updateQueueBar();
}

/** One line of truth about the batch, plus the bulk actions. */
function updateQueueBar() {
  const bar = $('qbar');
  const list = [...cards.values()];
  if (!list.length) { bar.hidden = true; $('queue').hidden = true; $('drop').classList.remove('compact'); return; }
  bar.hidden = false;
  $('drop').classList.add('compact');
  const ready = list.filter(c => c.status === 'review' && c.analysis?.ok && c.world).length;
  const attn = list.filter(c => c.status === 'review' && !c.analysis?.ok).length;
  const busy = list.filter(c => c.status === 'work').length;
  const other = list.filter(c => c.status === 'error' || c.status === 'dup').length;
  $('qstat').innerHTML = [
    `<b>${list.length}</b> screenshot${list.length === 1 ? '' : 's'}`,
    busy ? `${busy} reading…` : '',
    ready ? `<b>${ready}</b> ready` : '',
    attn ? `<span class="attn">${attn} need${attn === 1 ? 's' : ''} attention</span>` : '',
    other ? `${other} skipped` : ''
  ].filter(Boolean).join(', ');
  const sa = $('saveAll');
  sa.disabled = ready === 0;
  sa.textContent = ready ? `Save All Ready (${ready})` : 'Save All Ready';
}

/* --------------------------------------------------------------- pipeline */
let seq = 0;

async function handleFile(file) {
  const id = `f${++seq}`;
  // Presentation only: the basename stays in queue memory. Eligibility
  // and world resolution still belong exclusively to canonical ingestion.
  const uiFilename = file.name.split(/[\\/]/).pop();
  const state = { id, uiFilename, status: 'work', stage: 'checking eligibility…', rows: { sell: [], buy: [] } };
  cards.set(id, state);
  render(state);
  const result = await ingestScreenshot(file, {
    reprocess: $('reprocess').getAttribute('aria-checked') === 'true',
    getExisting: hash => store.get(hash),
    onHash: hash => { state.hash = hash; },
    isQueued: hash => [...cards.values()].some(c => c !== state && c.hash === hash),
    onStep: stage => { state.stage = stage; render(state); }
  });
  // Copy only anonymous ingestion results; the display label is queue-local.
  for (const key of ['hash', 'capturedAt', 'world', 'rows', 'ocrWarnings', 'ocrNotices', 'reprocess', 'statistics30d', 'captureTimeZone', 'viewType']) {
    if (result[key] !== undefined) state[key] = result[key];
  }
  if (result.status === 'duplicate') {
    state.status = 'dup'; state.dupNote = 'Already in the database or queued';
  } else if (result.status === 'ready' || (result.status === 'needs_review' && result.rows)) {
    state.status = 'review';
  } else {
    state.status = 'error'; state.error = result.error ?? 'Capture could not be processed.';
  }
  render(state);
}

async function save(id) {
  const state = cards.get(id);
  if (!state) return false;
  state.saveError = null;
  try {
    const capture = prepareCapture(state);
    await store.put(capture, { reprocess: state.reprocess });
    cards.delete(id);
    $(`card-${id}`)?.remove();
    if (!$('queue').children.length) $('queue').hidden = true;
    updateQueueBar();
    await renderTable();
    return true;
  } catch {
    state.saveError = 'Correct the validation issues before saving; the capture was not stored.';
    state.open = true;
    render(state);
    return false;
  }
}

/* ------------------------------------------------------------ captures list */
let rowsCache = [];
let sortBy = { key: 'capturedAt', dir: -1 };
let captureDays = 0;
// worlds whose older captures are shown under their latest row
const expanded = new Set();

const valueOf = (r, k) => (k === 'spread' ? spread(r) : r[k]);

async function renderTable() {
  // Project legacy stored Statistics into the current export/presentation contract.
  rowsCache = (await store.all()).map(c => c.statistics30d
    ? {...c, statistics30d: cleanStatistics(c.statistics30d)} : c);
  $('capturesLoading').hidden = true;
  let rows = rowsCache.filter(r => r.viewType !== 'statistics');
  let statCaptures = rowsCache.filter(r => r.viewType === 'statistics').sort((a,b) => (b.capturedAtUtc ?? b.capturedAt).localeCompare(a.capturedAtUtc ?? a.capturedAt));

  const q = $('filter').value.trim().toLowerCase();
  if (q) { rows = rows.filter(r => r.world.toLowerCase().includes(q)); statCaptures = statCaptures.filter(r => r.world.toLowerCase().includes(q)); }

  if (captureDays && rows.length) {
    const end = Math.max(...rows.map(r => Date.parse(`${r.capturedAt}Z`)));
    rows = rows.filter(r => Date.parse(`${r.capturedAt}Z`) >= end - captureDays * 86400000);
  }

  if (captureDays && statCaptures.length) {
    const time = r => Date.parse(r.capturedAtUtc ?? `${r.capturedAt}Z`);
    const end = Math.max(...statCaptures.map(time));
    statCaptures = statCaptures.filter(r => time(r) >= end - captureDays * 86400000);
  }

  $('statisticsSaved').innerHTML = statCaptures.length ? `<h3>Saved 30-day Statistics</h3>
    <div class="table-wrap"><table class="data" aria-label="Saved 30-day Statistics">
      <thead>
        <tr class="grp">
          <th></th><th colspan="4" scope="colgroup" class="g-sell">Sell Side</th>
          <th colspan="4" scope="colgroup" class="g-buy">Buy Side</th>
          <th colspan="3" scope="colgroup" class="g-data">Data</th>
        </tr>
        <tr>
          <th scope="col">World</th>
          ${['sell','buy'].map(() => `
            <th scope="col" class="num" title="Number of Transactions (last 30 days)">Tx</th>
            <th scope="col" class="num" title="Highest Price (gp/TC)">High</th>
            <th scope="col" class="num" title="Average Price (gp/TC)">Avg</th>
            <th scope="col" class="num" title="Lowest Price (gp/TC)">Low</th>`).join('')}
          <th scope="col">Capture</th><th scope="col">Hash</th><th scope="col" title="Remove">×</th>
        </tr>
      </thead>
      <tbody>${statCaptures.map(c => `<tr>
        <td class="world">${esc(c.world)}</td>
        ${['sell','buy'].map(side => STATISTICS_FIELDS
          .map(k => `<td class="num">${num(c.statistics30d[side][k])}</td>`).join('')).join('')}
        <td><time datetime="${esc(c.capturedAt)}" title="${esc(c.captureTimeZone ?? '')}; UTC ${esc(c.capturedAtUtc ?? 'unresolved')}">${esc(showTimestamp(c.capturedAt))}</time></td>
        <td class="hash" title="${esc(c.hash)}">${esc(c.hash.slice(0, 10))}</td>
        <td><button class="del" data-del="${esc(c.hash)}" title="Remove" aria-label="Remove Statistics snapshot">×</button></td>
      </tr>`).join('')}</tbody>
    </table></div>` : '';

  // One group per world: its latest capture leads, older ones follow newest first.
  // Groups are ordered by their latest row under the current sort.
  const byWorld = new Map();
  for (const r of [...rows].sort((x, y) => y.capturedAt.localeCompare(x.capturedAt))) {
    if (!byWorld.has(r.world)) byWorld.set(r.world, []);
    byWorld.get(r.world).push(r);
  }
  const groups = [...byWorld.values()].sort(([x], [y]) => {
    const a = valueOf(x, sortBy.key), b = valueOf(y, sortBy.key);
    const cmp = typeof a === 'string' ? a.localeCompare(b) : (a ?? -Infinity) - (b ?? -Infinity);
    return cmp * sortBy.dir || y.capturedAt.localeCompare(x.capturedAt);
  });

  const worlds = new Set(rows.map(r => r.world)).size;
  $('count').textContent = rows.length
    ? `${rows.length} row${rows.length === 1 ? '' : 's'}, ${worlds} world${worlds === 1 ? '' : 's'}`
    : '0 rows';
  if (statCaptures.length) $('count').textContent += `, ${statCaptures.length} Statistics snapshot${statCaptures.length === 1 ? '' : 's'}`;
  $('empty').hidden = rows.length > 0 || statCaptures.length > 0;

  // A plain, factual line - the period the rows on screen actually span -
  // replaces what used to be a separate accounting-style disclosure panel;
  // what each derived figure means already lives in that column's own tooltip.
  const times = rows.map(r => r.capturedAt).sort();
  $('resultsMeta').textContent = times.length
    ? (times[0] === times[times.length - 1] ? `As of ${when(times[0])}` : `${when(times[0])} → ${when(times[times.length - 1])}`)
    : '';

  const rowHtml = (r, cls, first) => `<tr class="${cls}">
      ${first}
      <td class="num">${num(r.sell)}</td>
      <td class="num">${num(r.sellVolume)}</td>
      <td class="num">${num(r.goldDemand)}</td>
      <td class="num">${num(r.buy)}</td>
      <td class="num">${num(r.buyVolume)}</td>
      <td class="num">${num(r.goldSupply)}</td>
      <td class="num${spread(r) < 0 ? ' neg' : ''}"
          title="${spread(r) < 0 ? 'crossed market; a price is almost certainly misread' : ''}">${num(spread(r))}</td>
      <td>${esc(r.type)}</td>
      <td class="be be-${esc(r.battleye)}">${esc(r.battleye)}</td>
      <td><time datetime="${esc(r.capturedAt)}">${esc(showTimestamp(r.capturedAt))}</time></td>
      <td class="hash" title="${esc(r.hash)}">${esc(r.hash.slice(0, 10))}</td>
      <td><button class="del" data-del="${esc(r.hash)}" title="Remove" aria-label="Remove this observation">✕</button></td>
    </tr>`;
  $('tbody').innerHTML = groups.map(([latest, ...older]) => {
    const open = expanded.has(latest.world);
    const first = older.length
      ? `<td class="world"><button type="button" class="expand" data-world="${esc(latest.world)}" aria-expanded="${open}"
           title="${open ? 'Hide' : 'Show'} ${older.length} older capture${older.length === 1 ? '' : 's'}"><span class="chev" aria-hidden="true">›</span>${esc(latest.world)}</button></td>`
      : `<td class="world"><span class="chev-space" aria-hidden="true"></span>${esc(latest.world)}</td>`;
    return rowHtml(latest, older.length ? 'latest has-older' : 'latest', first) +
      (open ? older.map(r => rowHtml(r, 'older-row', `<td class="world"><span class="chev-space" aria-hidden="true"></span>${esc(r.world)}</td>`)).join('') : '');
  }).join('');

  for (const th of document.querySelectorAll('#table thead th[data-sort]')) {
    th.classList.toggle('sorted', th.dataset.sort === sortBy.key);
    th.setAttribute('aria-sort', th.dataset.sort === sortBy.key ? (sortBy.dir < 0 ? 'descending' : 'ascending') : 'none');
    th.dataset.dir = th.dataset.sort === sortBy.key ? (sortBy.dir < 0 ? 'desc' : 'asc') : '';
  }
}

// 2026-09-21T12:43:17 -> Sep 21, 2026 at 12:43:17 (capture times are game-local, never shifted)
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const when = iso => `${MONTHS[+iso.slice(5, 7) - 1]} ${+iso.slice(8, 10)}, ${iso.slice(0, 4)} at ${iso.slice(11, 19)}`;

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/* --------------------------------------------------------- column chooser */
// Every column but World can be hidden. Positions are 1-based within a row.
const COLUMNS = [
  { key: 'sell', label: 'Sell Price', pos: 2, group: 1 },
  { key: 'sellVolume', label: 'Captured Sell Depth', pos: 3, group: 1 },
  { key: 'goldDemand', label: 'Quoted Sell Gold Notional', pos: 4, group: 1 },
  { key: 'buy', label: 'Buy Price', pos: 5, group: 2 },
  { key: 'buyVolume', label: 'Captured Buy Depth', pos: 6, group: 2 },
  { key: 'goldSupply', label: 'Quoted Buy Gold Notional', pos: 7, group: 2 },
  { key: 'spread', label: 'Spread', pos: 8, group: 3 },
  { key: 'type', label: 'Type', pos: 9, group: 4 },
  { key: 'battleye', label: 'BattlEye', pos: 10, group: 4 },
  { key: 'capturedAt', label: 'Capture', pos: 11, group: 4 },
  { key: 'hash', label: 'Hash', pos: 12, group: 4 }
];
// columns each group-header cell spans when nothing is hidden (World and the delete button included)
const GROUP_BASE = [1, 0, 0, 0, 1];
const HIDDEN_KEY = 'tibinance.hiddenColumns.v2';
// Type and BattlEye start hidden until the viewer chooses otherwise
let hiddenCols = new Set(['type', 'battleye']);
try { const saved = JSON.parse(localStorage.getItem(HIDDEN_KEY)); if (Array.isArray(saved)) hiddenCols = new Set(saved); } catch { /* storage unavailable */ }
const colStyle = document.head.appendChild(document.createElement('style'));

function applyColumns() {
  const hidden = COLUMNS.filter(c => hiddenCols.has(c.key));
  colStyle.textContent = hidden
    .map(c => `#table tr:not(.grp) > :nth-child(${c.pos}){display:none}`).join('\n');
  document.querySelectorAll('#table tr.grp > th').forEach((th, g) => {
    const span = GROUP_BASE[g] + COLUMNS.filter(c => c.group === g && !hiddenCols.has(c.key)).length;
    th.colSpan = Math.max(span, 1);
    th.hidden = span === 0;
  });
  try { localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenCols])); } catch { /* storage unavailable */ }
}

$('columnList').insertAdjacentHTML('beforeend', COLUMNS.map(c => `
  <label><input type="checkbox" value="${c.key}" ${hiddenCols.has(c.key) ? '' : 'checked'}> ${c.label}</label>`).join(''));
$('columnList').addEventListener('change', e => {
  if (e.target.checked) hiddenCols.delete(e.target.value); else hiddenCols.add(e.target.value);
  applyColumns();
});
document.addEventListener('click', e => {
  if (!e.target.closest('#columnPicker')) $('columnPicker').open = false;
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && $('columnPicker').open) {
    $('columnPicker').open = false;
    $('columnPicker').querySelector('summary').focus();
  }
});
applyColumns();

/* ------------------------------------------------------------------ wiring */
$('reprocess').addEventListener('click', e => {
  const control = e.currentTarget;
  control.setAttribute('aria-checked', String(control.getAttribute('aria-checked') !== 'true'));
});

const drop = $('drop');
drop.addEventListener('click', () => $('file').click());
drop.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); }
});
['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => {
  e.preventDefault(); drop.classList.add('over');
}));
['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => {
  e.preventDefault(); drop.classList.remove('over');
}));
drop.addEventListener('drop', async e => {
  for (const f of [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'))) {
    await handleFile(f);
  }
});
$('file').addEventListener('change', async e => {
  for (const f of [...e.target.files]) await handleFile(f);
  e.target.value = '';
});

$('queue').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.save) save(b.dataset.save);
  else if (b.dataset.discard) {
    cards.delete(b.dataset.discard);
    $(`card-${b.dataset.discard}`)?.remove();
    if (!$('queue').children.length) $('queue').hidden = true;
  } else if (b.classList.contains('rowdel')) {
    const state = cards.get(b.closest('.card').id.slice(5));
    state.rows[b.dataset.s].splice(+b.dataset.i, 1);
    render(state);
  } else if (b.dataset.add) {
    const state = cards.get(b.closest('.card').id.slice(5));
    state.rows[b.dataset.add].push({ amount: 0, price: 0, total: 0 });
    render(state);
  }
});
$('queue').addEventListener('input', e => {
  const i = e.target;
  if (i.dataset.statField) {
    const state = cards.get(i.closest('.card').id.slice(5));
    state.saveError = null;
    state.open = i.closest('details').open;
    state.statisticsInputs ??= {buy:{},sell:{}};
    state.statisticsInputs[i.dataset.statSide][i.dataset.statField] = i.value;
    state.statistics30d ??= {buy:{},sell:{}};
    state.statistics30d[i.dataset.statSide] ??= {};
    state.statistics30d[i.dataset.statSide][i.dataset.statField] = /^\d+$/.test(i.value) ? Number(i.value) : null;
    // Preserve raw local input/caret while refreshing volumes, warnings and
    // readiness. No blur-time DOM replacement can swallow the Save click.
    const pos = i.selectionStart;
    const selector = `[data-stat-side="${i.dataset.statSide}"][data-stat-field="${i.dataset.statField}"]`;
    render(state);
    const again = document.querySelector(`#card-${state.id} input${selector}`);
    again?.focus(); again?.setSelectionRange(pos,pos);
    return;
  }
  if (!i.dataset.f) return;
  const state = cards.get(i.closest('.card').id.slice(5));
  state.saveError = null;
  state.open = i.closest('details').open;
  const n = parseInt(i.value.replace(/[^\d]/g, ''), 10);
  state.rows[i.dataset.s][+i.dataset.i][i.dataset.f] = i.dataset.f === 'endsAt'
    ? (normalizeEndsAt(i.value) ?? i.value) : (Number.isFinite(n) ? n : 0);
  const pos = i.selectionStart, key = `${i.dataset.s}-${i.dataset.i}-${i.dataset.f}`;
  render(state);
  const again = document.querySelector(
    `#card-${state.id} input[data-s="${i.dataset.s}"][data-i="${i.dataset.i}"][data-f="${i.dataset.f}"]`);
  if (again) { again.focus(); again.setSelectionRange(pos, pos); }
});

$('saveAll').addEventListener('click', async () => {
  const btn = $('saveAll');
  btn.disabled = true;
  // snapshot first: save() mutates `cards` as it goes
  const ready = [...cards.values()].filter(c => c.status === 'review' && c.analysis?.ok);
  let stored = 0;
  for (const c of ready) {
    $(`card-${c.id}`)?.classList.add('saving');
    if (await save(c.id)) stored++;
    else $(`card-${c.id}`)?.classList.remove('saving');
  }
  updateQueueBar();
  if (stored < ready.length) {
    alert(`Stored ${stored} of ${ready.length}. The rest stayed in the list with the reason shown on each card.`);
  }
});

$('discardAll').addEventListener('click', () => {
  const n = cards.size;
  if (!n || !confirm(`Discard all ${n} screenshot(s) without saving?`)) return;
  cards.clear();
  $('queue').innerHTML = '';
  $('queue').hidden = true;
  updateQueueBar();
});

$('expandAll').addEventListener('click', () => {
  const anyClosed = [...cards.values()].some(c => c.status === 'review' && !c.open);
  for (const c of cards.values()) if (c.status === 'review') c.open = anyClosed;
  for (const c of cards.values()) if (c.status === 'review') render(c);
  $('expandAll').textContent = anyClosed ? 'Collapse All' : 'Expand All';
});

$('tbody').addEventListener('click', e => {
  if (e.target.closest('button.del')) return;
  const tr = e.target.closest('tr.has-older');
  if (!tr) return;
  const w = tr.querySelector('button.expand').dataset.world;
  if (expanded.has(w)) expanded.delete(w); else expanded.add(w);
  renderTable();
});
$('tbody').addEventListener('click', async e => {
  const h = e.target.closest('button')?.dataset.del;
  if (h && confirm('Remove this observation from the database?')) {
    await store.remove(h);
    await renderTable();
  }
});
$('filter').addEventListener('input', renderTable);
$('captureRange').addEventListener('click', e => {
  const button = e.target.closest('button[data-days]');
  if (!button) return;
  captureDays = Number(button.dataset.days);
  for (const segment of $('captureRange').querySelectorAll('button')) segment.setAttribute('aria-checked', String(segment === button));
  renderTable();
});
for (const th of document.querySelectorAll('#table th[data-sort]')) {
  th.innerHTML = `<button type="button" class="sort-button">${th.innerHTML}</button>`;
}
document.querySelector('#table thead').addEventListener('click', e => {
  const key = e.target.closest('th[data-sort]')?.dataset.sort;
  if (!key) return;
  // first click on a new column sorts descending for numbers, ascending for text
  sortBy = sortBy.key === key
    ? { key, dir: -sortBy.dir }
    : { key, dir: typeof valueOf(rowsCache[0] ?? {}, key) === 'string' ? 1 : -1 };
  renderTable();
});

$('statisticsSaved').addEventListener('click', async e => { const hash=e.target.closest('[data-del]')?.dataset.del; if (hash) { await store.remove(hash); await renderTable(); } });

$('exportJson').addEventListener('click', () =>
  download('observations.json', JSON.stringify(rowsCache, null, 2), 'application/json'));
$('exportCsv').addEventListener('click', () => {
  // Units belong in the header of a data file; the values stay plain integers.
  const head = 'World,Type,BattlEye,Sell (gp/TC),Captured Sell Depth (TC),Quoted Sell Gold Notional (gp),' +
               'Buy (gp/TC),Captured Buy Depth (TC),Quoted Buy Gold Notional (gp),Spread (gp/TC),Capture,Hash,View Type,Capture UTC,Capture Date,Capture Timezone,Statistics Reference Date,' + STATISTICS_CSV_HEADERS.join(',');
  const body = rowsCache.map(r => [r.world, r.type, r.battleye, r.sell, r.sellVolume,
    r.goldDemand ?? '', r.buy, r.buyVolume, r.goldSupply ?? '', r.viewType === 'statistics' ? '' : spread(r), r.capturedAt, r.hash, r.viewType ?? 'offers', r.capturedAtUtc ?? '', r.capturedAt.slice(0,10), r.captureTimeZone ?? '', r.statisticsReferenceDate ?? '', ...statisticsCSVValues(r)]
    .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  download('observations.csv', `${head}\n${body}`, 'text/csv');
});
$('exportOffers').addEventListener('click', () => {
  const q = $('filter').value.trim().toLowerCase();
  const observations = offerObservations(rowsCache.filter(r => !q || r.world.toLowerCase().includes(q)));
  const keys = ['world', 'side', 'offerId', 'capturedAt', 'capturedAtUtc', 'captureTimeZone', 'hash', 'rowIndex', 'amount', 'price', 'total', 'endsAt', 'endsAtUtc', 'matchAmbiguous', 'processingVersion'];
  const csv = [keys.join(','), ...observations.map(r => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  download('offer-observations.csv', csv, 'text/csv');
});
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const { added, enriched, skipped } = await store.importRows(JSON.parse(await f.text()));
    await renderTable();
    alert(`Imported ${added} capture(s), enriched ${enriched}, skipped ${skipped}.`);
  } catch { alert('Import failed; check the record format. Private diagnostics are suppressed.'); }
  e.target.value = '';
});
$('clearBtn').addEventListener('click', async () => {
  if (confirm('Delete every stored observation on this device?')) {
    await store.clear();
    await renderTable();
  }
});
window.addEventListener('beforeunload', () => { disposeOcr(); });

store.loadBaseline().then(renderTable, renderTable);
