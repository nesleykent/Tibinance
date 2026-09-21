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
// Gold sums run to billions. SI prefixes keep the column narrow; the exact
// figure stays available in the cell's tooltip.
const fmtSI = n => {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  for (const [div, suf] of [[1e9, 'G'], [1e6, 'M'], [1e3, 'k']]) {
    if (a >= div) {
      const v = (n / div).toPrecision(3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      return `${v}${SI_GROUP}${suf}`;
    }
  }
  return fmt(n);
};
const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// capturedAt is already ISO 8601; it is displayed exactly as it is stored.

/* Spread is derived, never stored: it is exactly sell - buy, so keeping a copy
   in the database would only create something that can fall out of step. */
const spread = r => r.sell - r.buy;

/*
 * Gold demand - what sellers are asking for, summed over every visible sell
 * offer. Gold supply - gold escrowed in buy offers, i.e. gold actually
 * committed on that world. Both are sums over rows, so unlike the spread they
 * cannot be rebuilt from the stored best price and volume, and are persisted.
 */
const goldOf = rows => rows.reduce((t, r) => t + r.amount * r.price, 0);

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
    goldDemand: goldOf(S),
    goldSupply: goldOf(B),
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
  const noun = side === 'sell' ? 'Sell' : 'Buy';
  const body = rows.map((r, i) => `
    <div class="rowline ${r.bad ? 'bad' : ''}">
      <input data-s="${side}" data-i="${i}" data-f="amount" value="${fmt(r.amount)}"
             aria-label="${noun} offer ${i + 1}, amount in Tibia Coins">
      <input data-s="${side}" data-i="${i}" data-f="price"  value="${fmt(r.price)}"
             aria-label="${noun} offer ${i + 1}, price per coin in gold">
      <input data-s="${side}" data-i="${i}" data-f="total"  value="${r.total ? fmt(r.total) : ''}"
             aria-label="${noun} offer ${i + 1}, total price in gold">
      <span class="flag ${r.bad ? 'bad' : 'ok'}"
            title="${r.bad ? 'amount × price does not equal the total' : 'amount × price matches the total'}"
            >${r.bad ? '✕' : '✓'}</span>
      <button class="rowdel" data-s="${side}" data-i="${i}"
              title="Remove this offer — it will not count towards the volume"
              aria-label="Remove ${noun} offer ${i + 1}">✕</button>
    </div>`).join('');
  return `<div class="side">
    <h4>${noun} offers <span class="n">${rows.length}</span></h4>
    <div class="rowhead">
      <span>Amount <i>TC</i></span>
      <span>Piece Price <i>gp/TC</i></span>
      <span>Total Price <i>gp</i></span>
      <span title="amount × price must equal the total">=</span>
      <span></span>
    </div>
    ${body || '<p class="norows">no offers read</p>'}
    <button class="btn mini-add" data-add="${side}">+ add offer</button>
  </div>`;
}

function render(state) {
  const el = cardEl(state.id);
  el.title = state.name;

  // Every card is a single row. A batch of thirty has to stay scannable, so
  // the filename moves to the tooltip and the world leads instead.
  const line = (cls, flag, mid, right) => {
    el.className = `card ${cls}`;
    el.innerHTML = `<div class="cline"><span class="cflag">${flag}</span>${mid}
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
       <span class="cbe be-${esc(w.battleye)}" title="${esc(w.type)} · BattlEye ${esc(w.battleye)}">●</span>
       <span class="ctime">${esc(time)}</span>`
    : `<span class="cmsg msg-warn">${esc(state.worldNote ?? 'world unresolved')}</span>`;
  const nums = a.sell
    ? `<b>${fmt(a.sell)}</b>/<b>${fmt(a.buy)}</b> <i>gp/TC</i>
       <span class="sep">·</span> Δ${fmt(a.spread)}
       <span class="sep">·</span> ${fmt(a.sellVolume)}/${fmt(a.buyVolume)} <i>TC</i>
       <span class="sep">·</span> ${fmtSI(a.goldDemand)}/${fmtSI(a.goldSupply)} <i>gp</i>`
    : '';

  el.innerHTML = `<details ${state.open ? 'open' : ''}>
    <summary><span class="cline">
      <span class="cflag">${a.ok ? '✓' : '⚠'}</span>${head}
      <span class="cnums">${nums}</span>
    </span></summary>
    <div class="cbody">
      <div class="cfile">${esc(state.name)}</div>
      <div class="rows">${rowsHtml(state, 'sell')}${rowsHtml(state, 'buy')}</div>
      ${a.warn.length ? `<div class="steps msg-warn">${a.warn.map(x => `<div>⚠ ${esc(x)}</div>`).join('')}</div>` : ''}
      ${(state.ocrNotices ?? []).length ? `<div class="steps msg-note">${state.ocrNotices.map(x => `<div>ⓘ ${esc(x)}</div>`).join('')}</div>` : ''}
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

    // Two identical screenshots dropped together are both new to the database,
    // and storing by hash would silently collapse them into one row.
    const alreadyQueued = [...cards.values()].some(c => c !== state && c.hash === state.hash);
    if (alreadyQueued || await store.hasHash(state.hash)) {
      state.status = 'dup';
      state.dupNote = alreadyQueued ? 'Identical to another screenshot in this batch'
                                    : 'Already in the database';
      render(state); return;
    }

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
    state.ocrNotices = market.notices ?? [];
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
  if (!state) return false;
  if (!state.world) {           // surfaced on the card rather than swallowed
    state.open = true;
    render(state);
    return false;
  }
  const a = state.analysis ?? analyse(state);
  try {
    await store.put({
      world: state.world.world,
      type: state.world.type,
      battleye: state.world.battleye,
      sell: a.sell, sellVolume: a.sellVolume,
      buy: a.buy, buyVolume: a.buyVolume,
      goldSupply: a.goldSupply, goldDemand: a.goldDemand,
      capturedAt: state.capturedAt,
      hash: state.hash
    });
    cards.delete(id);
    $(`card-${id}`)?.remove();
    if (!$('queue').children.length) $('queue').hidden = true;
    updateQueueBar();
    await renderTable();
    return true;
  } catch (e) {
    state.status = 'error';
    state.error = `Could not save: ${e.message}`;
    render(state);
    return false;
  }
}

/* ------------------------------------------------------------------ table */
let rowsCache = [];
let sortBy = { key: 'capturedAt', dir: -1 };

/*
 * Which direction counts as "best" per column, for the comparison highlight.
 *  -1 -> lowest wins   (cheapest coins, tightest spread)
 *  +1 -> highest wins  (most gold offered, deepest book)
 */
const BEST = {
  sell: -1, buy: +1, spread: -1,
  sellVolume: +1, buyVolume: +1, goldSupply: +1, goldDemand: +1
};
const BEST_WHY = {
  sell: 'cheapest coins of the worlds shown',
  buy: 'most gold paid per coin of the worlds shown',
  spread: 'tightest spread of the worlds shown',
  sellVolume: 'most coins on sale of the worlds shown',
  buyVolume: 'most coins wanted of the worlds shown',
  goldSupply: 'most gold committed in buy offers of the worlds shown',
  goldDemand: 'most gold asked for by sellers of the worlds shown'
};

const valueOf = (r, k) => (k === 'spread' ? spread(r) : r[k]);

async function renderTable() {
  rowsCache = await store.all();
  let rows = [...rowsCache];

  const q = $('filter').value.trim().toLowerCase();
  if (q) rows = rows.filter(r => r.world.toLowerCase().includes(q));

  rows.sort((x, y) => {
    const a = valueOf(x, sortBy.key), b = valueOf(y, sortBy.key);
    const cmp = typeof a === 'string' ? a.localeCompare(b) : (a ?? -Infinity) - (b ?? -Infinity);
    return cmp * sortBy.dir || y.capturedAt.localeCompare(x.capturedAt);
  });

  if ($('latestOnly').checked) {
    const byWorld = new Map();
    for (const r of [...rows].sort((x, y) => y.capturedAt.localeCompare(x.capturedAt))) {
      if (!byWorld.has(r.world)) byWorld.set(r.world, r);
    }
    rows = rows.filter(r => byWorld.get(r.world) === r);
  }

  // extremes are computed over exactly the rows on screen, so the highlight
  // always answers "best of what I am looking at"
  const best = {};
  if ($('compare').checked && rows.length > 1) {
    for (const k of Object.keys(BEST)) {
      const vals = rows.map(r => valueOf(r, k)).filter(Number.isFinite);
      if (vals.length > 1) best[k] = BEST[k] < 0 ? Math.min(...vals) : Math.max(...vals);
    }
  }
  const mark = (r, k) => (best[k] !== undefined && valueOf(r, k) === best[k])
    ? ` class="num best" title="${esc(BEST_WHY[k])}"` : ' class="num"';

  const worlds = new Set(rows.map(r => r.world)).size;
  $('count').textContent = rows.length
    ? `${rows.length} row${rows.length === 1 ? '' : 's'} · ${worlds} world${worlds === 1 ? '' : 's'}`
    : '0 rows';
  $('empty').hidden = rows.length > 0;

  $('tbody').innerHTML = rows.map(r => `<tr>
      <td>${esc(r.world)}</td><td>${esc(r.type)}</td>
      <td class="be be-${esc(r.battleye)}">${esc(r.battleye)}</td>
      <td${mark(r, 'sell')}>${fmt(r.sell)}</td>
      <td${mark(r, 'sellVolume')}>${fmt(r.sellVolume)}</td>
      <td${mark(r, 'goldDemand')} title="${Number.isFinite(r.goldDemand) ? fmt(r.goldDemand) + ' gp' : 'not recorded'}">${fmtSI(r.goldDemand)}</td>
      <td${mark(r, 'buy')}>${fmt(r.buy)}</td>
      <td${mark(r, 'buyVolume')}>${fmt(r.buyVolume)}</td>
      <td${mark(r, 'goldSupply')} title="${Number.isFinite(r.goldSupply) ? fmt(r.goldSupply) + ' gp' : 'not recorded'}">${fmtSI(r.goldSupply)}</td>
      <td class="num${spread(r) < 0 ? ' neg' : ''}${best.spread === spread(r) ? ' best' : ''}"
          title="${best.spread === spread(r) ? esc(BEST_WHY.spread) : (spread(r) < 0 ? 'crossed market — a price is almost certainly misread' : '')}">${fmt(spread(r))}</td>
      <td><time datetime="${esc(r.capturedAt)}">${esc(r.capturedAt)}</time></td>
      <td class="hash" title="${esc(r.hash)}">${esc(r.hash.slice(0, 10))}</td>
      <td><button class="del" data-del="${esc(r.hash)}" title="Remove">✕</button></td>
    </tr>`).join('');

  for (const th of document.querySelectorAll('#table thead th[data-sort]')) {
    th.classList.toggle('sorted', th.dataset.sort === sortBy.key);
    th.dataset.dir = th.dataset.sort === sortBy.key ? (sortBy.dir < 0 ? 'desc' : 'asc') : '';
  }
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
$('compare').addEventListener('change', renderTable);
$('filter').addEventListener('input', renderTable);
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
  const head = 'World,Type,BattlEye,Sell,Sell Volume,Gold Demand,Buy,Buy Volume,Gold Supply,Spread,Capture,Hash';
  const body = rowsCache.map(r => [r.world, r.type, r.battleye, r.sell, r.sellVolume,
    r.goldDemand ?? '', r.buy, r.buyVolume, r.goldSupply ?? '', spread(r), r.capturedAt, r.hash]
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
