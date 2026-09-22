/*
 * The History view: every world's real captured values, consolidated into
 * one table — rows are days, columns are worlds, a cell is one metric's
 * actual observed value (never an average). This is the standard shape for
 * "historical events across multiple entities" (a stock-history table with
 * one date column and one column per ticker; a spreadsheet's own
 * Consolidate-by-category, which unions rows and columns by matching
 * labels rather than collapsing them into a summary statistic). Two prior
 * shapes were tried and both were wrong in a specific, telling way: a flat
 * per-observation list is not consolidated — it is scattered per world; a
 * per-world average is not historical — it destroys the very values a
 * history is supposed to keep. A day×world grid keeps every real value AND
 * unifies every world into one structure, which is what "consolidated
 * history" actually means.
 *
 * Deliberately independent of Market: this is not "the selected worlds
 * scoped to the current chart range," it is the whole record, always. That
 * is a different task from analysing a comparison (Market's job), which is
 * why it is a separate top-level view rather than another section bolted
 * onto the charts.
 */
import * as store from './store.js';
import { num, esc } from './format.js';

const $ = id => document.getElementById(id);

/* capturedAt is a naive ISO 8601 string with no offset, for screenshots and
   for legacy points alike; treated as one consistent clock (UTC) purely for
   ordering rows and grouping into day buckets. */
const toMs = capturedAt => Date.parse(`${capturedAt}Z`);
const dayOf = capturedAt => capturedAt.slice(0, 10);

/* A cell can only hold one scalar coherently — exactly how every real
   historical-comparison table works (a stock table shows Close, or Volume,
   picked once, never both crammed into one cell). The metric picker is
   what makes a 2D grid of many worlds' many fields legible at all. */
const METRICS = [
  { key: 'sell', label: 'Sell Price', note: 'Best (lowest) Sell price that day. Lower is cheaper to buy coins.' },
  { key: 'buy', label: 'Buy Price', note: 'Best (highest) Buy price that day. Higher pays more for your coins.' },
  { key: 'spread', label: 'Spread', note: 'Sell Price − Buy Price. Tighter means a more liquid market.' },
  { key: 'sellVolume', label: 'Sell Volume', note: 'Coins offered for sale across every visible offer.' },
  { key: 'buyVolume', label: 'Buy Volume', note: 'Coins wanted across every visible buy offer.' },
  { key: 'goldDemand', label: 'Gold Demand', note: 'Gold sellers were asking for: sum of amount × price over every visible sell offer.' },
  { key: 'goldSupply', label: 'Gold Supply', note: 'Gold escrowed in buy offers: sum of amount × price over every visible buy offer.' },
];

let rows = [];       // flat observations, screenshot + legacy
let worldMeta = new Map(); // world -> { type, battleye }
let metric = 'sell';
let dateDir = -1;    // -1 = newest first (a ledger's own convention), 1 = oldest first
let wired = false;

async function loadRows() {
  const [screenshotRows, legacyRows] = await Promise.all([store.all(), store.allLegacy()]);

  // Type/BattlEye describe the world, not one capture; legacy points never
  // carry them, so they borrow them from that world's own latest screenshot.
  const metaByWorld = new Map();
  for (const r of screenshotRows) {
    const prev = metaByWorld.get(r.world);
    if (!prev || r.capturedAt > prev.capturedAt) metaByWorld.set(r.world, r);
  }
  worldMeta = new Map([...metaByWorld].map(([w, r]) => [w, { type: r.type, battleye: r.battleye }]));

  const out = [];
  for (const r of screenshotRows) {
    out.push({
      world: r.world, sell: r.sell, buy: r.buy, spread: r.sell - r.buy,
      sellVolume: r.sellVolume, buyVolume: r.buyVolume,
      goldDemand: r.goldDemand ?? null, goldSupply: r.goldSupply ?? null,
      source: 'screenshot', capturedAt: r.capturedAt, t: toMs(r.capturedAt), day: dayOf(r.capturedAt)
    });
  }
  for (const r of legacyRows) {
    if (!metaByWorld.has(r.world)) continue;   // legacy history only ever exists for a world a screenshot already established
    out.push({
      world: r.world, sell: r.sell, buy: r.buy,
      spread: Number.isFinite(r.sell) && Number.isFinite(r.buy) ? r.sell - r.buy : null,
      sellVolume: null, buyVolume: null, goldDemand: null, goldSupply: null,
      source: 'legacy', capturedAt: r.capturedAt, t: toMs(r.capturedAt), day: dayOf(r.capturedAt)
    });
  }
  rows = out;
}

/* One cell = one (day, world) pair. Where a world has more than one capture
   in a day, the latest stands for that day — still a real observed value,
   never a blend of the two — the same "pick, don't blend" rule a daily
   stock-close table applies to intraday ticks. */
function buildGrid() {
  const grid = new Map(); // day -> Map(world -> row)
  for (const r of rows) {
    let byWorld = grid.get(r.day);
    if (!byWorld) grid.set(r.day, byWorld = new Map());
    const prev = byWorld.get(r.world);
    if (!prev || r.t > prev.t) byWorld.set(r.world, r);
  }
  return grid;
}

function render() {
  $('historyLoading').hidden = true;

  const q = $('historyFilter').value.trim().toLowerCase();
  const allWorlds = [...worldMeta.keys()].sort((a, b) => a.localeCompare(b));
  const worlds = q ? allWorlds.filter(w => w.toLowerCase().includes(q)) : allWorlds;

  const grid = buildGrid();
  let days = [...grid.keys()].filter(day => worlds.some(w => grid.get(day).has(w)));
  days.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0) * dateDir);

  $('historyCount').textContent = days.length
    ? `${days.length} day${days.length === 1 ? '' : 's'} · ${worlds.length} world${worlds.length === 1 ? '' : 's'}`
    : '0 days';
  $('historyEmpty').textContent = rows.length === 0
    ? 'No history yet — add a screenshot in Manage to start building one.'
    : 'No worlds match this filter.';
  const empty = days.length === 0;
  $('historyEmpty').hidden = !empty;
  $('historyTableWrap').hidden = empty;
  if (empty) return;

  const activeMetric = METRICS.find(m => m.key === metric);
  $('historyMetricNote').textContent = activeMetric.note;

  $('historyHeadRow').innerHTML = `
    <th class="hist-date" data-sort="date" title="Toggle newest/oldest first">Date</th>
    ${worlds.map(w => {
      const meta = worldMeta.get(w) || {};
      return `<th class="num">${esc(w)}<br><small class="be be-${esc(meta.battleye)}">${esc(meta.type || '')} · ${esc(meta.battleye || '')}</small></th>`;
    }).join('')}
  `;
  const dateTh = document.querySelector('#historyTable th[data-sort="date"]');
  dateTh.classList.add('sorted');
  dateTh.dataset.dir = dateDir < 0 ? 'desc' : 'asc';

  $('historyBody').innerHTML = days.map(day => {
    const byWorld = grid.get(day);
    const cells = worlds.map(w => {
      const r = byWorld.get(w);
      if (!r) return '<td class="num"><span class="dash" aria-label="no capture that day">—</span></td>';
      const v = r[metric];
      const cls = ['num'];
      if (metric === 'spread' && v < 0) cls.push('neg');
      if (r.source === 'legacy') cls.push('cell-legacy');
      const title = r.source === 'legacy'
        ? `Backfilled from TibiaMarket · ${esc(r.capturedAt)}`
        : esc(r.capturedAt);
      return `<td class="${cls.join(' ')}" title="${title}">${num(v)}</td>`;
    }).join('');
    return `<tr><td class="hist-date">${esc(day)}</td>${cells}</tr>`;
  }).join('');
}

function wire() {
  if (wired) return;
  wired = true;

  $('historyMetric').innerHTML = METRICS.map(m =>
    `<button type="button" data-metric="${m.key}" role="radio" aria-checked="${m.key === metric}">${m.label}</button>`
  ).join('');
  $('historyMetric').addEventListener('click', e => {
    const btn = e.target.closest('button[data-metric]');
    if (!btn) return;
    metric = btn.dataset.metric;
    for (const b of $('historyMetric').querySelectorAll('button')) {
      b.setAttribute('aria-checked', String(b.dataset.metric === metric));
    }
    render();
  });

  $('historyFilter').addEventListener('input', render);

  $('historyHeadRow').addEventListener('click', e => {
    if (!e.target.closest('th[data-sort="date"]')) return;
    dateDir = -dateDir;
    render();
  });
}

/** Called every time the History tab is shown, or the underlying data
    changed (a capture was saved, deleted, imported...). */
export async function refresh() {
  wire();
  await loadRows();
  render();
}
