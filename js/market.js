/*
 * The Market view: each world as a time series, not a table of repeated
 * rows. A world only ever appears here because it already exists in the
 * screenshot database (store.screenshotWorlds()) - that list is the sole
 * scope for which worlds TibiaMarket history is ever fetched for. Legacy
 * points and screenshot observations are merged into one per-world series,
 * sorted by their own capture time, each still tagged with where it came
 * from.
 *
 * Layout follows one hierarchy, top to bottom: query controls (world/range,
 * which govern every section below) -> the primary visualisation (Sell and
 * Buy price, together) -> latest values (compact) -> secondary analysis (one
 * metric at a time, chosen from a small control, not six charts at once).
 */
import * as store from './store.js';
import * as stats from './stats.js';
import { fetchCoinHistory } from './tibiamarket.js';
import { fmt, num, esc } from './format.js';

const $ = id => document.getElementById(id);
const DAY = 86400000;

/* Sell and Buy price are the primary visualisation, drawn together, so they
   are not part of this list - everything here is a secondary metric, picked
   one at a time from the control below the latest-values table. */
const SECONDARY_METRICS = [
  { key: 'spread', label: 'Spread' },
  { key: 'sellVolume', label: 'Sell Volume' },
  { key: 'buyVolume', label: 'Buy Volume' },
  { key: 'goldDemand', label: 'Gold Demand' },
  { key: 'goldSupply', label: 'Gold Supply' }
];

/* Which direction is the favourable one for each measure, used only to
   flag the latest snapshot statistically (see renderSnapshot). */
const BEST = { sell: -1, buy: +1, spread: -1, sellVolume: +1, buyVolume: +1, goldSupply: +1, goldDemand: +1 };
const MEASURE = {
  sell: 'the Sell price', buy: 'the Buy price', spread: 'the spread',
  sellVolume: 'coins on sale', buyVolume: 'coins wanted',
  goldSupply: 'gold committed by buyers', goldDemand: 'gold asked by sellers'
};
const METRIC_LABEL = Object.fromEntries(SECONDARY_METRICS.map(m => [m.key, m.label]));

/* Chart-series colour only - differentiates worlds, unrelated to the app's
   own (neutral + one accent) chrome palette. Capped at a small, fixed,
   ordered set rather than generated, so it stays legible and repeatable. */
const PALETTE = ['#3b6ea5', '#2f9e58', '#c0392b', '#7c5cd6', '#1f8f8f',
                 '#c2528a', '#d9502c', '#4a5fc9', '#2f8f6f', '#8a5fb0'];

/* Above this many worlds, a text filter earns its place in the world list;
   below it, scanning the list is faster than typing into it. */
const WORLD_FILTER_THRESHOLD = 10;

let allWorlds = [];                 // eligible worlds - screenshot-derived, sorted
let selectedWorlds = new Set();
let worldMeta = new Map();          // world -> { type, battleye } (from the latest screenshot row)
let seriesByWorld = new Map();      // world -> merged points, oldest first
let preset = 'ALL';
let customRange = null;             // { start, end } in ms, overrides preset when set
let activeMetric = 'spread';
let backfilling = false;
let wired = false;

const colorFor = world => PALETTE[Math.max(0, allWorlds.indexOf(world)) % PALETTE.length];
const groupBy = (rows, key) => {
  const m = {};
  for (const r of rows) (m[r[key]] ??= []).push(r);
  return m;
};
const shortDate = ms => new Date(ms).toISOString().slice(0, 10);

/* capturedAt is a naive ISO 8601 string with no offset, for screenshots and
   for legacy points alike; treated as one consistent clock (UTC) purely for
   placing points on a shared time axis. */
const toMs = capturedAt => Date.parse(`${capturedAt}Z`);

function mergePoints(screenshotRows, legacyRows) {
  const pts = [];
  for (const r of screenshotRows) {
    pts.push({
      t: toMs(r.capturedAt), capturedAt: r.capturedAt, source: 'screenshot',
      sell: r.sell, buy: r.buy, spread: r.sell - r.buy,
      sellVolume: r.sellVolume, buyVolume: r.buyVolume,
      goldDemand: r.goldDemand ?? null, goldSupply: r.goldSupply ?? null
    });
  }
  for (const r of legacyRows) {
    pts.push({
      t: toMs(r.capturedAt), capturedAt: r.capturedAt, source: 'legacy',
      sell: r.sell, buy: r.buy,
      spread: Number.isFinite(r.sell) && Number.isFinite(r.buy) ? r.sell - r.buy : null,
      sellVolume: null, buyVolume: null, goldDemand: null, goldSupply: null
    });
  }
  pts.sort((a, b) => a.t - b.t);
  return pts;
}

async function loadData() {
  const [screenshotRows, legacyRows] = await Promise.all([store.all(), store.allLegacy()]);
  const worlds = [...new Set(screenshotRows.map(r => r.world))].sort();
  const screenshotByWorld = groupBy(screenshotRows, 'world');
  const legacyByWorld = groupBy(legacyRows, 'world');

  worldMeta = new Map();
  for (const w of worlds) {
    const latest = [...screenshotByWorld[w]].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt))[0];
    worldMeta.set(w, { type: latest.type, battleye: latest.battleye });
  }

  seriesByWorld = new Map(worlds.map(w =>
    [w, mergePoints(screenshotByWorld[w] ?? [], legacyByWorld[w] ?? [])]));

  for (const w of worlds) if (!allWorlds.includes(w)) selectedWorlds.add(w);
  allWorlds = worlds;
}

function computeDomain() {
  if (customRange) return [customRange.start, customRange.end];
  if (preset === 'ALL') {
    const ts = [...selectedWorlds].flatMap(w => (seriesByWorld.get(w) ?? []).map(p => p.t));
    if (!ts.length) return [Date.now() - 30 * DAY, Date.now()];
    return [Math.min(...ts), Math.max(...ts)];
  }
  const days = { '7D': 7, '30D': 30, '90D': 90, '1Y': 365 }[preset] ?? 30;
  const end = Date.now();
  return [end - days * DAY, end];
}

/* -------------------------------------------------- world list / legend --
   A world is a chart series: this single list is at once the legend and the
   only way to show or hide one - a coloured dot and the world's own name,
   toggled like any other pressed/unpressed button. Nothing else represents
   world selection. */
function renderWorldList() {
  const showFilter = allWorlds.length > WORLD_FILTER_THRESHOLD;
  $('worldFilter').hidden = !showFilter;
  const q = showFilter ? ($('worldFilter').value || '').trim().toLowerCase() : '';
  const list = q ? allWorlds.filter(w => w.toLowerCase().includes(q)) : allWorlds;
  $('worldList').innerHTML = list.map(w => `
    <button type="button" class="seriesitem${selectedWorlds.has(w) ? '' : ' off'}"
            data-world="${esc(w)}" aria-pressed="${selectedWorlds.has(w)}">
      <span class="swatch" style="background:${colorFor(w)}"></span>${esc(w)}
    </button>`).join('') || '<p class="norows">No worlds match</p>';
}

/*
 * A segmented control (HIG: the right control for a small set of mutually
 * exclusive choices that act on the current screen) rather than a picker or
 * a set of nav-style tabs, since these choices only ever change what the
 * chart below plots, never which screen is showing.
 */
function renderMetricTabs() {
  $('metricTabs').innerHTML = SECONDARY_METRICS.map(m => `
    <button type="button" data-metric="${m.key}" role="radio"
            aria-checked="${m.key === activeMetric}">${esc(m.label)}</button>`).join('');
}

/* ------------------------------------------------------- chart rendering -
   One renderer for both the primary (Sell + Buy, together) and secondary
   (one metric at a time) charts: round, "nice" gridlines rather than the
   raw min/max/midpoint, one line + markers per world per field, and a hover
   crosshair with a readout panel for the exact value at a point in time -
   the lines already carry the trend without it, this only adds precision.
*/
function niceStep(range, targetCount) {
  const raw = range / Math.max(1, targetCount);
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const norm = raw / mag;
  const mult = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  return mult * mag;
}
function niceTicks(min, max, targetCount = 4) {
  if (min === max) { min -= Math.abs(min) * 0.1 || 1; max += Math.abs(max) * 0.1 || 1; }
  const step = niceStep(max - min, targetCount) || 1;
  const niceMin = Math.floor(min / step) * step;
  const niceMax = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = niceMin; v <= niceMax + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
  return ticks;
}

function drawTimeSeries(wrapEl, chartEl, { seriesPts, domain, height, fields, ariaLabel, emptyMsg }) {
  const hasAny = seriesPts.some(s => s.pts.some(p => fields.some(f => Number.isFinite(p[f.key]))));
  if (!seriesPts.length || !hasAny) {
    chartEl.innerHTML = `<p class="chart-empty">${esc(emptyMsg)}</p>`;
    const stale = wrapEl.querySelector('.chart-readout');
    if (stale) stale.hidden = true;
    return;
  }

  const W = 1040, H = height, padL = 56, padR = 16, padT = 14, padB = 24;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const values = seriesPts.flatMap(s => s.pts.flatMap(p => fields.map(f => p[f.key]))).filter(Number.isFinite);
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4);
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];

  const x = t => padL + (t - domain[0]) / ((domain[1] - domain[0]) || 1) * innerW;
  const y = v => padT + (1 - (v - yMin) / ((yMax - yMin) || 1)) * innerH;

  const gridLines = ticks.map(v => {
    const yy = y(v);
    return `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" class="gridline"/>
      <text x="${padL - 8}" y="${(yy + 3).toFixed(1)}" class="axislabel" text-anchor="end" aria-hidden="true">${esc(fmt(Math.round(v)))}</text>`;
  }).join('');

  const xLabels = `
    <text x="${padL}" y="${H - 4}" class="axislabel" aria-hidden="true">${esc(shortDate(domain[0]))}</text>
    <text x="${W - padR}" y="${H - 4}" class="axislabel" text-anchor="end" aria-hidden="true">${esc(shortDate(domain[1]))}</text>`;

  const lineFor = (world, pts, field, color) => {
    const runs = [];
    let cur = [];
    for (const p of pts) {
      if (Number.isFinite(p[field.key])) cur.push(p);
      else { if (cur.length > 1) runs.push(cur); cur = []; }
    }
    if (cur.length > 1) runs.push(cur);
    const d = runs.map(run => run.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p[field.key]).toFixed(1)}`).join(' ')).join(' ');
    const soloDots = runs.length ? '' : pts.filter(p => Number.isFinite(p[field.key]))
      .map(p => `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p[field.key]).toFixed(1)}" r="1.8" fill="${color}"/>`).join('');
    const markers = pts.filter(p => p.source === 'screenshot' && Number.isFinite(p[field.key]))
      .map(p => `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p[field.key]).toFixed(1)}" r="2.2" fill="${color}">` +
        `<title>${esc(world)} · ${esc(p.capturedAt)} · ${esc(field.label)} ${esc(fmt(p[field.key]))}</title></circle>`).join('');
    const path = d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6"${field.dashed ? ' stroke-dasharray="5 3"' : ''} opacity=".92"/>` : '';
    return path + soloDots + markers;
  };

  const layers = seriesPts.map(s => {
    const color = colorFor(s.world);
    return fields.map(f => lineFor(s.world, s.pts, f, color)).join('');
  }).join('');

  chartEl.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(ariaLabel)}">
    ${gridLines}${xLabels}${layers}
    <rect class="chart-hit" x="${padL.toFixed(1)}" y="${padT.toFixed(1)}" width="${innerW.toFixed(1)}" height="${innerH.toFixed(1)}"/>
    <line class="chart-cursor" x1="0" y1="${padT}" x2="0" y2="${(H - padB).toFixed(1)}" hidden/>
  </svg>`;

  let readout = wrapEl.querySelector('.chart-readout');
  if (!readout) {
    readout = document.createElement('div');
    readout.className = 'chart-readout';
    wrapEl.appendChild(readout);
  }
  readout.hidden = true;

  const svg = chartEl.querySelector('svg');
  const hit = svg.querySelector('.chart-hit');
  const cursor = svg.querySelector('.chart-cursor');
  const allTimes = [...new Set(seriesPts.flatMap(s => s.pts.map(p => p.t)))].sort((a, b) => a - b);

  function showAt(clientX) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const t = domain[0] + frac * (domain[1] - domain[0]);
    let nearest = null, best = Infinity;
    for (const tt of allTimes) { const d = Math.abs(tt - t); if (d < best) { best = d; nearest = tt; } }
    if (nearest === null) return;

    const rows = seriesPts.map(s => {
      const p = s.pts.find(pt => pt.t === nearest);
      if (!p) return '';
      return fields.filter(f => Number.isFinite(p[f.key])).map(f => `
        <div class="rr"><span class="swatch" style="background:${colorFor(s.world)}"></span>${esc(s.world)}${fields.length > 1 ? ` · ${esc(f.label)}` : ''}<b>${esc(fmt(p[f.key]))}</b></div>`).join('');
    }).join('');
    if (!rows) { readout.hidden = true; cursor.hidden = true; return; }

    cursor.setAttribute('x1', x(nearest).toFixed(1));
    cursor.setAttribute('x2', x(nearest).toFixed(1));
    cursor.hidden = false;

    readout.innerHTML = `<div class="rt">${esc(new Date(nearest).toISOString().slice(0, 16).replace('T', ' '))}</div>${rows}`;
    readout.hidden = false;
    const px = (x(nearest) / W) * rect.width;
    readout.style.left = `${Math.min(Math.max(0, rect.width - 190), Math.max(0, px + 10))}px`;
    readout.style.top = '0px';
  }

  hit.addEventListener('pointermove', e => showAt(e.clientX));
  hit.addEventListener('pointerdown', e => showAt(e.clientX));
  hit.addEventListener('pointerleave', () => { readout.hidden = true; cursor.hidden = true; });
}

function seriesPtsFor(worlds, domain) {
  return worlds.map(w => ({
    world: w,
    pts: (seriesByWorld.get(w) ?? []).filter(p => p.t >= domain[0] && p.t <= domain[1])
  }));
}

function renderPriceChart(domain) {
  const worlds = [...selectedWorlds].filter(w => seriesByWorld.has(w));
  const wrap = $('priceChart').closest('.chart-wrap');
  if (!worlds.length) {
    $('priceChart').innerHTML = '<p class="chart-empty">Select a world to see its price history.</p>';
    const stale = wrap.querySelector('.chart-readout');
    if (stale) stale.hidden = true;
    return;
  }
  drawTimeSeries(wrap, $('priceChart'), {
    seriesPts: seriesPtsFor(worlds, domain),
    domain, height: 300,
    fields: [{ key: 'sell', label: 'Sell Price', dashed: false }, { key: 'buy', label: 'Buy Price', dashed: true }],
    ariaLabel: `Sell and Buy price over time for ${worlds.join(', ')}`,
    emptyMsg: 'No data in this range.'
  });
}

function renderSecondaryChart(metric, domain) {
  const worlds = [...selectedWorlds].filter(w => seriesByWorld.has(w));
  const label = METRIC_LABEL[metric];
  const wrap = $('secondaryChart').closest('.chart-wrap');
  if (!worlds.length) {
    $('secondaryChart').innerHTML = `<p class="chart-empty">Select a world to see ${esc(label)}.</p>`;
    const stale = wrap.querySelector('.chart-readout');
    if (stale) stale.hidden = true;
    return;
  }
  drawTimeSeries(wrap, $('secondaryChart'), {
    seriesPts: seriesPtsFor(worlds, domain),
    domain, height: 220,
    fields: [{ key: metric, label, dashed: false }],
    ariaLabel: `${label} over time for ${worlds.join(', ')}`,
    emptyMsg: `No ${label} data in this range.`
  });
}

/* ----------------------------------------------------------- latest table */
function renderSnapshot(domain) {
  const rows = [];
  for (const w of selectedWorlds) {
    const pts = seriesByWorld.get(w);
    if (!pts || !pts.length) continue;
    const inRange = pts.filter(p => p.t >= domain[0] && p.t <= domain[1]);
    const latest = (inRange.length ? inRange : pts).at(-1);
    rows.push({ world: w, ...latest, stale: inRange.length === 0 });
  }
  rows.sort((a, b) => a.world.localeCompare(b.world));

  // World, Sell Price, Buy Price, Spread always; the active metric adds one
  // more column unless it is Spread, which is already shown.
  const extra = activeMetric === 'spread' ? [] : [{ key: activeMetric, label: METRIC_LABEL[activeMetric] }];
  const cols = [
    { key: 'sell', label: 'Sell Price' }, { key: 'buy', label: 'Buy Price' },
    { key: 'spread', label: 'Spread' }, ...extra
  ];

  const flags = new Map();
  if (rows.length > 2) {
    for (const c of cols) {
      const k = c.key;
      const vals = rows.map(r => r[k]);
      const finite = vals.filter(Number.isFinite);
      if (finite.length < 3) continue;
      const med = stats.median(finite);
      const z = stats.zScores(vals.map(v => Number.isFinite(v) ? v : med));
      rows.forEach((r, i) => {
        const score = z[i] * (BEST[k] ?? 1);
        if (score < stats.NOTABLE) return;
        const strong = score >= stats.OUTLIER;
        flags.set(`${r.world}:${k}`, {
          strong,
          title: `${MEASURE[k] ?? c.label} is ${score.toFixed(1)} MAD ${(BEST[k] ?? 1) < 0 ? 'below' : 'above'} the median ` +
                 `of ${fmt(Math.round(med))} across the ${rows.length} worlds shown${strong ? ' — a clear outlier' : ''}`
        });
      });
    }
  }
  const cellHtml = (r, c) => {
    const v = r[c.key];
    const f = flags.get(`${r.world}:${c.key}`);
    const cls = ['num', c.key === 'spread' && v < 0 ? 'neg' : '', f ? (f.strong ? 'opp strong' : 'opp') : '']
      .filter(Boolean).join(' ');
    const title = f ? ` title="${esc(f.title)}"` : '';
    const flagText = f ? ` <span class="sr-only">(${f.strong ? 'notable outlier' : 'notable'}: ${esc(f.title)})</span>` : '';
    return `<td class="${cls}"${title}>${num(v)}${flagText}</td>`;
  };

  $('snapCount').textContent = rows.length ? `${rows.length} world${rows.length === 1 ? '' : 's'}` : '';
  $('snapEmpty').hidden = rows.length > 0;
  $('snapTable').closest('.table-wrap').hidden = rows.length === 0;

  $('snapTable').querySelector('thead tr').innerHTML =
    `<th>World</th>${cols.map(c => `<th class="num">${esc(c.label)}</th>`).join('')}<th>Updated</th>`;

  $('snapTable').querySelector('tbody').innerHTML = rows.map(r => `<tr class="${r.stale ? 'stale' : ''}" ${r.stale ? 'title="latest observation is outside the selected range"' : ''}>
      <td class="world">${esc(r.world)}</td>
      ${cols.map(c => cellHtml(r, c)).join('')}
      <td class="hash">${esc(r.capturedAt.slice(0, 10))}</td>
    </tr>`).join('');
}

/* --------------------------------------------------------------- compose */
function renderAll() {
  const domain = computeDomain();
  $('marketLoading').hidden = true;
  $('marketEmpty').hidden = allWorlds.length > 0;
  $('marketBody').hidden = allWorlds.length === 0;
  if (!allWorlds.length) return;
  renderPriceChart(domain);
  renderSnapshot(domain);
  renderMetricTabs();
  renderSecondaryChart(activeMetric, domain);
}

async function backfillLegacy() {
  if (backfilling) return;
  const worlds = await store.worldsNeedingLegacyFetch();
  if (!worlds.length) return;
  backfilling = true;
  $('legacyStatus').hidden = false;
  for (let i = 0; i < worlds.length; i++) {
    const w = worlds[i];
    $('legacyStatus').textContent = `Fetching TibiaMarket history for ${w}… (${i + 1}/${worlds.length})`;
    try {
      const rows = await fetchCoinHistory(w);
      await store.putLegacyBatch(w, rows);
      await store.markLegacyFetched(w, true);
    } catch {
      await store.markLegacyFetched(w, false);   // retried again next visit, not looped now
    }
    await loadData();
    renderWorldList();
    renderAll();
  }
  $('legacyStatus').hidden = true;
  backfilling = false;
}

function applyCustomRange() {
  const sv = $('rangeStart').value, ev = $('rangeEnd').value;
  if (!sv || !ev) return;
  const s = new Date(sv).getTime(), e = new Date(ev).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || s >= e) return;
  customRange = { start: s, end: e };
  renderAll();
}

/* Exactly one segment of the range control is ever checked, "Custom"
   included - selecting it reveals the two date fields in place rather than
   opening a separate popover, so the whole range choice stays one control. */
function selectRangeSegment(key) {
  for (const btn of $('rangePresets').querySelectorAll('button')) {
    btn.setAttribute('aria-checked', String(btn.dataset.range === key));
  }
  $('customRangeFields').hidden = key !== 'CUSTOM';
}

function wireControls() {
  if (wired) return;
  wired = true;

  $('worldList').addEventListener('click', e => {
    const b = e.target.closest('[data-world]');
    if (!b) return;
    const w = b.dataset.world;
    if (selectedWorlds.has(w)) selectedWorlds.delete(w); else selectedWorlds.add(w);
    renderWorldList();
    renderAll();
  });
  $('worldFilter').addEventListener('input', renderWorldList);

  $('rangePresets').addEventListener('click', e => {
    const b = e.target.closest('button[data-range]');
    if (!b) return;
    selectRangeSegment(b.dataset.range);
    if (b.dataset.range === 'CUSTOM') return;   // wait for both date fields below
    preset = b.dataset.range;
    customRange = null;
    $('rangeStart').value = ''; $('rangeEnd').value = '';
    renderAll();
  });
  $('rangeStart').addEventListener('change', applyCustomRange);
  $('rangeEnd').addEventListener('change', applyCustomRange);

  $('metricTabs').addEventListener('click', e => {
    const b = e.target.closest('button[data-metric]');
    if (!b) return;
    activeMetric = b.dataset.metric;
    renderAll();
  });
}

/** Called on first load and every time the Market tab is shown, or the
    underlying data changed (a capture was saved, deleted, imported...). */
export async function refresh() {
  wireControls();
  await loadData();
  renderWorldList();
  renderAll();
  backfillLegacy();   // fire and forget - fills in as it lands, world by world
}
