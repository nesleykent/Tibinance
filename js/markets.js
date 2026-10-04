/*
 * Markets page: one world's history in a chart, every world in a watchlist.
 * Reads the generated dataset (data/market-history/<asset>/), never the
 * capture database. Lightweight Charts is loaded as a global by markets.html.
 *
 * Price pane: best offers for the selected side (dots), joined solid between
 * consecutive server days and dotted across unobserved days; the daily average
 * trade price for the same side in grey, by the same rule. Activity pane: raw transaction counters
 * per completed server day on that side. Nothing is interpolated.
 */
import { fmt, esc, num } from './format.js';
import { bestOfferCloses } from './market-history.js';
import { RANGES, changeOver, dayGrid, daysBetween, neighbours, rangeStart } from './market-series.js';
import { SIDES, createMarketChart, dayOf } from './market-chart.js';
import { dock } from './markets-dock.js';
import { marketImage } from './market-export.js';

const ASSET = 'tibia-coin';
const DATA = `data/market-history/${ASSET}/`;
const STALE_DAYS = 7;   // a world whose latest best offer is older than this is marked
// Where the Worlds panel opens by default: from here up, the chart keeps at least 600px beside it
// (the page's gutters and maximum width, css/app.css, less the panel and the rail, css/markets.css).
const ROOMY = '(min-width: 1280px)';
const $ = id => document.getElementById(id);
const percent = new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
const signedNumber = new Intl.NumberFormat(undefined, { signDisplay: 'exceptZero' });
const tone = value => value > 0 ? 'up' : value < 0 ? 'down' : '';
const signedRatio = ratio => ratio == null ? num(null) : `<span class="${tone(ratio)}">${percent.format(ratio)}</span>`;
const signedDelta = delta => delta == null ? num(null) : `<span class="${tone(delta)}">${signedNumber.format(delta)}</span>`;

const state = { index: null, world: null, side: 'sell', range: '1Y', sort: { key: 'world', dir: 1 }, filter: '', files: new Map(), view: null };

/* ------------------------------------------------------------------ chart */
// Built by js/market-chart.js, which also builds the chart an exported image is drawn from.
const market = createMarketChart($('chart'));
const chart = market.chart;
chart.subscribeCrosshairMove(p => showLegend(p.time === undefined ? null : dayOf(p.time)));


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
  market.draw(state.view, state.side);
  // Keys in the legends and the help take the side's colour from here.
  $('market').classList.toggle('side-sell', state.side === 'sell');
  $('market').classList.toggle('side-buy', state.side === 'buy');
  applyRange();
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
 * observation, the daily average, and transaction activity. An unobserved day names the
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
  $('volumeLegend').innerHTML = `<div class="row"><span class="label"><i class="key key-volume"></i>Transactions</span> ${stats ? `<b>${fmt(stats.transactions)}</b>` : num(null)}</div>`;
}

// The selected side's latest best offer against the last one on or before the start of the range.
const rangeChange = () => changeOver(state.view.closes.map(c => ({ day: c.serverDay, value: c[state.side] })), rangeStart(state.view.end, state.range));

function showQuote() {
  const { summary, daily } = state.view, side = state.side, latest = summary.latestBestOffer;
  const change = rangeChange();
  const changeText = change ? `${signedDelta(change.to.value - change.from.value)} ${signedRatio(change.ratio)}` : num(null);
  const changeTitle = change ? `${state.range}: ${fmt(change.from.value)} on ${change.from.day} to ${fmt(change.to.value)} on ${change.to.day}` : '';
  $('world').textContent = summary.world;
  // Separate items, spaced by layout; Tibinance copy never uses a middle dot.
  $('worldMeta').innerHTML = [
    retired(summary) && `<span class="tag">Retired</span><span>Offline since ${esc(summary.offline)}, merged into <button type="button" class="world-link" data-world="${esc(summary.mergedInto)}">${esc(summary.mergedInto)}</button></span>`,
    summary.type && `<span>${esc(summary.type)}</span>`,
    summary.battleye && `<span>BattlEye <span class="be-${esc(summary.battleye)}">${esc(summary.battleye)}</span></span>`].filter(Boolean).join('');
  $('worldMeta').title = $('worldMeta').textContent.replace(/\s+/g, ' ').trim();   // the whole line where it is cut short
  // The side picker carries both sides' latest best offers and the spread between them, as the chart's context.
  $('sideSell').innerHTML = num(latest?.sell);
  $('sideBuy').innerHTML = num(latest?.buy);
  $('sideSpread').innerHTML = latest ? fmt(latest.sell - latest.buy) : '';
  $('through').textContent = `Server days through ${state.view.end}`;
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
  $('chart').setAttribute('aria-label', `${summary.world}, ${SIDES[side].offer} history and daily transaction activity (count), range ${state.range}. `
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
  // An image needs something to show.
  $('exportButton').disabled = !state.view.grid.length;
  $('exportButton').title = state.view.grid.length ? 'Export chart image' : `No market data for ${world} to export`;
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

/* ------------------------------------------------------------ full screen */
// The whole terminal, so the rail and its way back stay on screen; the CSS fallback where element full screen is
// unavailable (iPhone) or refused.
const terminal = $('market');
function showExpanded(on) {
  $('expand').setAttribute('aria-pressed', String(on));
  $('expand').setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
  $('expand').title = on ? 'Exit full screen' : 'Full screen';
}
function setExpanded(on) {
  terminal.classList.toggle('expanded', on);
  showExpanded(on);
}
async function toggleExpanded() {
  if (document.fullscreenElement === terminal) return document.exitFullscreen();
  if (terminal.classList.contains('expanded')) return setExpanded(false);
  if (document.fullscreenEnabled && terminal.requestFullscreen) {
    try { return await terminal.requestFullscreen(); } catch { /* fall through to the CSS fallback */ }
  }
  setExpanded(true);
}
document.addEventListener('fullscreenchange', () => showExpanded(document.fullscreenElement === terminal));
document.addEventListener('keydown', e => { if (e.key === 'Escape' && terminal.classList.contains('expanded')) setExpanded(false); });

/* ------------------------------------------------------------------ export */
// An image of what the chart shows: this world and side, over the days in view (js/market-export.js).
function imageContext() {
  const { summary, end } = state.view, side = state.side, latest = summary.latestBestOffer, change = rangeChange();
  const delta = change && change.to.value - change.from.value, shown = chart.timeScale().getVisibleRange();
  return {
    world: summary.world,
    tag: retired(summary) ? 'Retired' : '',
    meta: [retired(summary) && `Offline since ${summary.offline}, merged into ${summary.mergedInto}`, summary.type,
      summary.battleye && `BattlEye ${summary.battleye}`].filter(Boolean),
    value: latest ? fmt(latest[side]) : 'N/A',
    valueNote: latest ? `${SIDES[side].offer} on server day ${latest.serverDay}` : SIDES[side].offer,
    change: change && { text: `${signedNumber.format(delta)} ${percent.format(change.ratio)}`, tone: tone(delta), note: `change over ${state.range}` },
    shown: shown ? `Server days ${dayOf(shown.from)} to ${dayOf(shown.to)}` : '',
    footer: `Server days run from 10:00 to 10:00 CET/CEST. Market history through ${end}.`
  };
}
async function exportImage() {
  const button = $('exportButton');
  if (button.disabled || !state.view?.grid.length) return;
  const { summary } = state.view;
  button.disabled = true;
  try {
    const canvas = await marketImage({ view: state.view, side: state.side, logicalRange: chart.timeScale().getVisibleLogicalRange(), context: imageContext() });
    const blob = await new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('The image could not be encoded.'))), 'image/png'));
    const name = `tibinance-${summary.world.toLowerCase()}-${state.side}-${state.range.toLowerCase()}-${state.view.end}.png`;
    const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10000);
    $('exportStatus').textContent = `Saved ${name}.`;
  } catch (error) {
    console.error(error);
    $('exportStatus').textContent = 'The chart image could not be exported.';
  } finally {
    button.disabled = !state.view?.grid.length;
  }
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
  $('exportButton').addEventListener('click', exportImage);
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
