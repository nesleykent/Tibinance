import { sha256 } from './hash.js';
import { parseFilename } from './filename.js';
import { lookupWorld, worldInfo } from './tibiadata.js';
import { readMarket, disposeOcr } from './ocr.js';
import * as store from './store.js';
import * as stats from './stats.js';

const $ = id => document.getElementById(id);
/*
 * Digit grouping, and the one place where the two standards in use here
 * genuinely contradict each other.
 *
 *   ISO 80000-1 (SI): groups of three separated by a thin space. A comma or a
 *     point "shall not be used", because the two swap meaning between locales -
 *     48,784 is forty-eight thousand in one country and 48.784 in another.
 *   Accounting: the comma (or the point, depending on locale) IS the thousands
 *     separator, and a ledger is expected to show it.
 *
 * No single rendering satisfies both, so the separator is a setting. Everything
 * else stays SI regardless: prefixes bound to their unit, one narrow no-break
 * space between value and symbol, ISO 8601 timestamps.
 */
const SI_GROUP = '\u202F';        // narrow no-break space
const SEP_KEY = 'tc_group_sep';
const SEPARATORS = { ',': 'comma', [SI_GROUP]: 'space' };

let groupSep = ',';
try {
  const saved = localStorage.getItem(SEP_KEY);
  if (saved && saved in SEPARATORS) groupSep = saved;
} catch { /* private mode or blocked storage - keep the default */ }

const nf = new Intl.NumberFormat('en-US');
const fmt = n => nf.format(n).replace(/,/g, groupSep);
/*
 * Gold sums run to billions, so they are written with an SI prefix.
 *
 * A prefix is not a word that can stand on its own: "10 G" means nothing. The
 * prefix and the unit symbol together form one inseparable symbol, written with
 * no space between them - 10 Ggp, not 10 G gp. The only space is the one
 * between the numeric value and that symbol, and it is a narrow NO-BREAK space
 * so the quantity never splits across lines.
 */
const fmtSI = (n, unit = '') => {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  for (const [div, prefix] of [[1e9, 'G'], [1e6, 'M'], [1e3, 'k']]) {
    if (a >= div) {
      const v = (n / div).toPrecision(3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      return `${v}${SI_GROUP}${prefix}${unit}`;   // value-to-symbol space is always SI
    }
  }
  return unit ? `${fmt(n)}${SI_GROUP}${unit}` : fmt(n);
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

/*
 * Accounting presentation for the monetary columns.
 *
 *   - the currency symbol sits at the left edge of the cell, the digits at the
 *     right, so a column of figures reads as one block
 *   - negatives are wrapped in parentheses rather than carrying a minus sign
 *   - a true zero is shown as a dash, so it is not mistaken for a small value
 *   - digits are grouped in threes (ISO 80000-1 thin space, never a comma)
 *
 * The grouping and the prefix rules are the SI ones; only the placement of the
 * symbol is the accounting convention, which applies to a column of figures
 * rather than to a quantity written in a sentence.
 */
const acct = (n, unit) => {
  // The flex row lives INSIDE the cell: a <td> must keep display:table-cell or
  // it stops taking part in the table's column sizing.
  const body = !Number.isFinite(n) || n === 0
    ? '<span class="dash">—</span>'
    : (n < 0 ? `(${fmt(Math.abs(n))})` : fmt(n));
  return `<span class="acct"><span class="cur">${unit}</span><span class="val">${body}</span></span>`;
};

/*
 * Same, for sums large enough to want an SI prefix.
 *
 * Here the symbol stays WITH the value - 1.93 Ggp - instead of being factored
 * out to the left of the cell. A symbol can only become a column marker when it
 * is identical on every row, and these are not: one row is Mgp and the next is
 * Ggp. Splitting them would leave "gp … 1.93 G", and a prefix with no unit
 * attached to it is not a quantity.
 */
const acctSI = (n, unit) => {
  if (!Number.isFinite(n)) return '<span class="dash">—</span>';
  const v = fmtSI(Math.abs(n), unit);
  return n < 0 ? `(${v})` : v;
};

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
    : `<b class="cworld">—</b><span class="cbe">○</span><span class="ctime"></span>
       <span class="cmsg msg-warn">${esc(state.worldNote ?? 'world unresolved')}</span>`;
  // Each figure sits in its own fixed-width cell so the columns line up down
  // the whole list; ragged numbers are unreadable when scanning a batch.
  const nums = a.sell
    ? `<span class="cn price"><b>${fmt(a.sell)}</b>/<b>${fmt(a.buy)}</b>&#8239;<i>gp/TC</i></span>
       <span class="cn spread">Δ${a.spread < 0 ? `(${fmt(Math.abs(a.spread))})` : fmt(a.spread)}&#8239;<i>gp/TC</i></span>
       <span class="cn vol">${fmt(a.sellVolume)}/${fmt(a.buyVolume)}&#8239;<i>TC</i></span>
       <span class="cn gold">${fmtSI(a.goldDemand, 'gp')}/${fmtSI(a.goldSupply, 'gp')}</span>`
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
      sellTopAmount: a.sellTopAmount, buyTopAmount: a.buyTopAmount,
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
/*
 * Which direction is favourable for each measure, for the opportunity flag.
 *  -1 -> lower is better   (cheaper coins, tighter spread)
 *  +1 -> higher is better  (deeper book, more gold committed)
 */
const BEST = {
  sell: -1, buy: +1, spread: -1,
  sellVolume: +1, buyVolume: +1, goldSupply: +1, goldDemand: +1
};
const MEASURE = {
  sell: 'ask', buy: 'bid', spread: 'spread',
  sellVolume: 'coins on sale', buyVolume: 'coins wanted',
  goldSupply: 'gold committed by buyers', goldDemand: 'gold asked by sellers'
};

const valueOf = (r, k) => (k === 'spread' ? spread(r) : r[k]);

/*
 * IFRS 18 "Presentation and Disclosure in Financial Statements" replaces IAS 1
 * for periods beginning on or after 1 January 2027, early application allowed.
 * What it asks of a set of figures like this one:
 *
 *   - state the presentation currency, the level of rounding and the period
 *     covered, so a reader knows what the numbers are and when they are from
 *   - present items in defined categories, keeping a derived subtotal visibly
 *     apart from the figures it is computed from
 *   - do not offset items that are separate
 *   - label items meaningfully; never park something under "other"
 *   - where a measure is not defined by any standard, say so and reconcile it
 *     to the underlying figures (the treatment IFRS 18 requires of
 *     management-defined performance measures)
 */
function disclosure(rows, priorRows = []) {
  const el = $('disclosure');
  if (!rows.length) { el.hidden = true; return; }
  el.hidden = false;
  // the period must cover everything presented, comparatives included
  const times = [...rows, ...priorRows].map(r => r.capturedAt).sort();
  const period = times[0] === times[times.length - 1]
    ? `as at ${times[0]}`
    : `${times[0]} to ${times[times.length - 1]}`;

  $('disclosureLine').innerHTML =
    `Presented in <b>gp</b> (Tibia gold) · rates <b>gp/TC</b> · volumes <b>TC</b> · ` +
    `unrounded · ${esc(period)} <span class="what">Basis of preparation</span>`;

  $('disclosureNote').innerHTML = `
    <dl>
      <dt>Presentation currency and rounding</dt>
      <dd>Gold pieces (<b>gp</b>). Prices are rates in <b>gp/TC</b>; volumes are coins
          in <b>TC</b>. No rounding is applied to what is stored. Gold sums are shown
          with an SI prefix (k, M, G) for legibility only — hover any figure for the
          recorded value, and the exports carry it in full.</dd>

      <dt>Period covered</dt>
      <dd>${esc(period)}, in local client time as recorded by the screenshot, written
          to ISO 8601.</dd>

      <dt>Categories</dt>
      <dd>Figures are grouped by the side of the market they come from. Sell side and
          buy side are presented <b>gross and are never offset</b> against one another:
          a single net figure would conceal how thin or deep either side is.</dd>

      <dt>Derived measures</dt>
      <dd>These are not read from the screenshot and are defined by nobody but this
          project, so each is reconciled to the figures it comes from:
          <ul>
            <li><b>Spread</b> = best Sell − best Buy</li>
            <li><b>Gold Demand</b> = Σ (sell amount × sell price) over every visible sell offer</li>
            <li><b>Gold Supply</b> = Σ (buy amount × buy price) over every visible buy offer</li>
          </ul>
          Spread is computed when the table is drawn. The two gold sums are stored,
          because they are sums over individual offers and cannot be rebuilt once the
          offers themselves are gone.</dd>

      <dt>Basis of the underlying figures</dt>
      <dd>Read from the market window by OCR in the browser. Each offer is checked
          against the screenshot's own Total Price column — amount × price must equal
          the total — and a row failing that check cannot be saved without being
          corrected first. Every column is labelled for what it holds; nothing is
          aggregated into an "other" line.</dd>

      <dt>Comparatives</dt>
      <dd>With <b>comparatives</b> enabled, each world shows the capture immediately
          preceding the one displayed. Worlds captured only once have no comparative
          and show none.</dd>
    </dl>`;
}

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

  /*
   * Opportunities are found statistically rather than by taking the extreme.
   * The cheapest world is always "the cheapest"; that says nothing about
   * whether it is cheap enough to act on. A modified z-score against the median
   * and MAD of the worlds on screen answers the useful question - how far this
   * world sits from the rest - and is not dragged around by the very outlier it
   * is looking for, as a mean and standard deviation would be.
   */
  const flags = new Map();
  if ($('compare').checked && rows.length > 2) {
    for (const k of Object.keys(BEST)) {
      const vals = rows.map(r => valueOf(r, k));
      if (vals.filter(Number.isFinite).length < 3) continue;
      const finite = vals.filter(Number.isFinite);
      const med = stats.median(finite);
      const z = stats.zScores(vals.map(v => (Number.isFinite(v) ? v : med)));
      rows.forEach((r, i) => {
        const score = z[i] * BEST[k];        // positive = favourable direction
        if (score < stats.NOTABLE) return;
        const strong = score >= stats.OUTLIER;
        flags.set(`${r.hash}:${k}`, {
          cls: strong ? 'opp strong' : 'opp',
          title: `${MEASURE[k]} is ${score.toFixed(1)} MAD ${BEST[k] < 0 ? 'below' : 'above'} ` +
                 `the median of ${fmt(Math.round(med))} across the ${rows.length} rows shown` +
                 (strong ? ' — a clear outlier' : '')
        });
      });
    }
  }
  const mark = (r, k, extra = '') => {
    const f = flags.get(`${r.hash}:${k}`);
    return f ? ` class="num ${extra} ${f.cls}" title="${esc(f.title)}"` : ` class="num ${extra}"`;
  };

  /*
   * IAS 1.38: present the corresponding figures for the preceding period. Here
   * that is the capture immediately before each row's own, for the same world.
   */
  const priors = new Map();
  if ($('comparatives').checked) {
    for (const r of rows) {
      const earlier = rowsCache
        .filter(o => o.world === r.world && o.capturedAt < r.capturedAt)
        .sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
      if (earlier) priors.set(r.hash, earlier);
    }
  }

  const worlds = new Set(rows.map(r => r.world)).size;
  $('count').textContent = rows.length
    ? `${rows.length} row${rows.length === 1 ? '' : 's'} · ${worlds} world${worlds === 1 ? '' : 's'}`
    : '0 rows';
  $('empty').hidden = rows.length > 0;

  const priorRow = r => {
    const p = priors.get(r.hash);
    if (!p) return '';
    return `<tr class="prior">
      <td colspan="3"><span class="plabel">preceding</span> <time datetime="${esc(p.capturedAt)}">${esc(p.capturedAt)}</time></td>
      <td class="num money">${acct(p.sell, 'gp/TC')}</td>
      <td class="num money">${acct(p.sellVolume, 'TC')}</td>
      <td class="num qty">${acctSI(p.goldDemand, 'gp')}</td>
      <td class="num money">${acct(p.buy, 'gp/TC')}</td>
      <td class="num money">${acct(p.buyVolume, 'TC')}</td>
      <td class="num qty">${acctSI(p.goldSupply, 'gp')}</td>
      <td class="num money">${acct(spread(p), 'gp/TC')}</td>
      <td colspan="3"></td>
    </tr>`;
  };

  $('tbody').innerHTML = rows.map(r => `<tr>
      <td>${esc(r.world)}</td><td>${esc(r.type)}</td>
      <td class="be be-${esc(r.battleye)}">${esc(r.battleye)}</td>
      <td${mark(r, 'sell', 'money')}>${acct(r.sell, 'gp/TC')}</td>
      <td${mark(r, 'sellVolume', 'money')}>${acct(r.sellVolume, 'TC')}</td>
      <td${mark(r, 'goldDemand', 'qty')} title="${Number.isFinite(r.goldDemand) ? fmt(r.goldDemand) + SI_GROUP + 'gp' : 'not recorded'}">${acctSI(r.goldDemand, 'gp')}</td>
      <td${mark(r, 'buy', 'money')}>${acct(r.buy, 'gp/TC')}</td>
      <td${mark(r, 'buyVolume', 'money')}>${acct(r.buyVolume, 'TC')}</td>
      <td${mark(r, 'goldSupply', 'qty')} title="${Number.isFinite(r.goldSupply) ? fmt(r.goldSupply) + SI_GROUP + 'gp' : 'not recorded'}">${acctSI(r.goldSupply, 'gp')}</td>
      <td class="num money${spread(r) < 0 ? ' neg' : ''} ${flags.get(`${r.hash}:spread`)?.cls ?? ''}"
          title="${esc(flags.get(`${r.hash}:spread`)?.title ?? (spread(r) < 0 ? 'crossed market — a price is almost certainly misread' : ''))}">${acct(spread(r), 'gp/TC')}</td>
      <td><time datetime="${esc(r.capturedAt)}">${esc(r.capturedAt)}</time></td>
      <td class="hash" title="${esc(r.hash)}">${esc(r.hash.slice(0, 10))}</td>
      <td><button class="del" data-del="${esc(r.hash)}" title="Remove">✕</button></td>
    </tr>${priorRow(r)}`).join('');
  disclosure(rows, [...priors.values()]);

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
$('comparatives').addEventListener('change', renderTable);
$('sep').addEventListener('change', e => {
  groupSep = e.target.value;
  try { localStorage.setItem(SEP_KEY, groupSep); } catch { /* not persisted */ }
  for (const c of cards.values()) render(c);   // cards carry numbers too
  renderTable();
});
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
    // Units belong in the header of a data file; the values stay plain integers.
const head = 'World,Type,BattlEye,Sell (gp/TC),Sell Volume (TC),Gold Demand (gp),' +
               'Buy (gp/TC),Buy Volume (TC),Gold Supply (gp),Spread (gp/TC),Capture,Hash';
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

$('sep').value = groupSep;
store.loadBaseline().then(renderTable).catch(renderTable);
