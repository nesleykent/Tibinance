import { sha256 } from './hash.js';
import { parseFilename } from './filename.js';
import { lookupWorld, worldInfo } from './tibiadata.js';
import { readMarket, disposeOcr } from './ocr.js';
import * as store from './store.js';
import { fmt, esc, spread, goldOf, num } from './format.js';
import { normalizeEndsAt, PROCESSING_VERSION, offerObservations } from './offers.js';

const $ = id => document.getElementById(id);
// Timestamps are stored as YYYY-MM-DDTHH:MM:SS; the UI shows them the way the Market does.
const showTimestamp = v => normalizeEndsAt(v)?.replace('T', ', ') ?? v ?? '';

/* ---------------------------------------------------------------- analysis */
function analyse(state) {
  const { sell, buy } = state.rows;
  const warn = [...(state.ocrWarnings ?? [])];
  // Without a world there is nothing to file the observation under. Flagging it
  // here is what keeps it out of the "ready" count and out of Save all.
  if (!state.world) {
    warn.push(state.worldNote ?? 'the world could not be resolved from the filename');
  }
  const live = s => s.filter(r => r.amount > 0 && r.price > 0);
  const S = live(sell), B = live(buy);

  for (const [side, rows] of [['Sell', sell], ['Buy', buy]]) {
    rows.forEach((r, i) => {
      if (r.amount > 0 && r.price > 0 && !normalizeEndsAt(r.endsAt)) {
        warn.push(`${side} row ${i + 1}: correct Ends At (YYYY-MM-DD, HH:MM:SS) to track this offer`);
      }
      if (r.total > 0 && r.amount * r.price !== r.total) {
        r.bad = true;
        warn.push(`${side} row ${i + 1}: ${fmt(r.amount)} × ${fmt(r.price)} = ` +
                  `${fmt(r.amount * r.price)}, but the screenshot total reads ${fmt(r.total)}`);
      } else r.bad = false;
    });
  }
  if (!S.length || !B.length) {
    return { warn: [...warn, 'Both a Sell and a Buy offer are required'], ok: false };
  }
  const bestSell = Math.min(...S.map(r => r.price));
  const bestBuy = Math.max(...B.map(r => r.price));
  if (S[0].price !== bestSell) {
    warn.push(`the first Sell row (${fmt(S[0].price)}) is not the best Sell price ` +
              `(${fmt(bestSell)}); the market is normally sorted, so check the read`);
  }
  if (B[0].price !== bestBuy) {
    warn.push(`the first Buy row (${fmt(B[0].price)}) is not the best Buy price ` +
              `(${fmt(bestBuy)}); the market is normally sorted, so check the read`);
  }
  if (bestBuy >= bestSell) {
    warn.push(`crossed market: best Buy ${fmt(bestBuy)} ≥ best Sell ${fmt(bestSell)}; ` +
              'those offers would already have matched, so a price is misread');
  }
  return {
    sell: bestSell, buy: bestBuy,
    sellVolume: S.reduce((a, r) => a + r.amount, 0),
    buyVolume: B.reduce((a, r) => a + r.amount, 0),
    goldDemand: goldOf(S),
    goldSupply: goldOf(B),
    // quantity available at the best price - the binding constraint on any
    // cross-world trade, since only these coins change hands at that price
    sellTopAmount: S.filter(r => r.price === bestSell).reduce((a, r) => a + r.amount, 0),
    buyTopAmount: B.filter(r => r.price === bestBuy).reduce((a, r) => a + r.amount, 0),
    sellRows: S.length, buyRows: B.length,
    spread: spread({ sell: bestSell, buy: bestBuy }),
    warn, ok: warn.length === 0
  };
}

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

function render(state) {
  const el = cardEl(state.id);
  el.title = state.name;

  // Every card is a single row. A batch of thirty has to stay scannable, so
  // the filename moves to the tooltip and the world leads instead.
  const line = (cls, flag, mid, right) => {
    el.className = `card ${cls}`;
    el.innerHTML = `<div class="cline"><span class="cflag" aria-hidden="true">${flag}</span>${mid}
      <span class="cnums">${right ?? ''}</span></div>`;
  };

  if (state.status === 'error') {
    line('bad', '✕', `<span class="cmsg msg-bad">${esc(state.error)}</span>`,
         `<span class="cfile">${esc(state.name)}</span>`);
    updateQueueBar(); return;
  }
  if (state.status === 'dup') {
    line('warn', '⇄', `<span class="cmsg msg-warn">${esc(state.dupNote ?? 'Already in the database')}</span>`,
         `<span class="cfile">${esc(state.name)}</span>`);
    updateQueueBar(); return;
  }
  if (state.status !== 'review') {
    line('', '…', `<span class="cmsg">${esc(state.stage ?? 'working…')}</span>`,
         `<span class="cfile">${esc(state.name)}</span>`);
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
    : `<b class="cworld">N/A</b><span class="cbe" aria-hidden="true">○</span><span class="ctime"></span>
       <span class="cmsg msg-warn">${esc(state.worldNote ?? 'world unresolved')}</span>`;
  // Each figure sits in its own fixed-width cell so the columns line up down
  // the whole list; ragged numbers are unreadable when scanning a batch.
  const nums = a.sell
    ? `<span class="cn price"><b>${fmt(a.sell)}</b>/<b>${fmt(a.buy)}</b></span>
       <span class="cn spread${a.spread < 0 ? ' neg' : ''}">Δ${fmt(a.spread)}</span>
       <span class="cn vol">${fmt(a.sellVolume)}/${fmt(a.buyVolume)}</span>
       <span class="cn gold">${fmt(a.goldDemand)}/${fmt(a.goldSupply)}</span>`
    : '';

  el.innerHTML = `<details ${state.open ? 'open' : ''}>
    <summary><span class="cline">
      <span class="cflag" aria-hidden="true">${a.ok ? '✓' : '⚠'}</span>
      <span class="sr-only">${a.ok ? 'Ready to save' : 'Needs attention'}</span>${head}
      <span class="cnums">${nums}</span>
    </span></summary>
    <div class="cbody">
      <div class="cfile" title="${state.reprocess ? 'Adds offer history while preserving the original world, capture date and market totals' : ''}">${state.reprocess ? 'Reprocessing: ' : ''}${esc(state.name)}</div>
      <div class="rows">${rowsHtml(state, 'sell')}${rowsHtml(state, 'buy')}</div>
      ${a.warn.length ? `<div class="steps msg-warn">${a.warn.map(x => `<div>⚠ ${esc(x)}</div>`).join('')}</div>` : ''}
      ${state.saveError ? `<div class="steps msg-warn" role="alert">${esc(state.saveError)}</div>` : ''}
      ${(state.ocrNotices ?? []).length ? `<div class="steps msg-note">${state.ocrNotices.map(x => `<div>ⓘ ${esc(x)}</div>`).join('')}</div>` : ''}
      <div class="btnrow">
        <button class="btn primary" data-save="${state.id}" ${a.ok ? '' : 'disabled'}>Save</button>
        ${a.ok ? '' : `<button class="btn" data-force="${state.id}">Save Anyway</button>`}
        <button class="btn" data-discard="${state.id}">Discard</button>
      </div>
    </div>
  </details>`;
  el.querySelector('details').addEventListener('toggle', e => { state.open = e.target.open; });
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
  const state = { id, name: file.name, status: 'work', stage: 'hashing…', rows: { sell: [], buy: [] } };
  cards.set(id, state);
  render(state);

  try {
    // 0. reject anything not taken with the screenshot hotkey before any work
    const { character, capturedAt } = parseFilename(file.name);

    // 1. hash the bytes - the only thing kept from the image itself
    state.hash = await sha256(file);
    render(state);

    // Two identical screenshots dropped together are both new to the database,
    // and storing by hash would silently collapse them into one row.
    const alreadyQueued = [...cards.values()].some(c => c !== state && c.hash === state.hash);
    const existing = await store.get(state.hash);
    state.reprocess = Boolean(existing && $('reprocess').checked);
    if (alreadyQueued || (existing && !state.reprocess)) {
      state.status = 'dup';
      state.dupNote = alreadyQueued ? 'Identical to another screenshot in this batch'
                                    : 'Already in the database';
      render(state); return;
    }

    // 2. character + capture time came from the filename; the name lives in this scope only.
    state.capturedAt = existing?.capturedAt ?? capturedAt;

    // 3. OCR and the API lookups run together
    state.stage = 'reading the market…';
    render(state);
    const bitmap = await createImageBitmap(file);

    const ocrP = readMarket(bitmap, s => { state.stage = s; render(state); });
    const worldP = existing ? Promise.resolve({ world: existing.world, type: existing.type, battleye: existing.battleye }) : lookupWorld(character)
      .then(worldInfo)
      .catch(e => { state.worldNote = e.message; return null; });

    let reading, world;
    try { [reading, world] = await Promise.all([ocrP, worldP]); }
    finally { bitmap.close?.(); }

    state.world = world;
    state.rows.sell = (reading.sell ?? []).map(r => ({ ...r }));
    state.rows.buy = (reading.buy ?? []).map(r => ({ ...r }));
    state.ocrWarnings = reading.warnings ?? [];
    state.ocrNotices = reading.notices ?? [];
    state.status = 'review';
    if (!world) state.worldNote ||= 'World lookup failed; fix the filename and retry';
    render(state);
  } catch (e) {
    state.status = 'error';
    state.error = e.message;
    render(state);
  }
  // `file` and `character` go out of scope here; nothing referencing them is kept
}

async function save(id) {
  const state = cards.get(id);
  if (!state) return false;
  if (!state.world) {           // surfaced on the card rather than swallowed
    state.open = true;
    render(state);
    return false;
  }
  const a = state.analysis ?? analyse(state);
  state.saveError = null;
  try {
    await store.put({
      world: state.world.world,
      type: state.world.type,
      battleye: state.world.battleye,
      sell: a.sell, sellVolume: a.sellVolume,
      buy: a.buy, buyVolume: a.buyVolume,
      goldSupply: a.goldSupply, goldDemand: a.goldDemand,
      sellTopAmount: a.sellTopAmount, buyTopAmount: a.buyTopAmount,
      capturedAt: state.capturedAt,
      hash: state.hash,
      processingVersion: PROCESSING_VERSION,
      offers: ['sell', 'buy'].flatMap(side => state.rows[side]
        .filter(r => r.amount > 0 && r.price > 0)
        .map((r, rowIndex) => ({ ...r, side, rowIndex })))
    }, { reprocess: state.reprocess });
    cards.delete(id);
    $(`card-${id}`)?.remove();
    if (!$('queue').children.length) $('queue').hidden = true;
    updateQueueBar();
    await renderTable();
    return true;
  } catch (e) {
    state.saveError = `Could not save: ${e.message}`;
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
  rowsCache = await store.all();
  $('capturesLoading').hidden = true;
  let rows = [...rowsCache];

  const q = $('filter').value.trim().toLowerCase();
  if (q) rows = rows.filter(r => r.world.toLowerCase().includes(q));

  if (captureDays && rows.length) {
    const end = Math.max(...rows.map(r => Date.parse(`${r.capturedAt}Z`)));
    rows = rows.filter(r => Date.parse(`${r.capturedAt}Z`) >= end - captureDays * 86400000);
  }

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
  $('empty').hidden = rows.length > 0;

  // A plain, factual line - the period the rows on screen actually span -
  // replaces what used to be a separate accounting-style disclosure panel;
  // what each derived figure means already lives in that column's own tooltip.
  const times = rows.map(r => r.capturedAt).sort();
  $('resultsMeta').textContent = times.length
    ? (times[0] === times[times.length - 1] ? `As of ${when(times[0])}` : `${when(times[0])} → ${when(times[times.length - 1])}`)
    : '';

  const rowHtml = (r, cls, first) => `<tr class="${cls}">
      ${first}<td>${esc(r.type)}</td>
      <td class="be be-${esc(r.battleye)}">${esc(r.battleye)}</td>
      <td class="num">${num(r.sell)}</td>
      <td class="num">${num(r.sellVolume)}</td>
      <td class="num">${num(r.goldDemand)}</td>
      <td class="num">${num(r.buy)}</td>
      <td class="num">${num(r.buyVolume)}</td>
      <td class="num">${num(r.goldSupply)}</td>
      <td class="num${spread(r) < 0 ? ' neg' : ''}"
          title="${spread(r) < 0 ? 'crossed market; a price is almost certainly misread' : ''}">${num(spread(r))}</td>
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
  { key: 'type', label: 'Type', pos: 2, group: 0 },
  { key: 'battleye', label: 'BattlEye', pos: 3, group: 0 },
  { key: 'sell', label: 'Sell Price', pos: 4, group: 1 },
  { key: 'sellVolume', label: 'Sell Volume', pos: 5, group: 1 },
  { key: 'goldDemand', label: 'Gold Demand', pos: 6, group: 1 },
  { key: 'buy', label: 'Buy Price', pos: 7, group: 2 },
  { key: 'buyVolume', label: 'Buy Volume', pos: 8, group: 2 },
  { key: 'goldSupply', label: 'Gold Supply', pos: 9, group: 2 },
  { key: 'spread', label: 'Spread', pos: 10, group: 3 },
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
  if (b.dataset.save || b.dataset.force) save(b.dataset.save ?? b.dataset.force);
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
  if (!i.dataset.f) return;
  const state = cards.get(i.closest('.card').id.slice(5));
  state.saveError = null;
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

$('exportJson').addEventListener('click', () =>
  download('observations.json', JSON.stringify(rowsCache, null, 2), 'application/json'));
$('exportCsv').addEventListener('click', () => {
  // Units belong in the header of a data file; the values stay plain integers.
  const head = 'World,Type,BattlEye,Sell (gp/TC),Sell Volume (TC),Gold Demand (gp),' +
               'Buy (gp/TC),Buy Volume (TC),Gold Supply (gp),Spread (gp/TC),Capture,Hash';
  const body = rowsCache.map(r => [r.world, r.type, r.battleye, r.sell, r.sellVolume,
    r.goldDemand ?? '', r.buy, r.buyVolume, r.goldSupply ?? '', spread(r), r.capturedAt, r.hash]
    .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  download('observations.csv', `${head}\n${body}`, 'text/csv');
});
$('exportOffers').addEventListener('click', () => {
  const q = $('filter').value.trim().toLowerCase();
  const observations = offerObservations(rowsCache.filter(r => !q || r.world.toLowerCase().includes(q)));
  const keys = ['world', 'side', 'offerId', 'capturedAt', 'hash', 'rowIndex', 'amount', 'price', 'total', 'endsAt', 'matchAmbiguous', 'processingVersion'];
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
  } catch (err) { alert(`Import failed: ${err.message}`); }
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
