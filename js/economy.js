/*
 * Economy: a world's gold generation potential as a terminal, read like Markets (markets.html). The chart and its
 * status take the page; the dock beside it holds every world, the creatures behind a month, the labelled
 * assumptions, the research findings and the method; the rail at the right edge opens them.
 *
 * Daily averages use complete periods; accumulated gold sums available daily values inside the selected range,
 * with cumulative day coverage (js/economy-data.js). Missing evidence is never filled. Kill coverage is beside every
 * figure; nothing is scaled up for unvalued kills, and no NPC liquidation rate is assumed unless one is chosen.
 *
 * Data (static files): data/economy/gold/ (index, the world's daily file and monthly creature contributions, monthly
 * sums of every world, creatures), data/market-history/tibia-coin/index.json (world facts, daily Sell Offers),
 * reports/economy/results.json (findings), data/economy/ (sync and access status). The address keeps the view.
 */
import { fmt, esc, num } from './format.js';
import { dock } from './markets-dock.js';
import { MEASURES, INTERVALS, ratePeriods, accumulatedPeriods, rangeChange, rangeStartOf, overviewRows, periodOf, contributions, lastDay, sellOfferPeriods,
  LIQUIDATION_SCENARIOS } from './economy-data.js?v=20261014-global-price';
import { economyChart, colors } from './economy-chart.js?v=20261014-tv';
import { connect, changed } from './tv-bridge.js';

const $ = id => document.getElementById(id);
const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'All'];
const ROOMY = '(min-width: 1280px)';
const REPO = 'https://github.com/nesleykent/Tibinance';   // notes and methodology are read there, rendered
const KEY = { gross: 'var(--eco-gross, var(--ink))', coins: 'var(--eco-coins, var(--sell))', npc: 'var(--eco-npc, var(--buy))' };
const percent = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const signedNumber = new Intl.NumberFormat('en-US', { signDisplay: 'exceptZero', maximumFractionDigits: 0 });
const tone = v => (v > 0 ? 'up' : v < 0 ? 'down' : '');
const gold = v => (Number.isFinite(v) ? fmt(Math.round(v)) : 'N/A');
const pct1 = v => (Number.isFinite(v) ? `${(100 * v).toFixed(1)}%` : 'N/A');
const signedRatio = r => (r == null ? num(null) : `<span class="${tone(r)}">${percent.format(r)}</span>`);
const signedDelta = d => (d == null ? num(null) : `<span class="${tone(d)}">${signedNumber.format(Math.round(d))}</span>`);
const key = (cls, color) => `<i class="key ${cls}" style="--side:${color}"></i>`;

const params = new URLSearchParams(location.search);
const state = {
  world: params.get('world') || 'Antica',
  measure: Object.hasOwn(MEASURES, params.get('measure')) ? params.get('measure') : 'gross',
  measures: params.has('series') ? [...new Set(params.get('series').split(',').filter(k => Object.hasOwn(MEASURES, k)))]
    : [Object.hasOwn(MEASURES, params.get('measure')) ? params.get('measure') : 'gross'],
  mode: params.get('mode') === 'accumulated' ? 'accumulated' : 'daily',
  kills: params.get('kills') !== '0',
  interval: INTERVALS.includes(params.get('interval')) ? params.get('interval') : 'week',
  range: RANGES.includes(params.get('range')) ? params.get('range') : 'All',
  price: params.get('price') !== '0',
  rate: params.has('rate') && LIQUIDATION_SCENARIOS.includes(Number(params.get('rate'))) ? Number(params.get('rate')) : null,
  stable: params.get('stable') === '1',
  sort: { key: 'world', dir: 1 }, filter: '', month: null,
};
// Old links retain their single measure; new links retain independent visibility, including all gold hidden.
if (state.measures.length && !state.measures.includes(state.measure)) state.measure = state.measures[0];
const data = { index: null, overview: null, market: null, results: null, sync: null, access: null, creatures: {}, vip: null };
const files = new Map();   // world dir -> promise of {daily, contrib}
let view = null, request = 0, retryWorld = null, pendingWorld = null, wired = false;
let requests = new AbortController();

const chart = economyChart($('chart'), { onCrosshair: day => showLegend(day) });
$('exportButton').disabled = !chart;
const field = () => MEASURES[state.measure].field;
const cancelRequests = () => { request++; requests.abort(); };
addEventListener('pagehide', cancelRequests);
addEventListener('pageshow', e => {
  if (!e.persisted) return;
  requests = new AbortController(); files.clear(); retryWorld = null; pendingWorld = null;
  if (view) { $('economy').setAttribute('aria-busy', 'false'); draw(); }
  else main().catch(failed);
});

/* ------------------------------------------------------------------ loading */
const json = async path => { const r = await fetch(path, { signal: requests.signal }); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); };
const optional = path => json(path).catch(() => null);
function worldFiles(w) {
  if (!files.has(w.dir)) files.set(w.dir, Promise.all([json(`data/economy/gold/worlds/${w.dir}.json`), w.dir === 'all' ? Promise.resolve({ months: [] }) : json(`data/economy/gold/contributions/${w.dir}.json`)])
    .then(([daily, contrib]) => ({ daily, contrib })).catch(e => { files.delete(w.dir); throw e; }));
  return files.get(w.dir);
}
const summaryOf = world => (world === 'All' ? data.overview.worlds.find(w => w.world === 'All') : data.index.worlds.find(w => w.world === world));
const marketOf = world => data.market?.worlds.find(w => w.world === world) ?? null;
const latestDay = () => data.index.worlds.map(w => w.last).sort().at(-1);

/* -------------------------------------------------------------- the world's view */
// The periods at the interval with their rates, the latest complete one, and each period's median Sell Offer.
function buildView(summary, daily, contrib) {
  const periods = ratePeriods(daily, state.interval);
  const sources = summary.world === 'All' ? data.market?.worlds ?? [] : [marketOf(summary.world)].filter(Boolean);
  const price = sellOfferPeriods(sources, state.interval);
  return { summary, daily, contrib, periods, last: periods.findLast(p => p.rate.grossPotential !== null) ?? null,
    byStart: new Map(periods.map(p => [p.start, p])), price, lastPrice: periods.findLast(p => price.has(p.start)) ?? null,
    end: lastDay(daily), ended: summary.last < latestDay() };
}

async function select(world, { focus = false } = {}) {
  const summary = summaryOf(world) ?? summaryOf('Antica');
  const mine = ++request;
  pendingWorld = summary.world; retryWorld = null;
  const retryFocused = document.activeElement === $('retry');
  drawWatchlist();
  if (focus) document.querySelector(`#worlds tr[data-world="${CSS.escape(summary.world)}"] .pick`)?.focus();
  feedback(`Loading ${summary.world}.${view ? ` Still showing ${state.world}.` : ''}`);
  $('economy').setAttribute('aria-busy', 'true');
  let daily, contrib;
  try { ({ daily, contrib } = await worldFiles(summary)); }
  catch (error) {
    if (mine !== request) return false;
    pendingWorld = null;
    retryWorld = summary.world;
    failed(error);
    if (retryFocused && retryFocusVacant()) $('retry').focus();
    return false;
  }
  if (mine !== request) return false;   // a later choice won while this one loaded
  state.world = summary.world;
  pendingWorld = null;
  view = buildView(summary, daily, contrib);
  retryWorld = null;
  state.month = null;
  draw();
  $('economy').setAttribute('aria-busy', 'false');
  if (retryFocused && retryFocusVacant()) document.querySelector(`#worlds tr[data-world="${CSS.escape(state.world)}"] .pick`)?.focus();
  return true;
}

// Everything that follows the world, measure, interval, range or a comparison.
function draw({ preserveRange = false } = {}) {
  if (!view) return;
  const visibleRange = preserveRange ? chart?.chart.timeScale().getVisibleLogicalRange() : null;
  if (!pendingWorld && !retryWorld) {
    $('loadFeedback').hidden = Boolean(view.last); $('retry').hidden = true;
    if (!view.last) $('status').textContent = `No complete ${state.interval} of data for ${state.world}.`;
  }
  const end = view.last?.end ?? view.end;
  const from = rangeStartOf(end, state.range) ?? view.daily.first;
  view.accumulated = new Map(accumulatedPeriods(view.daily, view.periods, [from, end]).map(p => [p.start, p]));
  view.values = state.mode === 'accumulated' ? view.accumulated : new Map(view.periods.map(p => [p.start, p.rate]));
  chart?.draw({ periods: view.periods, measure: state.measure, measures: state.measures, mode: state.mode, values: view.values,
    kills: state.kills, rate: state.rate, stable: state.stable, price: state.price && view.lastPrice ? view.price : null });
  for (const b of $('measure').querySelectorAll('[data-measure]')) b.setAttribute('aria-pressed', String(state.measures.includes(b.dataset.measure)));
  $('killsToggle').setAttribute('aria-pressed', String(state.kills));
  setChoice('valueMode', 'mode', state.mode);
  $('chartPanel').dataset.measure = state.measure;
  setChoice('range', 'range', state.range);
  setChoice('interval', 'interval', state.interval);
  $('priceToggle').setAttribute('aria-pressed', String(state.price && Boolean(view.lastPrice)));
  $('priceToggle').title = view.lastPrice
    ? `${state.price ? 'Hide' : 'Show'} the Tibia Coin Sell Offer price; ${state.world === 'All' ? 'daily median across observed worlds, then median of days in each period; ' : ''}gold per TC on the left scale. Latest observed ${periodLabel(view.lastPrice)}.`
    : 'No Tibia Coin price observations for this world’s recorded history.';
  $('priceToggle').disabled = !view.lastPrice;
  showQuote();
  showLegend(null);
  showDetails();
  drawWatchlist();
  drawCreatures();
  drawChartData();
  describeChart();
  if (visibleRange) chart.chart.timeScale().setVisibleLogicalRange(visibleRange);
  else applyRange();
  saveUrl();
  requestAnimationFrame(fitHead);
  changed();
}

function applyRange(attempt = 0) {
  if (!chart || !view?.periods.length) return;
  // The chart measures its container asynchronously; a range set at zero width is lost.
  if (chart.chart.timeScale().width() === 0 && attempt < 30) { requestAnimationFrame(() => applyRange(attempt + 1)); return; }
  const first = view.periods[0].start, lastStart = view.periods.at(-1).start;
  const start = view.last ? rangeStartOf(view.last.end, state.range) : null;
  chart.show(!start || start < first ? first : periodOf(start, state.interval)[0], lastStart);
}
const fitHead = () => chart?.fitTop($('chartHead'));
new ResizeObserver(() => requestAnimationFrame(fitHead)).observe($('chart'));

/* ------------------------------------------------------------------ status */
const UNIT = { day: 'day', week: 'week', month: 'month' };
function periodLabel(p, interval = state.interval) {
  if (interval === 'day') return p.start;
  if (interval === 'week') return `Week ${p.start} to ${p.end.slice(5)}`;
  const d = new Date(`${p.start}T00:00:00Z`);
  return `${d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' })} ${d.getUTCFullYear()}`;
}
function metaOf(world) {
  if (world === 'All') return `<span>All worlds</span><span>${fmt(view.summary.latestWorldCount)} worlds on ${esc(view.end)}</span>`;
  const m = marketOf(world);
  return [m?.type && `<span>${esc(m.type)}</span>`, m?.battleye && `<span>BattlEye <span class="be-${esc(m.battleye)}">${esc(m.battleye)}</span></span>`,
    m?.location && `<span>${esc(m.location)}</span>`, view?.ended && `<span class="tag">Ended ${esc(view.summary.last)}</span>`].filter(Boolean).join('');
}

function showQuote() {
  const p = view.last, change = rangeChange(view.periods, field(), state.range);
  $('world').textContent = state.world;
  $('worldMeta').innerHTML = metaOf(state.world);
  $('lastValue').textContent = state.measures.length && p ? gold(view.values.get(p.start)[field()]) : '';
  $('lastMeasure').textContent = state.measures.length ? MEASURES[state.measure].short : '';
  $('lastChange').innerHTML = state.measures.length && state.mode === 'daily' && change ? `<span class="eco-delta">${signedDelta(change.delta)}</span> ${signedRatio(change.ratio)}` : '';
  $('lastRange').textContent = state.range;
  $('measureGross').textContent = p ? gold(view.values.get(p.start).grossPotential) : '';
  $('measureCoins').textContent = p ? gold(view.values.get(p.start).directCoins) : '';
  $('measureNpc').textContent = p ? gold(view.values.get(p.start).npcPotential) : '';
  $('measurePrice').textContent = view.lastPrice ? gold(view.price.get(view.lastPrice.start).sell) : 'N/A';
  const a = p && view.accumulated.get(p.start);
  $('through').textContent = state.mode === 'accumulated'
    ? `Accumulated gold (log scale), ${a?.from ?? ''} to ${p?.end ?? view.end}. ${a ? `${a.covered}/${a.days} days with data${a.complete ? '' : ' (partial subtotal)'}. ` : ''}Kills per day.`
    : `Gold per day by ${UNIT[state.interval]}. History ${view.daily.first} to ${view.end}${p?.worldDays !== undefined ? `. ${p.worldDaysCovered}/${p.worldDays} world-days with data` : ''}`;
}

/*
 * The readout follows the visible series and value mode. Daily averages compare complete periods;
 * accumulated values state their range start and cumulative day coverage, including partial subtotals.
 */
function showLegend(day) {
  if (!view) return;
  const p = day ? view.byStart.get(day) : view.last;
  if (!p) { $('legend').innerHTML = ''; return; }
  const values = view.values.get(p.start), accumulated = state.mode === 'accumulated';
  const head = `<span class="day">${esc(periodLabel(p))}${accumulated ? ' / accumulated gold (log)' : ' / gold per day'}</span>`;
  const rows = [];
  if (values.grossPotential === null) {
    rows.push(`<span class="note">${accumulated ? 'No available gold in this interval within the selected range' : `${p.covered} of ${p.days} days with data${p.end > view.end ? ', unfinished' : ''}`}: gold not drawn</span>`);
  }
  const extra = (label, value, rest = '', selected = false) => {
    const cls = selected ? 'eco-selected' : 'eco-extra';
    return `<span class="label ${cls}">${label}</span> <b class="value ${cls}">${value}</b> <span class="rest ${cls}">${rest}</span>`;
  };
  for (const [k, m] of Object.entries(MEASURES)) {
    if (!state.measures.includes(k) || values[m.field] === null) continue;
    const prev = !accumulated && view.periods.slice(0, view.periods.indexOf(p)).findLast(q => q.rate[m.field] !== null);
    const delta = prev ? values[m.field] - prev.rate[m.field] : null;
    const change = prev ? `<span class="eco-delta">${signedDelta(delta)}</span> ${signedRatio(prev.rate[m.field] ? delta / prev.rate[m.field] : null)} <span class="meta">since ${esc(periodLabel(prev))}</span>` : '';
    rows.push(extra(`${key('key-dot', KEY[k])}${m.name}`, gold(values[m.field]), change, true));
  }
  if (accumulated && values.grossPotential !== null) {
    const a = view.accumulated.get(p.start);
    rows.push(`<span class="note eco-selected">From ${esc(a.from)}: ${a.covered}/${a.days} days with data${a.complete ? '' : ' / partial subtotal'}</span>`);
  }
  if (state.kills) rows.push(extra(`${key('key-volume', KEY[state.measure])}Kills/day`, gold(p.rate.kills), `<span class="meta">${pct1(p.killCoverage)} valued</span>`, true));
  if (state.stable && values.grossPotential !== null) rows.push(extra(`${key('eco-key-dashed', 'var(--accent)')}Constant set`, gold(values.grossStable), '<span class="meta">comparison</span>', true));
  if (state.rate !== null && values.grossPotential !== null) rows.push(extra(`${key('eco-key-dashed', 'var(--caution)')}Gold + ${state.rate * 100}% NPC`, gold(values.directCoins + state.rate * values.npcPotential), '<span class="meta">assumption</span>', true));
  if (state.price && view.lastPrice) {
    const pricedPeriod = !day && !view.price.has(p.start) ? view.lastPrice : p;
    const q = pricedPeriod && view.price.get(pricedPeriod.start);
    const basis = state.world === 'All' ? `median of ${fmt(q?.n ?? 0)} daily world medians; ${fmt(q?.worlds ?? 0)} worlds, ${fmt(q?.worldDays ?? 0)} world-days` : `median of ${fmt(q?.n ?? 0)} day${q?.n === 1 ? '' : 's'}`;
    rows.push(extra(`${key('key-average', 'var(--average)')}TC Sell Offer${state.world === 'All' ? ' (world median)' : ''}`, q ? gold(q.sell) : 'N/A', `<span class="meta">${q ? `${basis}${pricedPeriod !== p ? `, last observed ${esc(periodLabel(pricedPeriod))}` : ''}` : 'not observed'}</span>`, true));
  }
  $('legend').innerHTML = `${head} ${rows.join(' ')}`;
  if (!day) fitHead();
}

function describeChart() {
  const p = view.last, m = MEASURES[state.measure];
  const names = state.measures.map(k => MEASURES[k].name.toLowerCase()).join(', ') || 'gold series hidden';
  const a = p && view.accumulated.get(p.start);
  $('chart').setAttribute('aria-label', `${chart ? '' : 'Interactive chart unavailable. '}${state.world}, ${names} from valued creatures in ${state.mode === 'daily' ? 'gold per day' : 'accumulated gold'}, by ${UNIT[state.interval]}, range ${state.range}. `
    + (p ? `Latest complete ${UNIT[state.interval]}: ${periodLabel(p)}, ${m.name}: ${gold(view.values.get(p.start)[field()])} ${state.mode === 'daily' ? 'gold per day' : 'gold accumulated'}, kill coverage ${pct1(p.killCoverage)}.` : 'No complete period.')
    + (state.mode === 'accumulated' && a ? ` Logarithmic gold scale. Since ${a.from}: ${a.covered} of ${a.days} days with data${a.complete ? '' : ', partial subtotal'}.` : '')
    + (state.kills ? ' Kills per day in the lower pane.' : '')
    + (state.price && view.lastPrice ? ` With the ${state.world === 'All' ? 'median of daily world-median TC Sell Offers' : 'median TC Sell Offer'} per period on the left scale.` : '')
    + (state.rate !== null ? ` With gold plus ${state.rate * 100}% of NPC potential, an assumption.` : '')
    + (state.stable ? ' With the constant creature set for comparison.' : '')
    + ' Full period values and coverage are available in Help.');
}

function drawChartData() {
  const unit = state.mode === 'daily' ? 'gold/day' : 'accumulated gold';
  const extras = [
    ...(state.stable ? [{ title: `Constant set (${unit})`, value: p => view.values.get(p.start).grossStable }] : []),
    ...(state.rate !== null ? [{ title: `Gold + ${state.rate * 100}% NPC (assumption, ${unit})`, value: p => { const v = view.values.get(p.start); return v.directCoins === null ? null : v.directCoins + state.rate * v.npcPotential; } }] : []),
  ];
  $('chartData').innerHTML = `<caption class="sr-only">${unit} at the selected interval, from valued creatures. Accumulated subtotals exclude missing days.</caption><thead><tr><th>Period</th><th class="num">Gross (${unit})</th><th class="num">Gold (${unit})</th><th class="num">NPC (${unit})</th>`
    + extras.map(e => `<th class="num">${esc(e.title)}</th>`).join('')
    + '<th class="num">Kills/day</th><th>Days with data</th><th class="num">Kill coverage</th>'
    + (view.daily.worldsExpected ? '<th>World-days with data</th>' : '')
    + (state.mode === 'accumulated' ? '<th>Accumulated days with data</th>' : '')
    + (state.price && view.lastPrice ? '<th class="num">TC Sell (gold/coin)</th><th class="num">Price days</th>' + (state.world === 'All' ? '<th class="num">Worlds priced</th><th class="num">Price world-days</th>' : '') : '') + '</tr></thead><tbody>'
    + [...view.periods].reverse().map(p => `<tr${p === view.last ? ' class="current"' : ''}><td>${esc(periodLabel(p))}</td>`
      + [view.values.get(p.start).grossPotential, view.values.get(p.start).directCoins, view.values.get(p.start).npcPotential, ...extras.map(e => e.value(p)), p.rate.kills].map(v => `<td class="num">${gold(v)}</td>`).join('')
      + `<td>${p.covered} / ${p.days}${p.complete ? '' : ' incomplete'}</td><td class="num">${pct1(p.killCoverage)}</td>`
      + (view.daily.worldsExpected ? `<td>${p.worldDaysCovered} / ${p.worldDays}</td>` : '')
      + (state.mode === 'accumulated' ? `<td>${view.values.get(p.start).grossPotential === null ? 'N/A' : `${view.values.get(p.start).covered} / ${view.values.get(p.start).days}${view.values.get(p.start).complete ? '' : ' partial subtotal'}`}</td>` : '')
      + (state.price && view.lastPrice ? `<td class="num">${gold(view.price.get(p.start)?.sell)}</td><td class="num">${view.price.get(p.start)?.n ?? 0}</td>${state.world === 'All' ? `<td class="num">${view.price.get(p.start)?.worlds ?? 0}</td><td class="num">${view.price.get(p.start)?.worldDays ?? 0}</td>` : ''}` : '') + '</tr>').join('') + '</tbody>';
}

/* --------------------------------------------------------------- watchlist */
// Every active world (and a retired one a search names), in gold per day of the measure shown over its latest complete
// period at the interval, with its change over the range.
function watchList() {
  const list = overviewRows(data.overview, state.interval, state.measure, state.range, state.filter);
  const { key: k, dir } = state.sort;
  return list.sort((a, b) => a.dir === 'all' ? -1 : b.dir === 'all' ? 1 : (k === 'world' ? a.world.localeCompare(b.world) * dir
    : a[k] === null ? (b[k] === null ? a.world.localeCompare(b.world) : 1) : b[k] === null ? -1 : (a[k] - b[k]) * dir));
}

function drawWatchlist() {
  if (!data.index) return;
  const active = document.activeElement;
  const focusedWorld = active.closest('#worlds tr[data-world]')?.dataset.world;
  const list = watchList();
  $('worldCount').textContent = fmt(list.filter(r => r.dir !== 'all').length);
  $('noWorlds').hidden = list.length > 0;
  for (const th of document.querySelectorAll('table.watch thead th')) {
    const k = th.querySelector('button').dataset.sort;
    th.setAttribute('aria-sort', state.sort.key === k ? (state.sort.dir > 0 ? 'ascending' : 'descending') : 'none');
  }
  $('worlds').innerHTML = list.map(r => {
    const flags = [r.ended && `<span class="flag flag-retired" tabindex="0" data-tip="Retired or merged: data ended ${esc(r.ended)}. Its figures are its last complete ${UNIT[state.interval]}${r.last ? `, ${esc(r.last[0])} to ${esc(r.last[1])}` : ''}.">R</span>`,
      r.coverage !== null && r.coverage < 0.95 && `<span class="flag" tabindex="0" data-tip="Kill coverage ${pct1(r.coverage)}: under 95% of its kills are valued, so this figure understates the world more than most.">i</span>`,
      !r.last && `<span class="flag" tabindex="0" data-tip="No complete ${UNIT[state.interval]} of data.">i</span>`].filter(Boolean).join('');
    return `<tr data-world="${esc(r.world)}" aria-selected="${r.world === state.world}"><th scope="row"><button type="button" class="pick">${esc(r.world)}</button>${flags}</th>`
      + `<td${r.ended ? ' class="stale"' : ''}>${gold(r.value)}</td><td>${signedRatio(r.change)}</td></tr>`;
  }).join('');
  if (focusedWorld && !active.isConnected) document.querySelector(`#worlds tr[data-world="${CSS.escape(focusedWorld)}"] .pick`)?.focus({ preventScroll: true });
}

/* ----------------------------------------------------------------- details */
function showDetails() {
  const active = document.activeElement;
  const focusedRange = active.closest('#detailPerformance button')?.dataset.range;
  const p = view.last, s = view.summary, change = rangeChange(view.periods, field(), state.range);
  $('detailsWorld').textContent = state.world;
  $('detailMeta').innerHTML = metaOf(state.world);
  $('detailLast').textContent = p ? gold(p.rate[field()]) : 'N/A';
  $('detailLastLabel').textContent = `${MEASURES[state.measure].name} per day`;
  $('detailChange').innerHTML = change ? `${signedDelta(change.delta)} ${signedRatio(change.ratio)}` : '';
  $('detailChangeLabel').textContent = change ? `Change ${state.range}` : `Change ${state.range}: not enough complete periods`;
  const online = data.vip?.observations.find(o => o.world === state.world && o.metric === 'characters-online');
  $('detailNote').innerHTML = (state.world === 'All' ? `Sum of ${fmt(s.worldCount)} world histories, each during its recorded dates. Retired worlds are included until their last record.<br>${p ? `${fmt(p.worldDaysCovered)}/${fmt(p.worldDays)} world-days with data in this period.<br>` : ''}` : '') + (p ? `Latest complete ${UNIT[state.interval]} <span>${esc(periodLabel(p))}</span>${change ? `, against <span>${esc(periodLabel(change.from))}</span>` : ''}<br>` : '')
    + `Kill days <span>${esc(s.first)}</span> to <span>${esc(s.last)}</span>: ${fmt(s.observed)} observed, ${fmt(s.recovered)} recovered exactly, ${fmt(s.missing)} missing`
    + (online ? `<br>TibiaVIP, ${esc(data.vip.observedAt.slice(0, 10))}: <span>${fmt(online.value)}</span> characters online at one instant` : '');
  $('detailCoins').textContent = p ? gold(p.rate.directCoins) : 'N/A';
  $('detailNpc').textContent = p ? gold(p.rate.npcPotential) : 'N/A';
  $('detailCoverage').textContent = p ? pct1(p.killCoverage) : 'N/A';
  $('detailPerformance').innerHTML = RANGES.map(r => {
    const c = rangeChange(view.periods, field(), r);
    return `<button type="button" data-range="${r}" aria-pressed="${r === state.range}"><span class="perf-value ${c ? tone(c.ratio) : ''}">${c ? percent.format(c.ratio) : 'N/A'}</span><span class="perf-range">${r}</span></button>`;
  }).join('');
  if (focusedRange && !active.isConnected) $('detailPerformance').querySelector(`[data-range="${focusedRange}"]`)?.focus({ preventScroll: true });
}

/* --------------------------------------------------------------- creatures */
// A month's creatures (contributions are kept by month): its top 30 by gross potential, the rest summed as other. The
// latest complete month until another is chosen.
function drawCreatures() {
  const months = view.contrib.months.map(m => m.month).sort().reverse();
  if (!months.length) { $('creatureMonth').innerHTML = ''; $('creatureList').innerHTML = ''; $('creatureNote').textContent = state.world === 'All' ? 'Choose an individual world for its creature breakdown. Monthly world top-30 lists cannot establish a complete global creature ranking.' : 'No creature contributions for this world.'; return; }
  const complete = months.filter(m => periodOf(`${m}-01`, 'month')[1] <= view.end);
  const month = state.month && months.includes(state.month) ? state.month : (complete[0] ?? months[0]);
  $('creatureMonth').innerHTML = months.map(m => `<option value="${m}"${m === month ? ' selected' : ''}>${m}${complete.includes(m) ? '' : ' (unfinished)'}</option>`).join('');
  const c = contributions(view.contrib, periodOf(`${month}-01`, 'month'));
  const total = c.total.grossPotential, name = page => data.creatures[page]?.creature ?? `#${page}`;
  $('creatureNote').textContent = `${month}: ${gold(total)} gold of gross potential from ${gold(c.total.kills)} valued kills. Each month keeps its top 30 creatures; the rest are summed as other.`;
  $('creatureList').innerHTML = c.rows.map(r => `<li><span class="eco-list-name">${esc(name(r.page))}</span><span class="eco-list-value">${gold(r.grossPotential)}</span>`
    + `<span class="eco-list-sub">${fmt(r.kills)} kills, ${gold(r.coinsPerKill)} gold and ${gold(r.npcPerKill)} NPC value per kill</span><span class="eco-list-share">${pct1(r.share)}</span></li>`).join('')
    + `<li class="eco-list-other"><span class="eco-list-name">Other creatures</span><span class="eco-list-value">${gold(c.other.directCoins + c.other.npcPotential)}</span>`
    + `<span class="eco-list-sub">${fmt(c.other.kills)} kills</span><span class="eco-list-share">${pct1(total ? (c.other.directCoins + c.other.npcPotential) / total : null)}</span></li>`;
}

/* -------------------------------------------------------- findings, method */
function renderFindings() {
  const R = data.results;
  if (!R) { $('findings').innerHTML = '<p>The research results are not available.</p>'; return; }
  const lv = R.levels, ch = R.changes;
  const r2 = k => (lv[k] ? lv[k].pooled.r2.toFixed(2) : 'N/A');
  const fc = R.forecasting?.byHorizon;
  const GOLD_MODELS = ['A', 'B', 'C', 'D', 'E'];
  const horizons = fc ? Object.entries(fc).map(([h, x]) => {
    const [best, b] = GOLD_MODELS.filter(m => x.models[m]).map(m => [m, x.models[m]]).sort((a, c) => a[1].maeLogPct - c[1].maeLogPct)[0];
    return { h, constant: x.models.constant.maeLogPct, best, mae: b.maeLogPct, beats: b.maeLogPct < x.models.constant.maeLogPct };
  }) : [];
  const quarters = (R.divergenceByQuarter?.quarters ?? []).filter(q => q.quarter >= '2025Q3' && q.worlds >= 10);
  const split = quarters.filter(q => q.goldUpPriceDown > q.worlds / 2), q = x => x.quarter.replace('Q', ' Q');
  $('findings').innerHTML = `
    <p><strong>Levels.</strong> Across ${fmt(R.meta.worlds)} worlds and ${fmt(R.meta.analysedWeeks)} world-weeks, log gross potential gives an R² of ${r2('ask.C')} against the log Sell Offer and ${r2('bid.C')} against the log Buy Offer, mostly between worlds: worlds with more gold potential tend to have higher prices. Within a world over time, R² ${lv['ask.C'].withinWorld.r2Within.toFixed(2)}. Most of these series are not stationary.</p>
    <p><strong>Week to week.</strong> Changes in gold potential explain little of price changes (within R² at most ${Math.max(...Object.values(ch).map(x => x.r2Within)).toFixed(2)}).</p>
    ${quarters.length ? `<p><strong>Gold up, prices down.</strong> Quarter on quarter: ${quarters.map(x => `${fmt(x.goldUpPriceDown)} of ${fmt(x.worlds)} worlds in ${q(x)}`).join(', ')}.${split.length ? ` Most worlds split only in ${split.map(q).join(' and ')}, also with the constant creature set.` : ''}</p>` : ''}
    <p><strong>Forecasting.</strong> ${horizons.length ? `${horizons.map(x => `${x.h} week${x.h === '1' ? '' : 's'}: no change ${x.constant.toFixed(2)}%, best gold model (${x.best}) ${x.mae.toFixed(2)}%`).join('; ')} (mean absolute error of the log price). ${horizons.some(x => x.beats) ? 'A gold model beats no change at some horizon.' : 'No gold model beats the no-change forecast, so none is used in the Projections.'}` : 'Out-of-sample results are pending.'}</p>
    <p class="help-fine">Associations, not causes. <a href="${REPO}/tree/main/reports/economy">Research notes</a> and <a href="${REPO}/blob/main/docs/economy.md">methodology</a>. An earlier estimate of about 45% is a reference, never a target.</p>`;
}

function renderProvenance() {
  const I = data.index, sync = data.sync?.sources ?? {};
  const access = id => data.access?.sources?.[id] ? `${data.access.sources[id].status} since ${data.access.sources[id].since.slice(0, 10)}` : 'unknown';
  $('provenance').innerHTML = `
    <p><strong>Measured.</strong> For every creature kill in tibia.com's kill statistics, the gold and the NPC value of the loot TibiaWiki's loot statistics expect from that creature, from the sample made after the game version of that day. Kills of creatures without an applicable sample count in kill coverage and are never valued or scaled up.</p>
    <p><strong>Not measured.</strong> Gold leaving the game, money supply, inflation, GDP, or what players actually sold. World transfers are not modelled. Undated game versions use lower date bounds; merger lineage and coverage-change markers are incomplete.</p>
    <p><strong>Sources.</strong> Kill statistics read at ${I.killstats.map(k => `<a href="https://github.com/${esc(k.repo)}/tree/${esc(k.commit)}">${esc(k.repo.split('/')[1])}</a> ${esc(k.commit.slice(0, 7))}`).join(' and ')}, not republished. ${fmt(I.evidence.lootRecords)} TibiaWiki loot sample records (CC-BY-SA), latest revision ${esc(I.evidence.latestLootRevision.slice(0, 10))}; NPC prices of ${esc(I.evidence.prices?.revTimestamp?.slice(0, 10) ?? 'unknown')}; ${fmt(I.evidence.creatureMap.matched)} of ${fmt(I.evidence.creatureMap.races)} races matched. ${esc(I.mode.kind)} reconstruction, methodology ${esc(String(I.methodology.version))}, ${esc(I.methodology.rule)} sample rule.</p>
    <p><strong>Population.</strong> GuildStats ${esc(access('guildstats'))}, TibiaVIP ${esc(access('tibiavip'))}: their histories remain an open requirement, so gold per active character is not shown. TibiaMarket last updated ${esc(sync.tibiamarket?.sourceLatestUpdate?.slice(0, 10) ?? 'unknown')}.</p>
    <p><a href="${REPO}/blob/main/data/economy/README.md">Data files and licenses</a>.</p>`;
}

/* ------------------------------------------------------------------- export */
// An image of what the chart shows, with the world, measure, interval and range, and the method in a line.
async function exportImage() {
  if (!view?.last) return;
  const shot = chart.chart.takeScreenshot(), c = colors(), pad = 24, ratio = shot.width / $('chart').clientWidth;
  const canvas = document.createElement('canvas');
  canvas.width = shot.width + pad * 2 * ratio; canvas.height = shot.height + 110 * ratio;
  const ctx = canvas.getContext('2d'), font = getComputedStyle(document.documentElement).getPropertyValue('--font-ui');
  ctx.fillStyle = getComputedStyle(document.body).backgroundColor; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(ratio, ratio);
  ctx.fillStyle = c.ink; ctx.font = `600 18px ${font}`;
  ctx.fillText(`${state.world}: ${state.measures.map(k => MEASURES[k].short).join(', ') || 'gold hidden'}, ${state.mode === 'daily' ? 'gold per day' : 'accumulated gold (log scale)'} (${state.range})`, pad, 32);
  ctx.fillStyle = c.text; ctx.font = `400 12px ${font}`;
  const a = view.accumulated.get(view.last.start);
  ctx.fillText(`From valued creatures, by ${UNIT[state.interval]}; ${state.mode === 'accumulated' ? `since ${a.from}, ${a.covered}/${a.days} days${a.complete ? '' : ', partial subtotal'}` : `kill coverage ${pct1(view.last.killCoverage)}`}. Not money supply${state.rate !== null ? `; dashed: gold + ${state.rate * 100}% NPC, assumption` : ''}.`, pad, 52);
  ctx.drawImage(shot, pad, 64, shot.width / ratio, shot.height / ratio);
  ctx.fillText(`Tibinance / Economy. Kill statistics through ${view.end}; TibiaWiki loot statistics, CC-BY-SA.`, pad, 64 + shot.height / ratio + 28);
  const name = `tibinance-economy-${state.world.toLowerCase()}-${state.measures.map(k => MEASURES[k].short.toLowerCase()).join('-') || 'hidden'}-${state.mode}-${state.interval}-${state.range.toLowerCase()}-${view.end}.png`;
  const blob = await new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The image could not be encoded.'))), 'image/png'));
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10000);
  $('exportStatus').textContent = `Saved ${name}.`;
}

/* -------------------------------------------------------------- full screen */
// The whole terminal, rail included; the CSS fallback where element full screen is unavailable (iPhone) or refused.
const terminal = $('economy');
function showExpanded(on) {
  $('expand').setAttribute('aria-pressed', String(on));
  $('expand').setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  $('expand').title = on ? 'Exit full screen' : 'Full screen';
}
function setExpanded(on) { terminal.classList.toggle('expanded', on); showExpanded(on); }
async function toggleExpanded() {
  if (document.fullscreenElement === terminal) return document.exitFullscreen();
  if (terminal.classList.contains('expanded')) return setExpanded(false);
  if (document.fullscreenEnabled && terminal.requestFullscreen) { try { return await terminal.requestFullscreen(); } catch { /* the CSS fallback */ } }
  setExpanded(true);
}
document.addEventListener('fullscreenchange', () => showExpanded(document.fullscreenElement === terminal));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && terminal.classList.contains('expanded')) setExpanded(false); });

/* ----------------------------------------------------------------- the rest */
function setChoice(group, attr, value) {
  for (const b of $(group).querySelectorAll('button')) {
    const selected = b.dataset[attr] === value;
    b.setAttribute('aria-checked', String(selected)); b.tabIndex = selected ? 0 : -1;
  }
}
function saveUrl() {
  const p = new URLSearchParams({ world: state.world, measure: state.measure, interval: state.interval, range: state.range,
    series: state.measures.join(','), ...(state.mode === 'accumulated' ? { mode: 'accumulated' } : {}), ...(!state.kills ? { kills: '0' } : {}),
    price: state.price ? '1' : '0', ...(state.rate !== null ? { rate: String(state.rate) } : {}), ...(state.stable ? { stable: '1' } : {}) });
  history.replaceState(null, '', `${location.pathname}?${p}`);
}
const tip = $('watchTip');
function showTip(flag) {
  tip.textContent = flag.dataset.tip;
  tip.hidden = false;
  const r = flag.getBoundingClientRect();
  tip.style.left = `${Math.max(8, Math.min(innerWidth - tip.offsetWidth - 8, r.left))}px`;
  tip.style.top = `${r.bottom + 6}px`;
}

function wire() {
  // WebKit does not consistently scroll a focused overflow region with Left/Right. Keep this table's
  // horizontal keyboard navigation explicit; events from any descendant retain their native behavior.
  const dataFrame = $('chartData').parentElement;
  dataFrame.addEventListener('keydown', e => {
    if (e.target !== dataFrame || !['ArrowLeft', 'ArrowRight'].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    dataFrame.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * dataFrame.clientWidth / 2 });
  });
  for (const id of ['valueMode', 'range', 'interval', 'liquidation']) $(id).addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    const buttons = [...$(id).querySelectorAll('button')], at = buttons.indexOf(e.target);
    if (at < 0) return;
    e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (at + (['ArrowRight', 'ArrowDown'].includes(e.key) ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].click(); buttons[next].focus();
  });
  dock($('dock'), { key: 'tibinance.economy.dock', roomy: () => matchMedia(ROOMY).matches, onChange() {
    const days = chart?.chart.timeScale().getVisibleLogicalRange();
    requestAnimationFrame(() => requestAnimationFrame(() => { if (days) chart.chart.timeScale().setVisibleLogicalRange(days); }));
  } });
  $('measure').addEventListener('click', e => {
    const k = e.target.closest('button[data-measure]')?.dataset.measure;
    if (!k) return;
    if (state.measures.includes(k)) {
      state.measures = state.measures.filter(m => m !== k);
      if (state.measure === k && state.measures.length) state.measure = state.measures.at(-1);
    } else { state.measures.push(k); state.measure = k; }
    draw({ preserveRange: true });
  });
  $('killsToggle').addEventListener('click', () => { state.kills = !state.kills; draw({ preserveRange: true }); });
  $('valueMode').addEventListener('click', e => {
    const mode = e.target.closest('[data-mode]')?.dataset.mode;
    if (mode && mode !== state.mode) { state.mode = mode; draw({ preserveRange: true }); }
  });
  $('range').addEventListener('click', e => { const r = e.target.closest('button')?.dataset.range; if (r) { state.range = r; draw(); } });
  $('detailPerformance').addEventListener('click', e => { const r = e.target.closest('button')?.dataset.range; if (r) { state.range = r; draw(); } });
  $('interval').addEventListener('click', e => {
    const i = e.target.closest('button')?.dataset.interval;
    if (!i || i === state.interval || !view) return;
    state.interval = i;
    view = buildView(view.summary, view.daily, view.contrib);
    draw();
  });
  $('priceToggle').addEventListener('click', () => { state.price = !state.price; draw({ preserveRange: true }); });
  $('liquidation').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.rate = b.dataset.rate === '' ? null : Number(b.dataset.rate);
    setChoice('liquidation', 'rate', b.dataset.rate);
    draw({ preserveRange: true });
  });
  $('stable').addEventListener('click', () => { state.stable = !state.stable; $('stable').setAttribute('aria-pressed', String(state.stable)); draw({ preserveRange: true }); });
  $('creatureMonth').addEventListener('change', e => { state.month = e.target.value; drawCreatures(); });
  $('exportButton').addEventListener('click', () => exportImage().catch(e => { console.error(e); $('exportStatus').textContent = 'The chart image could not be exported.'; }));
  $('expand').addEventListener('click', () => toggleExpanded().catch(console.error));
  $('filter').addEventListener('input', e => { state.filter = e.target.value; drawWatchlist(); });
  document.querySelector('table.watch thead').addEventListener('click', e => {
    const k = e.target.closest('button')?.dataset.sort; if (!k) return;
    state.sort = { key: k, dir: state.sort.key === k ? -state.sort.dir : k === 'world' ? 1 : -1 };
    drawWatchlist();
  });
  $('worlds').addEventListener('click', e => { const row = e.target.closest('tr[data-world]'); if (row && !e.target.closest('.flag')) select(row.dataset.world).catch(failed); });
  // Up and Down move through the listed worlds, as in a watchlist.
  $('worlds').addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const all = [...$('worlds').querySelectorAll('tr[data-world]')], at = all.findIndex(r => r.contains(document.activeElement));
    const next = all[at + (e.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    select(next.dataset.world, { focus: true }).catch(failed);
  });
  $('worlds').addEventListener('mouseover', e => { const f = e.target.closest('.flag'); if (f) showTip(f); });
  $('worlds').addEventListener('mouseout', e => { if (e.target.closest('.flag')) tip.hidden = true; });
  $('worlds').addEventListener('focusin', e => { const f = e.target.closest('.flag'); if (f) showTip(f); else tip.hidden = true; });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') tip.hidden = true; });
}

function feedback(message, error = false) {
  $('loadFeedback').hidden = false;
  $('loadFeedback').classList.toggle('has-view', Boolean(view));
  $('status').textContent = message;
  $('retry').hidden = !error;
}
const retryFocusVacant = () => document.activeElement === document.body || document.activeElement === $('retry');
function failed() {
  feedback(retryWorld ? `${retryWorld} data could not be loaded.${view ? ` Still showing ${state.world}.` : ''} Retry or choose another world.` : 'The economy data could not be loaded. Retry to try again.', true);
  $('economy').setAttribute('aria-busy', 'false');
}

// The terminal's toolbars (js/tv-terminal.js) reach the chart through this context only (js/tv-bridge.js).
function connectTools() {
  if (!chart) return;
  connect({
    page: 'economy', chart: chart.chart,
    series: () => chart.main(),
    key: () => `economy:${state.world}`,
    symbol: () => state.world,
    times: () => view?.periods.map(p => p.start) ?? [],
    values: () => view ? view.periods.map(p => ({ time: p.start, value: view.values.get(p.start)?.[field()] })).filter(v => Number.isFinite(v.value)) : [],
    format: v => gold(v),
    worlds: () => data.index ? overviewRows(data.overview, state.interval, state.measure, state.range, '').map(r => ({ world: r.world, last: r.value, ratio: r.change, retired: !!r.ended,
      meta: r.dir === 'all' ? 'Every world, summed' : [marketOf(r.world)?.type, marketOf(r.world)?.location, r.ended && `ended ${r.ended}`].filter(Boolean).join(', ') })) : [],
    open: world => { $('filter').value = state.filter = ''; select(world).catch(failed); },
    reset: () => { chart.chart.priceScale('right').applyOptions({ autoScale: true }); applyRange(); },
    setStyle: style => chart.setStyle(style),
    retheme: () => chart.retheme(),
    replay: day => { chart.replay(day); if (!day) applyRange(); },
  });
}

async function main() {
  const controller = requests;
  try {
  [data.index, data.overview, data.market, data.results, data.sync, data.access, data.creatures, data.vip] = await Promise.all([
    json('data/economy/gold/index.json'), json('data/economy/gold/overview.json'), optional('data/market-history/tibia-coin/index.json'),
    optional('reports/economy/results.json'), optional('data/economy/sync-status.json'), optional('data/economy/population/access.json'),
    optional('data/economy/gold/creatures.json'), optional('data/economy/population/tibiavip-snapshot/2026-10-13.json')]);
  data.creatures = data.creatures?.creatures ?? {};
  if (controller !== requests) return;
  setChoice('liquidation', 'rate', state.rate === null ? '' : String(state.rate));
  $('stable').setAttribute('aria-pressed', String(state.stable));
  const startupRequest = request;
  if (!wired) { wire(); connectTools(); wired = true; }
  renderFindings();
  renderProvenance();
  await document.fonts.ready;
  await new Promise(requestAnimationFrame);
  if (startupRequest !== request || controller !== requests) return false;
  return await select(state.world);
  } catch (error) { if (controller === requests && !controller.signal.aborted) throw error; }
}

$('retry').addEventListener('click', async () => {
  const world = retryWorld;
  if (world) await select(world);
  else {
    feedback('Loading the economy data.');
    try {
      const loaded = await main();
      if (retryFocusVacant()) {
        if (loaded) document.querySelector('#worlds tr[aria-selected="true"] .pick')?.focus();
        else if (!$('retry').hidden) $('retry').focus();
      }
    }
    catch { failed(); if (retryFocusVacant()) $('retry').focus(); }
  }
});
main().catch(failed);
