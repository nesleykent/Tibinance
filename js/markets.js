/*
 * Markets page: one world's history in a chart, every world in a watchlist.
 * Reads the generated dataset (data/market-history/<asset>/), never the
 * capture database. Lightweight Charts is loaded as a global by markets.html.
 *
 * Price pane: best offers for the selected side (dots), joined solid between
 * consecutive server days and dotted across unobserved days; the daily average
 * trade price for the same side in grey, by the same rule. Volume pane: coins
 * traded per server day on that side. Nothing is interpolated.
 */
import { fmt, esc, num } from './format.js';
import { bestOfferCloses } from './market-history.js';
import { RANGES, changeOver, dayGrid, daysBetween, lineLayers, neighbours, rangeStart } from './market-series.js';
import { dock } from './markets-dock.js';

const ASSET = 'tibia-coin';
const DATA = `data/market-history/${ASSET}/`;
const STALE_DAYS = 7;   // a world whose latest best offer is older than this is marked
// Where the Worlds panel opens by default: from here up, the chart keeps at least 600px beside it
// (the page's gutters and maximum width, css/app.css, less the panel and the rail, css/markets.css).
const ROOMY = '(min-width: 1280px)';
const SIDES = {
  sell: { offer: 'Best Sell Offer', offers: 'Sell Offers' },
  buy: { offer: 'Best Buy Offer', offers: 'Buy Offers' }
};
const $ = id => document.getElementById(id);
const percent = new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const signedNumber = new Intl.NumberFormat(undefined, { signDisplay: 'exceptZero' });
const tone = value => value > 0 ? 'up' : value < 0 ? 'down' : '';
const signedRatio = ratio => ratio == null ? num(null) : `<span class="${tone(ratio)}">${percent.format(ratio)}</span>`;
const signedDelta = delta => delta == null ? num(null) : `<span class="${tone(delta)}">${signedNumber.format(delta)}</span>`;

const state = { index: null, world: null, side: 'sell', range: '1Y', sort: { key: 'world', dir: 1 }, filter: '', files: new Map(), view: null };

/* ------------------------------------------------------------------ chart */
const L = window.LightweightCharts;
const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const colors = { sell: token('--sell'), buy: token('--buy'), average: token('--average'), text: token('--muted'),
  grid: token('--line-faint'), rule: token('--line'), crosshair: token('--line-strong'), ink: token('--ink') };
// Lightweight Charts reports a day as the string it was given or as {year, month, day}.
const dayOf = time => typeof time === 'string' ? time
  : typeof time === 'object' ? `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
  : new Date(time * 1000).toISOString().slice(0, 10);

const chart = L.createChart($('chart'), {
  autoSize: true,
  layout: { background: { type: 'solid', color: 'transparent' }, textColor: colors.text, fontFamily: token('--font-ui'), fontSize: 11,
    panes: { separatorColor: colors.rule, separatorHoverColor: colors.crosshair } },
  grid: { vertLines: { visible: false }, horzLines: { color: colors.grid } },
  // Room above the highest price for the legend.
  rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.14, bottom: 0.06 } },
  timeScale: { borderVisible: false, rightOffset: 4 },
  crosshair: { mode: L.CrosshairMode.Normal,
    vertLine: { color: colors.crosshair, labelBackgroundColor: colors.ink },
    horzLine: { color: colors.crosshair, labelBackgroundColor: colors.ink } },
  localization: { priceFormatter: v => fmt(Math.round(v)), timeFormatter: dayOf }
});
const line = options => chart.addSeries(L.LineSeries, { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...options });
const series = {
  averageSolid: line({ color: colors.average, lineWidth: 1 }),
  averageDotted: line({ color: colors.average, lineWidth: 1, lineStyle: L.LineStyle.Dotted }),
  bestSolid: line({ lineWidth: 2 }),
  bestDotted: line({ lineWidth: 2, lineStyle: L.LineStyle.Dotted }),
  // The observations themselves, with the latest one marked across the chart
  // and on the price scale; the two line layers above only join them.
  bestPoints: line({ lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 3, crosshairMarkerVisible: true,
    lastValueVisible: true, priceLineVisible: true, priceLineWidth: 1, priceLineStyle: L.LineStyle.LargeDashed }),
  volume: chart.addSeries(L.HistogramSeries, { priceLineVisible: false, lastValueVisible: false,
    priceFormat: { type: 'custom', minMove: 1, formatter: v => fmt(Math.round(v)) } }, 1)
};
series.volume.priceScale().applyOptions({ scaleMargins: { top: 0.3, bottom: 0 } });
chart.panes()[0].setStretchFactor(4);
chart.panes()[1].setStretchFactor(1);

// Dots shrink, then give way to the line, as more days share the same width.
chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
  if (!range) return;
  const spacing = chart.timeScale().width() / Math.max(1, range.to - range.from);
  series.bestPoints.applyOptions({ pointMarkersVisible: spacing >= 2, pointMarkersRadius: Math.min(3, Math.max(1.5, spacing / 2)) });
});
chart.subscribeCrosshairMove(p => showLegend(p.time === undefined ? null : dayOf(p.time)));
// The volume legend sits at the top of the volume pane, wherever the panes divide.
new ResizeObserver(placeVolumeLegend).observe($('chart'));
function placeVolumeLegend() {
  $('volumeLegend').style.top = `calc(${chart.paneSize(0).height + 1}px + var(--space-1))`;
}

/* -------------------------------------------------------------- the world */
const retired = summary => summary.status === 'retired';
// A world's history ends with the dataset, or on a retired world's last observed day;
// ranges and changes count back from there, so a retired world never shows an empty window.
function endOf(summary) {
  return retired(summary) ? [summary.bestOfferDays.last, summary.dailyStatisticsDays.last].filter(Boolean).sort().at(-1) : state.index.through;
}
function worldView(summary, file) {
  const closes = bestOfferCloses(file.observations);
  const daily = file.dailyStatistics;
  const days = [closes[0]?.serverDay, daily[0]?.serverDay, closes.at(-1)?.serverDay, daily.at(-1)?.serverDay].filter(Boolean).sort();
  const end = endOf(summary);
  return { summary, closes, daily, closeDays: closes.map(c => c.serverDay), end,
    grid: days.length ? dayGrid(days[0], end) : [], latestDay: days.at(-1),
    dailyByDay: new Map(daily.map(d => [d.serverDay, d])) };
}

function drawChart() {
  const { closes, daily, grid } = state.view, side = state.side, color = colors[side];
  const points = closes.map(c => ({ time: c.serverDay, value: c[side] }));
  const best = lineLayers(points);
  // A day without trades has no average price; its volume is a real zero.
  const average = lineLayers(daily.filter(d => d[side]?.transactions > 0).map(d => ({ time: d.serverDay, value: d[side].averagePrice })));
  series.bestSolid.applyOptions({ color });
  series.bestDotted.applyOptions({ color });
  series.bestPoints.applyOptions({ color, priceLineColor: color });
  series.bestSolid.setData(best.solid);
  series.bestDotted.setData(best.dotted);
  series.bestPoints.setData(points);
  series.averageSolid.setData(average.solid);
  series.averageDotted.setData(average.dotted);
  // Every server day is on the axis, so a gap takes the width of its missing days.
  series.volume.applyOptions({ color: `${color}73` });
  series.volume.setData(grid.map(day => {
    const value = state.view.dailyByDay.get(day)?.[side]?.tcVolume;
    return value === undefined ? { time: day } : { time: day, value };
  }));
  // Keys in the legends and the help take the side's colour from here.
  $('chartPanel').classList.toggle('side-sell', side === 'sell');
  $('chartPanel').classList.toggle('side-buy', side === 'buy');
  applyRange();
  placeVolumeLegend();
}

function applyRange(attempt = 0) {
  const { grid } = state.view;
  if (!grid.length) return;
  // The chart measures its container asynchronously; a range set at zero width is lost.
  if (chart.timeScale().width() === 0 && attempt < 30) { requestAnimationFrame(() => applyRange(attempt + 1)); return; }
  const start = rangeStart(state.view.end, state.range);
  if (!start || start <= grid[0]) chart.timeScale().fitContent();
  else chart.timeScale().setVisibleRange({ from: start, to: grid.at(-1) });
}

/*
 * The legends read the day under the crosshair, or the world's latest day when
 * the pointer is away: the best offer with its change from the previous
 * observation, the daily average, and the volume. An unobserved day names the
 * observations on either side instead of showing a value.
 */
function showLegend(day) {
  const view = state.view;
  if (!view) return;
  if (!view.latestDay) { $('legend').innerHTML = ''; $('volumeLegend').innerHTML = ''; return; }
  day ??= view.latestDay;
  const side = state.side, labels = SIDES[side], closes = view.closes;
  const { at, before, after } = neighbours(view.closeDays, day);
  let best;
  if (at !== -1) {
    const close = closes[at], prior = closes[at - 1];
    const delta = prior ? close[side] - prior[side] : null;
    best = `<b>${fmt(close[side])}</b>`
      + (prior ? ` ${signedDelta(delta)} ${signedRatio(delta / prior[side])} <span class="meta">since ${esc(prior.serverDay)}</span>` : '')
      + (close.observations > 1 ? ` <span class="meta">last of ${close.observations}</span>` : '');
  } else if (before !== -1 && after !== -1) {
    best = `not observed between ${esc(closes[before].serverDay)} and ${esc(closes[after].serverDay)}`;
  } else if (before !== -1) {
    best = `not observed since ${esc(closes[before].serverDay)}`;
  } else best = 'not observed';
  const stats = view.dailyByDay.get(day)?.[side];
  const average = !stats ? num(null) : stats.transactions ? `<b>${fmt(stats.averagePrice)}</b>` : 'no trades';
  $('legend').innerHTML = `<div class="row"><span class="day">${esc(day)}</span>`
    + `<span class="label"><i class="key key-dot"></i>${labels.offer}</span> ${best}</div>`
    + `<div class="row"><span class="label"><i class="key key-average"></i>Daily average</span> ${average}</div>`;
  $('volumeLegend').innerHTML = `<div class="row"><span class="label"><i class="key key-volume"></i>Volume</span> ${stats ? `<b>${fmt(stats.tcVolume)}</b>` : num(null)}</div>`;
}

function showQuote() {
  const { summary, closes, daily } = state.view, side = state.side, latest = summary.latestBestOffer;
  const change = changeOver(closes.map(c => ({ day: c.serverDay, value: c[side] })), rangeStart(state.view.end, state.range));
  const changeText = change ? `${signedDelta(change.to.value - change.from.value)} ${signedRatio(change.ratio)}` : num(null);
  const changeTitle = change ? `${state.range}: ${fmt(change.from.value)} on ${change.from.day} to ${fmt(change.to.value)} on ${change.to.day}` : '';
  $('world').textContent = summary.world;
  // Separate items, spaced by layout; Tibinance copy never uses a middle dot.
  $('worldMeta').innerHTML = [
    retired(summary) && `<span class="tag">Retired</span><span>Offline since ${esc(summary.offline)}, merged into <button type="button" class="world-link" data-world="${esc(summary.mergedInto)}">${esc(summary.mergedInto)}</button></span>`,
    summary.type && `<span>${esc(summary.type)}</span>`,
    summary.battleye && `<span>BattlEye <span class="be-${esc(summary.battleye)}">${esc(summary.battleye)}</span></span>`].filter(Boolean).join('');
  $('worldMeta').title = $('worldMeta').textContent.replace(/\s+/g, ' ').trim();   // the whole line where it is cut short
  $('lastPrice').innerHTML = num(latest?.[side]);
  $('lastPrice').title = SIDES[side].offer;
  $('lastChange').innerHTML = changeText;
  $('lastChange').title = changeTitle;

  $('detailsWorld').innerHTML = esc(summary.world) + (retired(summary) ? ' <span class="tag">Retired</span>' : '');
  // Also in the details: narrow screens hide the toolbar metadata but show the details under the chart.
  $('detailStatus').hidden = !retired(summary);
  $('detailStatus').innerHTML = retired(summary) ? `Offline since ${esc(summary.offline)}, merged into <button type="button" class="world-link" data-world="${esc(summary.mergedInto)}">${esc(summary.mergedInto)}</button>` : '';
  $('detailSell').innerHTML = num(latest?.sell);
  $('detailBuy').innerHTML = num(latest?.buy);
  $('detailSpread').innerHTML = latest ? fmt(latest.sell - latest.buy) : num(null);
  $('detailChangeLabel').textContent = `Change ${state.range}`;
  $('detailChange').innerHTML = changeText;
  $('detailChange').title = changeTitle;
  $('detailObserved').innerHTML = latest ? esc(localClock(latest.capturedAtUtc)) : num(null);
  $('detailObserved').title = latest ? `Server day ${latest.serverDay}; ${latest.capturedAtUtc}` : '';
  const lastDaily = daily.at(-1)?.serverDay;
  $('detailDaily').innerHTML = lastDaily ? `through ${esc(lastDaily)}` : num(null);
  $('helpWorld').textContent = lastDaily ? `Daily figures for ${summary.world} run through ${lastDaily}.` : `There are no daily figures for ${summary.world}.`;
  $('chart').setAttribute('aria-label', `${summary.world}, ${SIDES[side].offer} history, range ${state.range}. `
    + (latest ? `Latest ${fmt(latest[side])} on server day ${latest.serverDay}.` : 'No best offers observed.'));
}

// The viewer's own clock, written the way the rest of Tibinance writes times.
function localClock(iso) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}, ${p.hour}:${p.minute}`;
}

/* -------------------------------------------------------------- watchlist */
function watchRows() {
  const side = state.side === 'sell' ? 1 : 2;
  return state.index.worlds.map(w => {
    const closes = w.bestOfferCloses.map(c => ({ day: c[0], value: c[side] }));
    const last = closes.at(-1), change = changeOver(closes, rangeStart(endOf(w), state.range));
    return { world: w.world, retired: retired(w), offline: w.offline, mergedInto: w.mergedInto, last: last?.value ?? null, lastDay: last?.day ?? null,
      delta: change ? change.to.value - change.from.value : null, ratio: change?.ratio ?? null,
      stale: !retired(w) && (!last || daysBetween(last.day, state.index.through) > STALE_DAYS) };
  });
}

function drawWatchlist() {
  const { key, dir } = state.sort, needle = state.filter.trim().toLowerCase();
  // Active worlds are the universe; a search reaches retired worlds too, and the selection always stays listed.
  const listed = r => needle ? r.world.toLowerCase().includes(needle) : !r.retired || r.world === state.world;
  const rows = watchRows().filter(listed).sort((a, b) => {
    if (key === 'world') return dir * a.world.localeCompare(b.world);
    if (a[key] === null || b[key] === null) return (a[key] === null) - (b[key] === null);   // absent values last
    return dir * (a[key] - b[key]) || a.world.localeCompare(b.world);
  });
  $('worlds').innerHTML = rows.map(r => {
    const selected = r.world === state.world;
    // One compact indicator per row: R for a retired world, i for a world whose latest best offer is old.
    // The note is its accessible name, the world button's description and its tooltip on hover or focus.
    const note = r.retired ? `Retired: offline since ${r.offline}, merged into ${r.mergedInto}.`
      : r.stale && r.lastDay ? `Latest best offer: ${r.lastDay}.` : '';
    const id = `note-${r.world}`;
    const flag = note ? `<span class="flag${r.retired ? ' flag-retired' : ''}" tabindex="0" role="img" aria-label="${esc(note)}" data-tip="${esc(note)}">${r.retired ? 'R' : 'i'}</span><span class="sr-only" id="${esc(id)}">${esc(note)}</span>` : '';
    return `<tr data-world="${esc(r.world)}" aria-selected="${selected}">
      <th scope="row"><button type="button" class="pick" aria-pressed="${selected}"${note ? ` aria-describedby="${esc(id)}"` : ''}>${esc(r.world)}</button>${flag}</th>
      <td class="${r.stale ? 'stale' : ''}">${num(r.last)}</td><td>${signedDelta(r.delta)}</td><td>${signedRatio(r.ratio)}</td></tr>`;
  }).join('');
  $('worldCount').textContent = rows.length;
  $('noWorlds').hidden = rows.length > 0;
  for (const th of document.querySelectorAll('table.watch thead th')) {
    const k = th.querySelector('button').dataset.sort;
    th.setAttribute('aria-sort', k === key ? (dir > 0 ? 'ascending' : 'descending') : 'none');
  }
}

/* -------------------------------------------------------------- selection */
async function select(world, { focus = false } = {}) {
  const summary = state.index.worlds.find(w => w.world === world);
  if (!summary) return;
  state.world = world;
  saveUrl();
  drawWatchlist();
  const row = document.querySelector(`#worlds tr[data-world="${CSS.escape(world)}"]`);
  row?.scrollIntoView({ block: 'nearest' });
  if (focus) row?.querySelector('.pick').focus();
  if (!state.files.has(world)) {
    const response = await fetch(DATA + summary.file);
    if (!response.ok) throw new Error(`${summary.file}: ${response.status}`);
    state.files.set(world, await response.json());
  }
  if (state.world !== world) return;   // a later click won while this file loaded
  state.view = worldView(summary, state.files.get(world));
  drawChart();
  showQuote();
  showLegend(null);
  // A current world without market data yet says so instead of drawing an empty chart.
  $('status').hidden = state.view.grid.length > 0;
  if (!state.view.grid.length) $('status').textContent = `No market data for ${world} yet.`;
  // The filled details panel shortens the list; keep the selection in view once it has.
  document.querySelector(`#worlds tr[data-world="${CSS.escape(world)}"]`)?.scrollIntoView({ block: 'nearest' });
}

// Fixed to the viewport, so the scrolling list never clips it; kept inside the screen.
let tipAnchor = null;
function showTip(flag) {
  tipAnchor = flag;
  const tip = $('watchTip');
  tip.textContent = flag.dataset.tip;
  tip.hidden = false;
  const anchor = flag.getBoundingClientRect(), box = tip.getBoundingClientRect();
  const below = anchor.bottom + 6, above = anchor.top - box.height - 6;
  tip.style.left = `${Math.min(Math.max(8, anchor.left + anchor.width / 2 - box.width / 2), innerWidth - box.width - 8)}px`;
  tip.style.top = `${below + box.height > innerHeight - 8 ? Math.max(8, above) : below}px`;
}
const hideTip = () => { tipAnchor = null; $('watchTip').hidden = true; };
// While the list scrolls, the tooltip follows an indicator that is still hovered or focused and in view.
function followTip() {
  if (!tipAnchor) return;
  const anchor = tipAnchor.getBoundingClientRect(), list = document.querySelector('.watch-scroll').getBoundingClientRect();
  const held = tipAnchor.matches(':hover') || tipAnchor === document.activeElement;
  held && anchor.top >= list.top && anchor.bottom <= list.bottom ? showTip(tipAnchor) : hideTip();
}

function setChoice(group, attribute, value) {
  for (const b of $(group).querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset[attribute] === value));
}

function saveUrl() {
  const url = new URL(location.href);
  url.searchParams.set('world', state.world);
  url.searchParams.set('side', state.side);
  url.searchParams.set('range', state.range);
  history.replaceState(null, '', url);
}

/* ------------------------------------------------------------- the dock */
// Opening or closing a panel changes the chart's width: it keeps showing the same days, wider or narrower.
// The Worlds panel reopens at the selected world.
function dockChanged(open) {
  const days = chart.timeScale().getVisibleLogicalRange();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (days) chart.timeScale().setVisibleLogicalRange(days);
    if (open === 'worldsPanel') document.querySelector('#worlds tr[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }));
}

/* ------------------------------------------------------- expand and help */
const panel = $('chartPanel');
function showExpanded(on) {
  $('expand').setAttribute('aria-pressed', String(on));
  $('expand').setAttribute('aria-label', on ? 'Exit full screen' : 'Expand chart');
  $('expand').title = on ? 'Exit full screen' : 'Expand chart';
}
// The CSS fallback, where element full screen is unavailable (iPhone) or refused.
function setExpanded(on) {
  panel.classList.toggle('expanded', on);
  showExpanded(on);
}
async function toggleExpanded() {
  if (document.fullscreenElement === panel) return document.exitFullscreen();
  if (panel.classList.contains('expanded')) return setExpanded(false);
  if (document.fullscreenEnabled && panel.requestFullscreen) {
    try { return await panel.requestFullscreen(); } catch { /* fall through to the CSS fallback */ }
  }
  setExpanded(true);
}
document.addEventListener('fullscreenchange', () => showExpanded(document.fullscreenElement === panel));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && panel.classList.contains('expanded')) setExpanded(false); });

// The help opens under its button; browsers without popovers toggle it in place.
const help = $('help');
function placeHelp() {
  if (!help.hasAttribute('popover')) return;
  const button = $('helpButton').getBoundingClientRect();
  help.style.top = `${button.bottom + 6}px`;
  help.style.right = `${Math.max(8, innerWidth - button.right)}px`;
}
if ('popover' in HTMLElement.prototype) {
  help.addEventListener('beforetoggle', e => { if (e.newState === 'open') placeHelp(); });
} else {
  help.removeAttribute('popover');
  help.hidden = true;
  $('helpButton').setAttribute('aria-expanded', 'false');
  $('helpButton').addEventListener('click', () => {
    help.hidden = !help.hidden;
    $('helpButton').setAttribute('aria-expanded', String(!help.hidden));
  });
}

function wire() {
  dock($('dock'), { key: 'tibinance.markets.dock', roomy: () => matchMedia(ROOMY).matches, onChange: dockChanged });
  $('side').addEventListener('click', e => {
    const side = e.target.closest('button')?.dataset.side;
    if (!side || side === state.side) return;
    state.side = side;
    setChoice('side', 'side', side);
    saveUrl(); drawWatchlist(); drawChart(); showQuote(); showLegend(null);
  });
  $('range').addEventListener('click', e => {
    const range = e.target.closest('button')?.dataset.range;
    if (!range) return;
    state.range = range;
    setChoice('range', 'range', range);
    saveUrl(); drawWatchlist(); applyRange(); showQuote();
  });
  $('expand').addEventListener('click', () => toggleExpanded().catch(failed));
  for (const host of [$('worldMeta'), $('detailStatus')]) host.addEventListener('click', e => {
    const world = e.target.closest('.world-link')?.dataset.world;
    if (!world) return;
    $('filter').value = state.filter = '';
    select(world).catch(failed);
  });
  // The watchlist indicators' tooltip: hover or keyboard focus shows it, leaving or Escape hides it.
  $('worlds').addEventListener('mouseover', e => { const flag = e.target.closest('.flag'); if (flag) showTip(flag); });
  $('worlds').addEventListener('mouseout', e => { if (e.target.closest('.flag') && !e.target.closest('.flag').matches(':focus')) hideTip(); });
  $('worlds').addEventListener('focusin', e => { const flag = e.target.closest('.flag'); flag ? showTip(flag) : hideTip(); });
  $('worlds').addEventListener('focusout', hideTip);
  document.querySelector('.watch-scroll').addEventListener('scroll', followTip, { passive: true });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
  $('filter').addEventListener('input', e => { state.filter = e.target.value; drawWatchlist(); });
  document.querySelector('table.watch thead').addEventListener('click', e => {
    const key = e.target.closest('button')?.dataset.sort;
    if (!key) return;
    state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : key === 'world' ? 1 : -1 };
    drawWatchlist();
  });
  $('worlds').addEventListener('click', e => {
    const row = e.target.closest('tr[data-world]');
    if (row) select(row.dataset.world).catch(failed);
  });
  // Up and Down move through the visible worlds, as in a watchlist.
  $('worlds').addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const rows = [...$('worlds').querySelectorAll('tr[data-world]')];
    const at = rows.findIndex(r => r.contains(document.activeElement));
    const next = rows[at + (e.key === 'ArrowDown' ? 1 : -1)];
    if (!next) return;
    e.preventDefault();
    select(next.dataset.world, { focus: true }).catch(failed);
  });
}

function failed(error) {
  console.error(error);
  $('status').hidden = false;
  $('status').textContent = 'The market history could not be loaded.';
  $('market').setAttribute('aria-busy', 'false');
}

async function main() {
  const response = await fetch(`${DATA}index.json`);
  if (!response.ok) throw new Error(`index.json: ${response.status}`);
  state.index = await response.json();
  const params = new URLSearchParams(location.search);
  const names = state.index.worlds.map(w => w.world);
  state.side = SIDES[params.get('side')] ? params.get('side') : 'sell';
  state.range = RANGES.includes(params.get('range')) ? params.get('range') : '1Y';
  const asked = names.find(n => n.toLowerCase() === params.get('world')?.toLowerCase());
  setChoice('side', 'side', state.side);
  setChoice('range', 'range', state.range);
  $('helpThrough').textContent = `The market history runs through server day ${state.index.through}.`;
  wire();
  await select(asked ?? (names.includes('Antica') ? 'Antica' : names[0]));
  $('market').setAttribute('aria-busy', 'false');
}

main().catch(failed);
