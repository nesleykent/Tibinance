/*
 * The History view: the complete, unfiltered historical record - every
 * observation across every world ever captured, screenshot and legacy
 * alike - in the order it happened. This is a market TRACKER; a table of
 * its data has to stay a history, not a statistic that averages the
 * timeline away. Rows are grouped by world (each world's own run of
 * observations stays together, oldest to newest) rather than interleaved
 * across worlds by date, since that is what actually makes a table of many
 * worlds' history readable as history rather than a shuffled dump.
 *
 * Deliberately independent of Market: this is not "the selected worlds
 * scoped to the current chart range," it is the whole record, always. That
 * is a different task from analysing a comparison (Market's job), which is
 * why it is a separate top-level view rather than another section bolted
 * onto the charts.
 */
import * as store from './store.js';
import { fmt, num, esc } from './format.js';

const $ = id => document.getElementById(id);

/* capturedAt is a naive ISO 8601 string with no offset, for screenshots and
   for legacy points alike; treated as one consistent clock (UTC) purely for
   sorting rows chronologically. */
const toMs = capturedAt => Date.parse(`${capturedAt}Z`);

let rows = [];
let sortBy = { key: 'world', dir: 1 };
let wired = false;

async function loadRows() {
  const [screenshotRows, legacyRows] = await Promise.all([store.all(), store.allLegacy()]);

  // Type/BattlEye describe the world, not one capture; legacy points never
  // carry them, so they borrow them from that world's own latest screenshot -
  // the same rule Market's per-world series already uses.
  const metaByWorld = new Map();
  for (const r of screenshotRows) {
    const prev = metaByWorld.get(r.world);
    if (!prev || r.capturedAt > prev.capturedAt) metaByWorld.set(r.world, r);
  }

  const out = [];
  for (const r of screenshotRows) {
    out.push({
      world: r.world, type: r.type, battleye: r.battleye,
      sell: r.sell, buy: r.buy, spread: r.sell - r.buy,
      sellVolume: r.sellVolume, buyVolume: r.buyVolume,
      goldDemand: r.goldDemand ?? null, goldSupply: r.goldSupply ?? null,
      source: 'screenshot', capturedAt: r.capturedAt, t: toMs(r.capturedAt)
    });
  }
  for (const r of legacyRows) {
    const meta = metaByWorld.get(r.world);
    if (!meta) continue;   // legacy history only ever exists for a world a screenshot already established
    out.push({
      world: r.world, type: meta.type, battleye: meta.battleye,
      sell: r.sell, buy: r.buy,
      spread: Number.isFinite(r.sell) && Number.isFinite(r.buy) ? r.sell - r.buy : null,
      sellVolume: null, buyVolume: null, goldDemand: null, goldSupply: null,
      source: 'legacy', capturedAt: r.capturedAt, t: toMs(r.capturedAt)
    });
  }
  rows = out;
}

function render() {
  $('historyLoading').hidden = true;

  const q = $('historyFilter').value.trim().toLowerCase();
  let list = q ? rows.filter(r => r.world.toLowerCase().includes(q)) : rows;

  list = [...list].sort((a, b) => {
    const av = a[sortBy.key], bv = b[sortBy.key];
    const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av ?? -Infinity) - (bv ?? -Infinity);
    if (cmp) return cmp * sortBy.dir;
    // ties fall back to world, then oldest-first, so each world's own rows
    // stay together and in order rather than landing in an arbitrary sequence
    return a.world.localeCompare(b.world) || a.t - b.t;
  });

  const worldCount = new Set(list.map(r => r.world)).size;
  $('historyCount').textContent = list.length
    ? `${list.length} observation${list.length === 1 ? '' : 's'} · ${worldCount} world${worldCount === 1 ? '' : 's'}`
    : '0 observations';
  $('historyEmpty').textContent = rows.length === 0
    ? "No history yet — add a screenshot in Manage to start building one."
    : 'No observations match this filter.';
  $('historyEmpty').hidden = list.length > 0;
  $('historyTable').closest('.table-wrap').hidden = list.length === 0;

  $('historyBody').innerHTML = list.map((r, i) => {
    // a visible seam wherever the world changes, so each world's run of rows
    // reads as its own block instead of one undifferentiated table
    const newGroup = i === 0 || list[i - 1].world !== r.world;
    return `<tr class="${newGroup ? 'group-start' : ''}">
      <td class="world">${esc(r.world)}</td>
      <td>${esc(r.type)}</td>
      <td class="be be-${esc(r.battleye)}">${esc(r.battleye)}</td>
      <td class="num">${num(r.sell)}</td>
      <td class="num">${num(r.sellVolume)}</td>
      <td class="num">${num(r.goldDemand)}</td>
      <td class="num">${num(r.buy)}</td>
      <td class="num">${num(r.buyVolume)}</td>
      <td class="num">${num(r.goldSupply)}</td>
      <td class="num${r.spread < 0 ? ' neg' : ''}"${r.spread < 0 ? ' title="crossed market — a price is almost certainly misread"' : ''}>${num(r.spread)}</td>
      <td class="${r.source === 'legacy' ? 'source-legacy' : ''}">${r.source === 'legacy' ? 'Legacy' : 'Screenshot'}</td>
      <td><time datetime="${esc(r.capturedAt)}">${esc(r.capturedAt)}</time></td>
    </tr>`;
  }).join('');

  for (const th of document.querySelectorAll('#historyTable thead th[data-sort]')) {
    th.classList.toggle('sorted', th.dataset.sort === sortBy.key);
    th.dataset.dir = th.dataset.sort === sortBy.key ? (sortBy.dir < 0 ? 'desc' : 'asc') : '';
  }
}

function wire() {
  if (wired) return;
  wired = true;
  $('historyFilter').addEventListener('input', render);
  document.querySelector('#historyTable thead').addEventListener('click', e => {
    const key = e.target.closest('th[data-sort]')?.dataset.sort;
    if (!key) return;
    sortBy = sortBy.key === key
      ? { key, dir: -sortBy.dir }
      : { key, dir: key === 'world' || key === 'type' || key === 'battleye' || key === 'source' ? 1 : -1 };
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
