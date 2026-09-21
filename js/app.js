import { sha256 } from './hash.js';
import { parseFilename } from './filename.js';
import { lookupWorld, worldInfo } from './tibiadata.js';
import { readMarket, disposeOcr } from './ocr.js';
import * as store from './store.js';

const $ = id => document.getElementById(id);
// ISO 80000-1 (SI): digits are written in groups of three separated by a thin
// space. A comma or a point is never used as the group separator, because the
// two swap meaning between locales - 48,784 reads as 48784 in one place and as
// 48.784 in another. A narrow NO-BREAK space keeps a number from wrapping.
const SI_GROUP = '\u202F';
const nf = new Intl.NumberFormat('en-US');
const fmt = n => nf.format(n).replace(/,/g, SI_GROUP);
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// capturedAt is already ISO 8601; it is displayed exactly as it is stored.

/* Spread is derived, never stored: it is exactly sell - buy, so keeping a copy
   in the database would only create something that can fall out of step. */
const spread = r => r.sell - r.buy;

/* ---------------------------------------------------------------- analysis */
function analyse(state) {
  const { sell, buy } = state.rows;
  const warn = [...(state.ocrWarnings ?? [])];
  const live = s => s.filter(r => r.amount > 0 && r.price > 0);
  const S = live(sell), B = live(buy);

  for (const [side, rows] of [['Sell', sell], ['Buy', buy]]) {
    rows.forEach((r, i) => {
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
              `(${fmt(bestSell)}) — the market is normally sorted, so check the read`);
  }
  if (B[0].price !== bestBuy) {
    warn.push(`the first Buy row (${fmt(B[0].price)}) is not the best Buy price ` +
              `(${fmt(bestBuy)}) — the market is normally sorted, so check the read`);
  }
  if (bestBuy >= bestSell) {
    warn.push(`crossed market: best Buy ${fmt(bestBuy)} ≥ best Sell ${fmt(bestSell)} — ` +
              'those offers would already have matched, so a price is misread');
  }
  return {
    sell: bestSell, buy: bestBuy,
    sellVolume: S.reduce((a, r) => a + r.amount, 0),
    buyVolume: B.reduce((a, r) => a + r.amount, 0),
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

function steps(state) {
  const s = [];
  s.push(`<div>hash <b>${state.hash ? state.hash.slice(0, 12) + '…' : '…'}</b></div>`);
  if (state.world) {
    s.push(`<div>world <b>${esc(state.world.world)}</b> · ${esc(state.world.type)} · ` +
           `BattlEye <b>${state.world.battleye}</b></div>`);
  } else if (state.worldNote) {
    s.push(`<div>${esc(state.worldNote)}</div>`);
  }
  if (state.capturedAt) s.push(`<div>capture <b>${esc(state.capturedAt)}</b></div>`);
  return s.join('');
}

function rowsHtml(state, side) {
  const rows = state.rows[side];
  const body = rows.map((r, i) => `
    <div class="rowline ${r.bad ? 'bad' : ''}">
      <input data-s="${side}" data-i="${i}" data-f="amount" value="${fmt(r.amount)}" aria-label="${side} row ${i + 1} amount">
      <input data-s="${side}" data-i="${i}" data-f="price"  value="${fmt(r.price)}"  aria-label="${side} row ${i + 1} price">
      <input data-s="${side}" data-i="${i}" data-f="total"  value="${r.total ? fmt(r.total) : ''}" aria-label="${side} row ${i + 1} total">
      <span class="flag ${r.bad ? 'bad' : 'ok'}">${r.bad ? '✕' : '✓'}</span>
    </div>`).join('');
  return `<div><h4>${side} offers (${rows.length})</h4>${body}
    <button class="btn mini-add" data-add="${side}">+ row</button></div>`;
}

function render(state) {
  const el = cardEl(state.id);

  if (state.status === 'error' || state.status === 'dup') {
    const bad = state.status === 'error';
    el.className = `card ${bad ? 'bad' : 'warn'}`;
    el.innerHTML = `<h3>${esc(state.name)}</h3>
      <div class="steps ${bad ? 'msg-bad' : 'msg-warn'}">${esc(bad ? state.error
        : 'Already in the database — this exact screenshot was processed before.')}</div>`;
    updateQueueBar();
    return;
  }
  if (state.status !== 'review') {
    el.className = 'card';
    el.innerHTML = `<h3>${esc(state.name)}</h3><div class="steps">${steps(state)}
      <div>${esc(state.stage ?? 'working…')}</div></div>`;
    updateQueueBar();
    return;
  }

  const a = analyse(state);
  state.analysis = a;
  // problems open themselves; clean reads stay folded so a batch stays scannable
  state.open ??= !a.ok;
  el.className = `card ${a.ok ? 'ok' : 'warn'}`;

  const w = state.world;
  const meta = w
    ? `<b>${esc(w.world)}</b> · ${esc(w.type)} · BattlEye <b class="be-${esc(w.battleye)}">${esc(w.battleye)}</b> · ${esc(state.capturedAt)}`
    : `<span class="msg-warn">${esc(state.worldNote ?? 'world unresolved')}</span>`;
  const nums = a.sell
    ? `<b>${fmt(a.sell)}</b> / <b>${fmt(a.buy)}</b> gp/TC<br>
       ${fmt(a.sellVolume)} / ${fmt(a.buyVolume)} TC · spread <b>${fmt(a.spread)}</b>`
    : '—';
  const flag = a.ok ? '' : `<div class="steps msg-warn">${a.warn.map(x => `<div>⚠ ${esc(x)}</div>`).join('')}</div>`;

  el.innerHTML = `<details ${state.open ? 'open' : ''}>
    <summary>
      <span class="cfile">${a.ok ? '✓' : '⚠'} ${esc(state.name)}<span class="chev">▶</span></span>
      <span class="cmeta">${meta}</span>
      <span class="cnums">${nums}</span>
    </summary>
    <div class="cbody">
      <div class="rows">${rowsHtml(state, 'sell')}${rowsHtml(state, 'buy')}</div>
      ${flag}
      <div class="btnrow">
        <button class="btn primary" data-save="${state.id}" ${a.ok ? '' : 'disabled'}>Save</button>
        ${a.ok ? '' : `<button class="btn" data-force="${state.id}">Save anyway</button>`}
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
  if (!list.length) { bar.hidden = true; $('queue').hidden = true; return; }
  bar.hidden = false;
  const ready = list.filter(c => c.status === 'review' && c.analysis?.ok).length;
  const attn = list.filter(c => c.status === 'review' && !c.analysis?.ok).length;
  const busy = list.filter(c => c.status === 'work').length;
  const other = list.filter(c => c.status === 'error' || c.status === 'dup').length;
  $('qstat').innerHTML = [
    `<b>${list.length}</b> screenshot${list.length === 1 ? '' : 's'}`,
    busy ? `${busy} reading…` : '',
    ready ? `<b>${ready}</b> ready` : '',
    attn ? `<span class="attn">${attn} need${attn === 1 ? 's' : ''} attention</span>` : '',
    other ? `${other} skipped` : ''
  ].filter(Boolean).join(' · ');
  const sa = $('saveAll');
  sa.disabled = ready === 0;
  sa.textContent = ready ? `Save all ready (${ready})` : 'Save all ready';
}

/* --------------------------------------------------------------- pipeline */
let seq = 0;

async function handleFile(file) {
  const id = `f${++seq}`;
  const state = { id, name: file.name, status: 'work', stage: 'hashing…', rows: { sell: [], buy: [] } };
  cards.set(id, state);
  render(state);

  try {
    // 1. hash the bytes - the only thing kept from the image itself
    state.hash = await sha256(file);
    render(state);

    if (await store.hasHash(state.hash)) { state.status = 'dup'; render(state); return; }

    // 2. filename -> character + capture time. The name lives in this scope only.
    const { character, capturedAt } = parseFilename(file.name);
    state.capturedAt = capturedAt;

    // 3. OCR and the API lookups run together
    state.stage = 'reading the market…';
    render(state);
    const bitmap = await createImageBitmap(file);

    const ocrP = readMarket(bitmap, s => { state.stage = s; render(state); });
    const worldP = lookupWorld(character)
      .then(worldInfo)
      .catch(e => { state.worldNote = e.message; return null; });

    const [market, world] = await Promise.all([ocrP, worldP]);
    bitmap.close?.();                     // drop the pixels immediately

    state.world = world;
    state.rows.sell = (market.sell ?? []).map(r => ({ ...r }));
    state.rows.buy = (market.buy ?? []).map(r => ({ ...r }));
    state.ocrWarnings = market.warnings ?? [];
    state.status = 'review';
    if (!world) state.worldNote ||= 'World lookup failed — fix the filename and retry';
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
  if (!state?.world) return;
  const a = state.analysis ?? analyse(state);
  try {
    await store.put({
      world: state.world.world,
      type: state.world.type,
      battleye: state.world.battleye,
      sell: a.sell, sellVolume: a.sellVolume,
      buy: a.buy, buyVolume: a.buyVolume,
      capturedAt: state.capturedAt,
      hash: state.hash
    });
    cards.delete(id);
    $(`card-${id}`)?.remove();
    if (!$('queue').children.length) $('queue').hidden = true;
    updateQueueBar();
    await renderTable();
  } catch (e) {
    alert(`Could not save: ${e.message}`);
  }
}

/* ------------------------------------------------------------------ table */
let rowsCache = [];

async function renderTable() {
  rowsCache = await store.all();
  let rows = [...rowsCache].sort((x, y) =>
    y.capturedAt.localeCompare(x.capturedAt) || x.world.localeCompare(y.world));
  if ($('latestOnly').checked) {
    const seen = new Set();
    rows = rows.filter(r => !seen.has(r.world) && seen.add(r.world));
  }
  $('count').textContent = `${rows.length} row${rows.length === 1 ? '' : 's'}`;
  $('empty').hidden = rows.length > 0;
  $('tbody').innerHTML = rows.map(r => `<tr>
      <td>${esc(r.world)}</td><td>${esc(r.type)}</td>
      <td class="be be-${esc(r.battleye)}">${esc(r.battleye)}</td>
      <td class="num">${fmt(r.sell)}</td><td class="num">${fmt(r.sellVolume)}</td>
      <td class="num">${fmt(r.buy)}</td><td class="num">${fmt(r.buyVolume)}</td>
      <td class="num${spread(r) < 0 ? ' neg' : ''}">${fmt(spread(r))}</td>
      <td><time datetime="${esc(r.capturedAt)}">${esc(r.capturedAt)}</time></td>
      <td class="hash" title="${esc(r.hash)}">${esc(r.hash.slice(0, 10))}</td>
      <td><button class="del" data-del="${esc(r.hash)}" title="Remove">✕</button></td>
    </tr>`).join('');
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

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
  const n = parseInt(i.value.replace(/[^\d]/g, ''), 10);
  state.rows[i.dataset.s][+i.dataset.i][i.dataset.f] = Number.isFinite(n) ? n : 0;
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
  for (const c of ready) {
    $(`card-${c.id}`)?.classList.add('saving');
    await save(c.id);
  }
  updateQueueBar();
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
  $('expandAll').textContent = anyClosed ? 'Collapse all' : 'Expand all';
});

$('tbody').addEventListener('click', async e => {
  const h = e.target.closest('button')?.dataset.del;
  if (h && confirm('Remove this observation from the database?')) {
    await store.remove(h);
    await renderTable();
  }
});
$('latestOnly').addEventListener('change', renderTable);

$('exportJson').addEventListener('click', () =>
  download('observations.json', JSON.stringify(rowsCache, null, 2), 'application/json'));
$('exportCsv').addEventListener('click', () => {
  const head = 'World,Type,BattlEye,Sell,Sell Volume,Buy,Buy Volume,Spread,Capture,Hash';
  const body = rowsCache.map(r => [r.world, r.type, r.battleye, r.sell, r.sellVolume,
    r.buy, r.buyVolume, spread(r), r.capturedAt, r.hash]
    .map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  download('observations.csv', `${head}\n${body}`, 'text/csv');
});
$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const { added, skipped } = await store.importRows(JSON.parse(await f.text()));
    await renderTable();
    alert(`Imported ${added} row(s), skipped ${skipped}.`);
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

store.loadBaseline().then(renderTable).catch(renderTable);
