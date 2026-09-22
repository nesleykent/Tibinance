/*
 * The Market view: each world as a time series, not a table of repeated
 * rows. A world only ever appears here because it already exists in the
 * screenshot database (store.screenshotWorlds()) - that list is the sole
 * scope for which worlds TibiaMarket history is ever fetched for. Legacy
 * points and screenshot observations are merged into one per-world series,
 * sorted by their own capture time, each still tagged with where it came
 * from.
 *
 * World selection and chart visualisation are one problem, not two: rather
 * than overlaying every selected world's Sell/Buy lines on one axis (world
 * encoded by colour, Sell/Buy by line style), which stops being legible past
 * a handful of worlds and forces a large colour-to-name legend, the chart
 * always has exactly one FOCUSED world drawn in full detail - two clear
 * lines, real gridlines, hover inspection - while every other selected
 * world gets its own small, labelled comparison card (Apple's own pattern
 * for this: the Health app's Trends screen, a grid of small per-item charts
 * that expand to a detailed view on tap, sharing style with it). Clicking a
 * card, or a world's name in the Latest table, changes which world is
 * focused. World identity is then carried by label and position, never by
 * hue, so the chart stays legible with 2 worlds selected or with all of
 * them.
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

/*
 * Exactly two chart colours exist in this app, ever - one per line in a
 * chart that shows two (Sell/Buy), or one for a chart that shows a single
 * metric. World identity is never colour-coded: a world is a labelled card
 * or a named detail view, which is what actually scales past a handful of
 * items (HIG: "avoid relying solely on colour to differentiate... include
 * alternative ways to convey this information"). Read fresh per render
 * rather than baked into CSS, because these paint raw SVG attributes, which
 * cannot reference a CSS custom property.
 */
const prefersDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const seriesColors = () => prefersDark() ? { a: '#7aa8db', b: '#b79cf0' } : { a: '#3b6ea5', b: '#7c5cd6' };

let allWorlds = [];                 // eligible worlds - screenshot-derived, sorted
let selectedWorlds = new Set();
let focusedWorld = null;            // the one world shown in full chart detail
let worldMeta = new Map();          // world -> { type, battleye } (from the latest screenshot row)
let seriesByWorld = new Map();      // world -> merged points, oldest first
let preset = 'ALL';
let customRange = null;             // { start, end } in ms, overrides preset when set
let activeMetric = 'spread';
let backfilling = false;
let wired = false;

/* World-picker popover state - one control regardless of how many worlds
   exist; a long list scrolls rather than the interaction changing shape. */
let pickerOpen = false;
let pickerQuery = '';
let pickerActiveIndex = 0;

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

/* A compact "how stale is this" figure for the Latest table - real prices
   run to five and six digits, which left no room in a sidebar column for a
   full date next to Sell/Buy/Spread; how long ago a row is from is also the
   more useful thing to see at a glance there than the date itself, since it
   is what "stale" (below) is telling you about. The exact timestamp is
   still one hover away via the cell's title. */
function relativeAge(ms) {
  const diff = Math.max(0, Date.now() - ms);
  const MIN = 60000, HOUR = 3600000, MONTH = 30 * DAY, YEAR = 365 * DAY;
  if (diff < HOUR) return `${Math.max(1, Math.round(diff / MIN))}m`;
  if (diff < DAY) return `${Math.round(diff / HOUR)}h`;
  if (diff < MONTH) return `${Math.round(diff / DAY)}d`;
  if (diff < YEAR) return `${Math.round(diff / MONTH)}mo`;
  return `${Math.round(diff / YEAR)}y`;
}

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

const selectedInOrder = () => allWorlds.filter(w => selectedWorlds.has(w));

/* The focused world always has to be one of the selected ones; falls back
   to the first selected world whenever it isn't (nothing focused yet, or
   the previously-focused world was just deselected). */
function ensureFocus() {
  const sel = selectedInOrder();
  if (!sel.length) { focusedWorld = null; return; }
  if (!focusedWorld || !selectedWorlds.has(focusedWorld)) focusedWorld = sel[0];
}

function latestObservedTime(worlds) {
  const ts = worlds.flatMap(w => (seriesByWorld.get(w) ?? []).map(p => p.t));
  return ts.length ? Math.max(...ts) : Date.now();
}

/*
 * The domain is scoped to the FOCUSED world, not to every selected world
 * combined. A world with a shorter history than the others sharing this
 * comparison would otherwise have its own dense, meaningful data squeezed
 * into a sliver of a domain stretched by someone else's longer history -
 * exactly the "useful observations compressed into a tiny portion of the
 * plot" failure a shared-across-everyone domain produces. "All" honestly
 * spans everything the world being examined actually has, however far back
 * that goes; a preset window (7D/30D/...) is anchored to that world's own
 * most recent observation rather than to wall-clock now, so picking "7D"
 * the day after your last screenshot of it still shows seven days of real
 * data instead of mostly empty space up to today. The mini cards share this
 * same domain so their shapes stay comparable to the detail chart and to
 * each other; a world with less history than the focused one simply shows
 * less filled-in width, which is honest rather than misleading.
 */
function computeDomain() {
  if (customRange) return [customRange.start, customRange.end];
  const basis = focusedWorld ? [focusedWorld] : selectedInOrder();
  if (preset === 'ALL') {
    const ts = basis.flatMap(w => (seriesByWorld.get(w) ?? []).map(p => p.t));
    if (!ts.length) return [Date.now() - 30 * DAY, Date.now()];
    return [Math.min(...ts), Math.max(...ts)];
  }
  const days = { '7D': 7, '30D': 30, '90D': 90, '1Y': 365 }[preset] ?? 30;
  const end = latestObservedTime(basis);
  return [end - days * DAY, end];
}

/*
 * The Latest table and the Observations table below are cross-world
 * comparisons, not an examination of one world - their whole purpose is
 * every selected world at once, so unlike the chart domain above they are
 * never narrowed to whichever world happens to be focused. Same Range
 * control, same preset/custom values, computed across every selected world
 * combined instead of just one.
 */
function tableDomain() {
  if (customRange) return [customRange.start, customRange.end];
  const worlds = selectedInOrder();
  if (preset === 'ALL') {
    const ts = worlds.flatMap(w => (seriesByWorld.get(w) ?? []).map(p => p.t));
    if (!ts.length) return [Date.now() - 30 * DAY, Date.now()];
    return [Math.min(...ts), Math.max(...ts)];
  }
  const days = { '7D': 7, '30D': 30, '90D': 90, '1Y': 365 }[preset] ?? 30;
  const end = latestObservedTime(worlds);
  return [end - days * DAY, end];
}

/* --------------------------------------------------------- world picker ---
 * Selecting worlds is a search-and-choose interaction (HIG: Search fields,
 * Popovers), not the chart's own legend. A compact trigger summarises the
 * current choice without opening anything; the popover it opens holds a
 * live-filtering search field over every world, each shown with a checkmark
 * for its current state - the same control whether there are two worlds or
 * two hundred, since a long list scrolls rather than the control changing.
 * Because more than one choice is possible, the popover stays open across
 * clicks and closes only on outside click, Escape, or its own close button.
 * This only ever controls the comparison SCOPE; which of the scoped worlds
 * is drawn in full detail is a separate, chart-side choice (see focus).
 */
function renderWorldPicker() {
  const sel = selectedInOrder();
  $('worldPickerLabel').textContent = !sel.length ? 'Select worlds'
    : sel.length <= 2 ? sel.join(', ')
    : `${sel.length} worlds selected`;
}

const filteredWorlds = () => {
  const q = pickerQuery.trim().toLowerCase();
  return q ? allWorlds.filter(w => w.toLowerCase().includes(q)) : allWorlds;
};

function renderPickerOptions() {
  const list = filteredWorlds();
  if (pickerActiveIndex >= list.length) pickerActiveIndex = list.length - 1;
  if (pickerActiveIndex < 0 && list.length) pickerActiveIndex = 0;
  $('worldSearch').setAttribute('aria-activedescendant', list.length ? `wopt-${pickerActiveIndex}` : '');
  $('worldOptions').innerHTML = list.length
    ? list.map((w, i) => `
      <li id="wopt-${i}" role="option" class="picker-option${i === pickerActiveIndex ? ' active' : ''}"
          data-world="${esc(w)}" aria-selected="${selectedWorlds.has(w)}">
        <span class="opt-check" aria-hidden="true">✓</span>
        <span class="opt-name">${esc(w)}</span>
      </li>`).join('')
    : '<li class="picker-empty">No worlds match</li>';
}

function toggleWorld(w) {
  if (selectedWorlds.has(w)) selectedWorlds.delete(w); else selectedWorlds.add(w);
  renderWorldPicker();
  renderPickerOptions();
  renderAll();
}

function focusWorld(w) {
  if (!selectedWorlds.has(w) || w === focusedWorld) return;
  focusedWorld = w;
  renderAll();
}

function openPicker() {
  if (pickerOpen) return;
  pickerOpen = true;
  $('worldPickerPopover').hidden = false;
  $('worldPickerBtn').setAttribute('aria-expanded', 'true');
  pickerQuery = '';
  $('worldSearch').value = '';
  pickerActiveIndex = 0;
  renderPickerOptions();
  $('worldSearch').focus();
}

function closePicker() {
  if (!pickerOpen) return;
  pickerOpen = false;
  $('worldPickerPopover').hidden = true;
  $('worldPickerBtn').setAttribute('aria-expanded', 'false');
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
 * Two renderers share the same primitives (nice gridlines, gap-aware line
 * splitting) but are deliberately different in what they show, per HIG's
 * own small-chart-vs-detail-chart distinction: the detail chart carries
 * gridlines, axis labels and hover-precision because it is the one place
 * being read closely; a mini card strips all of that "descriptive content"
 * and keeps only the line itself, high-contrast against nothing else, sized
 * to show shape rather than exact values - a button that expands into the
 * detail chart on activation, styled consistently with it.
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

/*
 * Real gaps must look like gaps, not be smoothed over by a straight line
 * from one side to the other. The "normal" cadence is inferred per series
 * from its own median spacing, since a dense run of daily screenshots and a
 * sparse run of monthly legacy points both need this line drawn honestly.
 * Fewer than three points give no cadence to infer, so nothing is split.
 */
function timeGapThreshold(pts) {
  if (pts.length < 3) return Infinity;
  const gaps = pts.slice(1).map((p, i) => p.t - pts[i].t).sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  return Math.max(median * 4, DAY * 3);
}

/*
 * How much of the domain's own width is actually spanned by connected data,
 * as opposed to the width between the first and last point. Four points -
 * two clustered right after the domain starts, two clustered right before
 * it ends, with days of nothing between them - span the full domain by
 * first-to-last measure alone, yet still read as two illegible slivers with
 * a wasteland in between; summing only the span WITHIN each gap-separated
 * run (and excluding the gaps themselves) catches that case, since a real
 * gap already has to be found to draw the line honestly in the first place.
 */
function coveredFraction(pts, domain) {
  if (pts.length < 2) return 0;
  const gapThreshold = timeGapThreshold(pts);
  const runs = [];
  let cur = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t - pts[i - 1].t > gapThreshold) { runs.push(cur); cur = []; }
    cur.push(pts[i]);
  }
  runs.push(cur);
  const covered = runs.reduce((sum, run) => sum + (run.at(-1).t - run[0].t), 0);
  return covered / ((domain[1] - domain[0]) || 1);
}

/** Points for one field, split into runs wherever the field is missing or a
    real time gap intervenes - each run is drawn as its own path segment. */
function fieldRuns(pts, key, gapThreshold) {
  const runs = [];
  let cur = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const brokeGap = i > 0 && (p.t - pts[i - 1].t) > gapThreshold;
    if (brokeGap && cur.length) { runs.push(cur); cur = []; }
    if (Number.isFinite(p[key])) cur.push(p);
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs;
}

/** The one focused world, drawn large: real gridlines and axis labels, a
    hover crosshair for exact values, point markers on screenshot rows. */
function renderDetailChart(container, { pts, domain, height, fields, ariaLabel, emptyMsg }) {
  const wrap = container.closest('.chart-wrap');
  const hasAny = fields.some(f => pts.some(p => Number.isFinite(p[f.key])));
  if (!pts.length || !hasAny) {
    container.innerHTML = `<p class="chart-empty">${esc(emptyMsg)}</p>`;
    const stale = wrap.querySelector('.chart-readout');
    if (stale) stale.hidden = true;
    return;
  }

  const colors = seriesColors();
  const W = 1040, H = height, padL = 56, padR = 16, padT = 14, padB = 24;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const values = fields.flatMap(f => pts.map(p => p[f.key])).filter(Number.isFinite);
  const ticks = niceTicks(Math.min(...values), Math.max(...values), 4);
  const yMin = ticks[0], yMax = ticks[ticks.length - 1];

  const x = t => padL + (t - domain[0]) / ((domain[1] - domain[0]) || 1) * innerW;
  const y = v => padT + (1 - (v - yMin) / ((yMax - yMin) || 1)) * innerH;
  const gapThreshold = timeGapThreshold(pts);

  const gridLines = ticks.map(v => {
    const yy = y(v);
    return `<line x1="${padL}" y1="${yy.toFixed(1)}" x2="${W - padR}" y2="${yy.toFixed(1)}" class="gridline"/>
      <text x="${padL - 8}" y="${(yy + 3).toFixed(1)}" class="axislabel" text-anchor="end" aria-hidden="true">${esc(fmt(Math.round(v)))}</text>`;
  }).join('');

  const xLabels = `
    <text x="${padL}" y="${H - 4}" class="axislabel" aria-hidden="true">${esc(shortDate(domain[0]))}</text>
    <text x="${W - padR}" y="${H - 4}" class="axislabel" text-anchor="end" aria-hidden="true">${esc(shortDate(domain[1]))}</text>`;

  const seriesFor = (f, color) => {
    const runs = fieldRuns(pts, f.key, gapThreshold);
    const d = runs.filter(r => r.length > 1)
      .map(run => run.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p[f.key]).toFixed(1)}`).join(' ')).join(' ');
    const soloDots = runs.filter(r => r.length === 1)
      .map(([p]) => `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p[f.key]).toFixed(1)}" r="2" fill="${color}"/>`).join('');
    const markers = pts.filter(p => p.source === 'screenshot' && Number.isFinite(p[f.key]))
      .map(p => `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p[f.key]).toFixed(1)}" r="2.4" fill="${color}">` +
        `<title>${esc(p.capturedAt)} · ${esc(f.label)} ${esc(fmt(p[f.key]))}</title></circle>`).join('');
    const path = d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.8"${f.dashed ? ' stroke-dasharray="5 3"' : ''} opacity=".95"/>` : '';
    return path + soloDots + markers;
  };
  const layers = fields.map((f, i) => seriesFor(f, i === 0 ? colors.a : colors.b)).join('');

  /*
   * A handful of real points inside a domain sized for the requested range
   * (say, seven days with just one or two screenshots in it) draw correctly
   * but read as broken - a near-empty plot with a barely-visible mark in one
   * corner. Naming what's actually there turns "is this a bug?" into "there
   * just isn't much data here yet", without changing the domain itself
   * (which would misrepresent the range that was asked for).
   */
  const sparse = pts.length <= 3 || coveredFraction(pts, domain) < 0.15;
  const note = sparse
    ? (pts.length <= 3
        ? `Only ${pts.length} observation${pts.length === 1 ? '' : 's'} in this range.`
        : `These observations are clustered in small parts of this range.`)
    : '';

  container.innerHTML = `<svg viewBox="0 0 ${W} ${H}" class="chart-svg" role="img" aria-label="${esc(ariaLabel)}">
    ${gridLines}${xLabels}${layers}
    <rect class="chart-hit" x="${padL.toFixed(1)}" y="${padT.toFixed(1)}" width="${innerW.toFixed(1)}" height="${innerH.toFixed(1)}"/>
    <line class="chart-cursor" x1="0" y1="${padT}" x2="0" y2="${(H - padB).toFixed(1)}" hidden/>
  </svg>${note ? `<p class="chart-note">${esc(note)}</p>` : ''}`;

  let readout = wrap.querySelector('.chart-readout');
  if (!readout) {
    readout = document.createElement('div');
    readout.className = 'chart-readout';
    wrap.appendChild(readout);
  }
  readout.hidden = true;

  const svg = container.querySelector('svg');
  const hit = svg.querySelector('.chart-hit');
  const cursor = svg.querySelector('.chart-cursor');
  const times = pts.map(p => p.t);

  function showAt(clientX) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const t = domain[0] + frac * (domain[1] - domain[0]);
    let nearest = null, best = Infinity, idx = -1;
    times.forEach((tt, i) => { const d = Math.abs(tt - t); if (d < best) { best = d; nearest = tt; idx = i; } });
    if (nearest === null) return;
    const p = pts[idx];
    const rows = fields.map((f, i) => Number.isFinite(p[f.key]) ? `
      <div class="rr"><span class="swatch" style="background:${i === 0 ? colors.a : colors.b}"></span>${esc(f.label)}<b>${esc(fmt(p[f.key]))}</b></div>` : '').join('');
    if (!rows.trim()) { readout.hidden = true; cursor.hidden = true; return; }

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

/** One other selected world, drawn tiny: no axes, no gridlines, no hover -
    just the line(s), a name, and the latest value(s) as plain text, so the
    shape and one concrete number are both readable without interacting.
    A button; activating it focuses that world in the detail chart above. */
function renderMiniCard(world, pts, domain, fields) {
  const colors = seriesColors();
  const W = 220, H = 56, pad = 3;
  const values = fields.flatMap(f => pts.map(p => p[f.key])).filter(Number.isFinite);
  let svgInner = '';
  if (values.length) {
    const ticks = niceTicks(Math.min(...values), Math.max(...values), 2);
    const yMin = ticks[0], yMax = ticks[ticks.length - 1];
    const x = t => pad + (t - domain[0]) / ((domain[1] - domain[0]) || 1) * (W - pad * 2);
    const y = v => pad + (1 - (v - yMin) / ((yMax - yMin) || 1)) * (H - pad * 2);
    const gapThreshold = timeGapThreshold(pts);
    svgInner = fields.map((f, i) => {
      const color = i === 0 ? colors.a : colors.b;
      const runs = fieldRuns(pts, f.key, gapThreshold);
      const d = runs.filter(r => r.length > 1)
        .map(run => run.map((p, j) => `${j === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p[f.key]).toFixed(1)}`).join(' ')).join(' ');
      const dots = runs.filter(r => r.length === 1)
        .map(([p]) => `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p[f.key]).toFixed(1)}" r="1.6" fill="${color}"/>`).join('');
      return (d ? `<path d="${d}" fill="none" stroke="${color}" stroke-width="2"${f.dashed ? ' stroke-dasharray="4 2.5"' : ''}/>` : '') + dots;
    }).join('');
  }

  const latest = pts.at(-1);
  const valuesLine = latest
    ? fields.map(f => Number.isFinite(latest[f.key]) ? fmt(latest[f.key]) : '—').join(' / ')
    : 'No data in this range';
  const ariaLabel = `${world}. ${latest
    ? fields.map(f => `${f.label} ${Number.isFinite(latest[f.key]) ? fmt(latest[f.key]) : 'not available'}`).join('. ')
    : 'no data in this range'}. Activate to see the full chart.`;

  return `
    <button type="button" class="mini-card" data-world="${esc(world)}" aria-label="${esc(ariaLabel)}">
      <span class="mini-name" aria-hidden="true">${esc(world)}</span>
      <svg viewBox="0 0 ${W} ${H}" class="mini-svg" aria-hidden="true">${svgInner}</svg>
      <span class="mini-values" aria-hidden="true">${esc(valuesLine)}</span>
    </button>`;
}

function pointsFor(world, domain) {
  return (seriesByWorld.get(world) ?? []).filter(p => p.t >= domain[0] && p.t <= domain[1]);
}

function renderMiniGrid(gridEl, headEl, domain, fields) {
  const others = selectedInOrder().filter(w => w !== focusedWorld);
  headEl.hidden = gridEl.hidden = others.length === 0;
  if (!others.length) { gridEl.innerHTML = ''; return; }
  gridEl.innerHTML = others.map(w => renderMiniCard(w, pointsFor(w, domain), domain, fields)).join('');
}

function renderPriceSection(domain) {
  const fields = [{ key: 'sell', label: 'Sell Price', dashed: false }, { key: 'buy', label: 'Buy Price', dashed: true }];
  $('priceFocusName').textContent = focusedWorld ? `· ${focusedWorld}` : '';
  if (!focusedWorld) {
    $('priceChart').innerHTML = '<p class="chart-empty">Select a world to see its price history.</p>';
    const stale = $('priceChart').closest('.chart-wrap').querySelector('.chart-readout');
    if (stale) stale.hidden = true;
  } else {
    renderDetailChart($('priceChart'), {
      pts: pointsFor(focusedWorld, domain), domain, height: 300, fields,
      ariaLabel: `Sell and Buy price over time for ${focusedWorld}`,
      emptyMsg: `No data for ${focusedWorld} in this range.`
    });
  }
  renderMiniGrid($('priceMiniGrid'), $('priceMiniHead'), domain, fields);
}

function renderAnalysisSection(domain) {
  const label = METRIC_LABEL[activeMetric];
  const fields = [{ key: activeMetric, label, dashed: false }];
  $('analysisFocusName').textContent = focusedWorld ? `· ${focusedWorld}` : '';
  if (!focusedWorld) {
    $('secondaryChart').innerHTML = `<p class="chart-empty">Select a world to see ${esc(label)}.</p>`;
    const stale = $('secondaryChart').closest('.chart-wrap').querySelector('.chart-readout');
    if (stale) stale.hidden = true;
  } else {
    renderDetailChart($('secondaryChart'), {
      pts: pointsFor(focusedWorld, domain), domain, height: 220, fields,
      ariaLabel: `${label} over time for ${focusedWorld}`,
      emptyMsg: `No ${label} data for ${focusedWorld} in this range.`
    });
  }
  renderMiniGrid($('analysisMiniGrid'), $('analysisMiniHead'), domain, fields);
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

  // A fixed, small set of columns - Sell Price, Buy Price, Spread - so this
  // table's shape never depends on which control is set in a different
  // section (the Analysis metric choice belongs to that chart alone; every
  // secondary metric's own trend and exact values are already reachable
  // there via its chart and hover readout).
  const cols = [
    { key: 'sell', label: 'Sell Price' }, { key: 'buy', label: 'Buy Price' },
    { key: 'spread', label: 'Spread' }
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
    `<th>World</th>${cols.map(c => `<th class="num">${esc(c.label)}</th>`).join('')}` +
    `<th title="How long ago this row's observation was captured">Updated</th>`;

  $('snapTable').querySelector('tbody').innerHTML = rows.map(r => {
    const rowCls = [r.stale ? 'stale' : '', r.world === focusedWorld ? 'focused' : ''].filter(Boolean).join(' ');
    return `<tr class="${rowCls}" ${r.stale ? 'title="latest observation is outside the selected range"' : ''}>
      <td class="world">
        <button type="button" class="world-focus-btn" data-focus-world="${esc(r.world)}" aria-pressed="${r.world === focusedWorld}">${esc(r.world)}</button>
      </td>
      ${cols.map(c => cellHtml(r, c)).join('')}
      <td class="hash" title="${esc(r.capturedAt)}">${esc(relativeAge(toMs(r.capturedAt)))}</td>
    </tr>`;
  }).join('');
}

/* --------------------------------------------------------------- compose */
function renderAll() {
  ensureFocus();
  const chartDomain = computeDomain();
  const listDomain = tableDomain();
  $('marketLoading').hidden = true;
  $('marketEmpty').hidden = allWorlds.length > 0;
  $('marketBody').hidden = allWorlds.length === 0;
  if (!allWorlds.length) return;
  renderPriceSection(chartDomain);
  renderSnapshot(listDomain);
  renderMetricTabs();
  renderAnalysisSection(chartDomain);
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
    renderWorldPicker();
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

  $('worldPickerBtn').addEventListener('click', () => (pickerOpen ? closePicker() : openPicker()));
  $('worldPickerClose').addEventListener('click', () => { closePicker(); $('worldPickerBtn').focus(); });
  $('worldOptions').addEventListener('click', e => {
    const li = e.target.closest('[data-world]');
    if (li) toggleWorld(li.dataset.world);
  });
  $('worldSearch').addEventListener('input', () => {
    pickerQuery = $('worldSearch').value;
    pickerActiveIndex = 0;
    renderPickerOptions();
  });
  $('worldSearch').addEventListener('keydown', e => {
    const list = filteredWorlds();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      pickerActiveIndex = Math.min(list.length - 1, pickerActiveIndex + 1);
      renderPickerOptions();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      pickerActiveIndex = Math.max(0, pickerActiveIndex - 1);
      renderPickerOptions();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const w = list[pickerActiveIndex];
      if (w) toggleWorld(w);
    }
  });
  $('worldPickerPopover').addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); closePicker(); $('worldPickerBtn').focus(); }
  });
  // a popover with more than one possible choice stays open across clicks -
  // it only ever closes from outside, Escape, or its own close button.
  // composedPath() (the propagation path captured at dispatch time) is used
  // rather than e.target.closest(): toggling a world re-renders the option
  // list synchronously, which detaches the clicked <li> before the event
  // finishes bubbling, and closest() on a detached node finds nothing.
  const pickerEl = $('worldPickerBtn').closest('.picker');
  document.addEventListener('click', e => {
    if (pickerOpen && !e.composedPath().includes(pickerEl)) closePicker();
  });

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

  // direct manipulation: a mini card or a world's own name in Latest
  // focuses that world, tying selection/comparison and visualisation into
  // one interaction instead of a separate control
  $('priceMiniGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-world]');
    if (b) focusWorld(b.dataset.world);
  });
  $('analysisMiniGrid').addEventListener('click', e => {
    const b = e.target.closest('[data-world]');
    if (b) focusWorld(b.dataset.world);
  });
  $('snapTable').addEventListener('click', e => {
    const b = e.target.closest('[data-focus-world]');
    if (b) focusWorld(b.dataset.focusWorld);
  });
}

/** Called on first load and every time the Market tab is shown, or the
    underlying data changed (a capture was saved, deleted, imported...). */
export async function refresh() {
  wireControls();
  await loadData();
  renderWorldPicker();
  renderAll();
  backfillLegacy();   // fire and forget - fills in as it lands, world by world
}
