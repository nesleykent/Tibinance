/*
 * Economy: a world's gold generation potential as a terminal, read like Markets (markets.html). The chart and its
 * status take the page; the dock beside it holds every world, the creatures behind a month, the labelled
 * assumptions, the research findings and the method; the rail at the right edge opens them.
 *
 * Every figure is gold per day from valued creatures: a day's total, or a complete week's or month's total over its
 * days (js/economy-data.js). Incomplete periods have no value and are never drawn. Kill coverage is beside every
 * figure; nothing is scaled up for unvalued kills, and no NPC liquidation rate is assumed unless one is chosen.
 *
 * Data (static files): data/economy/gold/ (index, the world's daily file and monthly creature contributions, monthly
 * sums of every world, creatures), data/market-history/tibia-coin/index.json (world facts, daily Sell Offers),
 * reports/economy/results.json (findings), data/economy/ (sync and access status). The address keeps the view.
 */
import { fmt, esc, num } from './format.js';
import { dock } from './markets-dock.js';
import { MEASURES, INTERVALS, ratePeriods, rangeChange, rangeStartOf, overviewRows, periodOf, contributions, lastDay, median,
  LIQUIDATION_SCENARIOS } from './economy-data.js?v=20261015-terminal';
import { economyChart, colors } from './economy-chart.js?v=20261015-terminal';

const $ = id => document.getElementById(id);
const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'All'];
const ROOMY = '(min-width: 1280px)';
const REPO = 'https://github.com/nesleykent/Tibinance';   // notes and methodology are read there, rendered
const KEY = { gross: 'var(--ink)', coins: 'var(--sell)', npc: 'var(--buy)' };
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
  measure: MEASURES[params.get('measure')] ? params.get('measure') : 'gross',
  interval: INTERVALS.includes(params.get('interval')) ? params.get('interval') : 'week',
  range: RANGES.includes(params.get('range')) ? params.get('range') : '1Y',
  price: params.get('price') === '1',
  rate: params.has('rate') && LIQUIDATION_SCENARIOS.includes(Number(params.get('rate'))) ? Number(params.get('rate')) : null,
  stable: params.get('stable') === '1',
  sort: { key: 'world', dir: 1 }, filter: '', month: null,
};
const data = { index: null, overview: null, market: null, results: null, sync: null, access: null, creatures: {}, vip: null };
const files = new Map();   // world dir -> promise of {daily, contrib}
let view = null, request = 0;

const chart = economyChart($('chart'), { onCrosshair: day => showLegend(day) });
const field = () => MEASURES[state.measure].field;

/* ------------------------------------------------------------------ loading */
const json = async path => { const r = await fetch(path); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); };
const optional = path => json(path).catch(() => null);
function worldFiles(w) {
  if (!files.has(w.dir)) files.set(w.dir, Promise.all([json(`data/economy/gold/worlds/${w.dir}.json`), json(`data/economy/gold/contributions/${w.dir}.json`)])
    .then(([daily, contrib]) => ({ daily, contrib })).catch(e => { files.delete(w.dir); throw e; }));
  return files.get(w.dir);
}
const summaryOf = world => data.index.worlds.find(w => w.world === world);
const marketOf = world => data.market?.worlds.find(w => w.world === world) ?? null;
const latestDay = () => data.index.worlds.map(w => w.last).sort().at(-1);

/* -------------------------------------------------------------- the world's view */
// The periods at the interval with their rates, the latest complete one, and each period's median Sell Offer.
function buildView(summary, daily, contrib) {
  const periods = ratePeriods(daily, state.interval);
  const prices = new Map();
  for (const [day, sell] of marketOf(summary.world)?.bestOfferCloses ?? []) {
    const start = periodOf(day, state.interval)[0];
    if (!prices.has(start)) prices.set(start, []);
    prices.get(start).push(sell);
  }
  return { summary, daily, contrib, periods, last: periods.findLast(p => p.rate.grossPotential !== null) ?? null,
    byStart: new Map(periods.map(p => [p.start, p])), price: new Map([...prices].map(([start, v]) => [start, { sell: median(v), n: v.length }])),
    end: lastDay(daily), ended: summary.last < latestDay() };
}

async function select(world, { focus = false } = {}) {
  const summary = summaryOf(world) ?? summaryOf('Antica');
  state.world = summary.world;
  const mine = ++request;
  drawWatchlist();
  if (focus) document.querySelector(`#worlds tr[data-world="${CSS.escape(state.world)}"] .pick`)?.focus();
  $('economy').setAttribute('aria-busy', 'true');
  const { daily, contrib } = await worldFiles(summary);
  if (mine !== request) return;   // a later choice won while this one loaded
  view = buildView(summary, daily, contrib);
  state.month = null;
  draw();
  $('economy').setAttribute('aria-busy', 'false');
}

// Everything that follows the world, measure, interval, range or a comparison.
function draw() {
  if (!view) return;
  $('status').hidden = Boolean(view.last);
  if (!view.last) $('status').textContent = `No complete ${state.interval} of data for ${state.world}.`;
  chart.draw({ periods: view.periods, measure: state.measure, field: field(), rate: state.rate, stable: state.stable, price: state.price ? view.price : null });
  for (const b of $('measure').querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.measure === state.measure));
  $('chartPanel').dataset.measure = state.measure;
  setChoice('range', 'range', state.range);
  setChoice('interval', 'interval', state.interval);
  $('priceToggle').setAttribute('aria-pressed', String(state.price));
  $('priceToggle').title = state.price ? 'Hide the TC Sell Offer' : 'Show the TC Sell Offer';
  $('priceToggle').disabled = !marketOf(state.world);
  showQuote();
  showLegend(null);
  showDetails();
  drawWatchlist();
  drawCreatures();
  describeChart();
  applyRange();
  saveUrl();
  requestAnimationFrame(fitHead);
}

function applyRange(attempt = 0) {
  if (!view?.periods.length) return;
  // The chart measures its container asynchronously; a range set at zero width is lost.
  if (chart.chart.timeScale().width() === 0 && attempt < 30) { requestAnimationFrame(() => applyRange(attempt + 1)); return; }
  const first = view.periods[0].start, lastStart = view.periods.at(-1).start;
  const start = view.last ? rangeStartOf(view.last.end, state.range) : null;
  chart.show(!start || start < first ? first : periodOf(start, state.interval)[0], lastStart);
}
const fitHead = () => chart.fitTop($('chartHead'));
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
  const m = marketOf(world);
  return [m?.type && `<span>${esc(m.type)}</span>`, m?.battleye && `<span>BattlEye <span class="be-${esc(m.battleye)}">${esc(m.battleye)}</span></span>`,
    m?.location && `<span>${esc(m.location)}</span>`, view?.ended && `<span class="tag">Ended ${esc(view.summary.last)}</span>`].filter(Boolean).join('');
}

function showQuote() {
  const p = view.last, change = rangeChange(view.periods, field(), state.range);
  $('world').textContent = state.world;
  $('worldMeta').innerHTML = metaOf(state.world);
  $('lastValue').textContent = p ? gold(p.rate[field()]) : 'N/A';
  $('lastChange').innerHTML = change ? `<span class="eco-delta">${signedDelta(change.delta)}</span> ${signedRatio(change.ratio)}` : '';
  $('lastRange').textContent = state.range;
  $('measureGross').textContent = p ? gold(p.rate.grossPotential) : '';
  $('measureCoins').textContent = p ? gold(p.rate.directCoins) : '';
  $('measureNpc').textContent = p ? gold(p.rate.npcPotential) : '';
  $('through').textContent = `Gold per day by ${UNIT[state.interval]}. Kill days through ${view.end}`;
}

/*
 * The readout of the period under the crosshair, or at rest the latest complete one: the measure per day and its
 * change since the previous complete period, the other two measures, kills with their coverage, players killed, and
 * any shown comparison. A period without every day of data says so instead of showing a value.
 */
function showLegend(day) {
  if (!view) return;
  const p = day ? view.byStart.get(day) : view.last;
  if (!p) { $('legend').innerHTML = ''; return; }
  const f = field(), m = MEASURES[state.measure], color = KEY[state.measure];
  const head = `<span class="day">${esc(periodLabel(p))}</span>`;
  if (p.rate[f] === null) {
    $('legend').innerHTML = `${head} <span class="label">${key('key-dot', color)}${m.name}</span> <span class="note">${p.covered ? `${fmt(p.covered)} of ${fmt(p.days)} days with data` : 'no data'}${p.end > view.end ? ', unfinished' : ''}: not drawn</span>`;
    return;
  }
  const i = view.periods.indexOf(p), prev = view.periods.slice(0, i).findLast(q => q.rate[f] !== null);
  const delta = prev ? p.rate[f] - prev.rate[f] : null;
  const rows = [`<span class="label">${key('key-dot', color)}${m.name}</span> <b class="value">${gold(p.rate[f])}</b> <span class="rest">`
    + (prev ? `<span class="eco-delta">${signedDelta(delta)}</span> ${signedRatio(delta / prev.rate[f])} <span class="meta">since ${esc(periodLabel(prev))}</span>` : '') + '</span>'];
  const extra = (label, value, rest = '') => `<span class="label eco-extra">${label}</span> <b class="value eco-extra">${value}</b> <span class="rest eco-extra">${rest}</span>`;
  for (const [k, other] of Object.entries(MEASURES)) if (k !== state.measure) rows.push(extra(`${key('', KEY[k])}${other.name}`, gold(p.rate[other.field])));
  rows.push(`<span class="label">${key('key-volume', color)}Kills</span> <b class="value">${gold(p.rate.kills)}</b> <span class="rest"><span class="meta">${pct1(p.killCoverage)} valued</span></span>`);
  rows.push(extra(`${key('key-average', 'var(--muted)')}Players killed`, gold(p.rate.playerDeaths)));
  if (state.stable) rows.push(extra(`${key('eco-key-dashed', 'var(--accent)')}Constant set`, gold(p.rate.grossStable), '<span class="meta">comparison</span>'));
  if (state.rate !== null) rows.push(extra(`${key('eco-key-dashed', 'var(--caution)')}Coins + ${state.rate * 100}% NPC`, gold(p.rate.directCoins + state.rate * p.rate.npcPotential), '<span class="meta">assumption</span>'));
  if (state.price) {
    const q = view.price.get(p.start);
    rows.push(extra(`${key('key-average', 'var(--average)')}TC Sell Offer`, q ? gold(q.sell) : 'N/A', `<span class="meta">${q ? `median of ${fmt(q.n)} day${q.n === 1 ? '' : 's'}` : 'not observed'}</span>`));
  }
  $('legend').innerHTML = `${head} ${rows.join(' ')}`;
  if (!day) fitHead();
}

function describeChart() {
  const p = view.last, m = MEASURES[state.measure];
  $('chart').setAttribute('aria-label', `${state.world}, ${m.name.toLowerCase()} from valued creatures in gold per day, by ${UNIT[state.interval]}, range ${state.range}. `
    + (p ? `Latest complete ${UNIT[state.interval]}: ${periodLabel(p)}, ${gold(p.rate[field()])} gold per day, kill coverage ${pct1(p.killCoverage)}.` : 'No complete period.')
    + (state.price ? ' With the median TC Sell Offer per period on the left scale.' : '')
    + (state.rate !== null ? ` With coins plus ${state.rate * 100}% of NPC potential, an assumption.` : '')
    + (state.stable ? ' With the constant creature set for comparison.' : ''));
}

/* --------------------------------------------------------------- watchlist */
// Every active world (and a retired one a search names), in gold per day of the measure shown over its latest complete
// period at the interval, with its change over the range.
function watchList() {
  const list = overviewRows(data.overview, state.interval, state.measure, state.range, state.filter);
  const { key: k, dir } = state.sort;
  return list.sort((a, b) => (k === 'world' ? a.world.localeCompare(b.world) * dir
    : a[k] === null ? (b[k] === null ? a.world.localeCompare(b.world) : 1) : b[k] === null ? -1 : (a[k] - b[k]) * dir));
}

function drawWatchlist() {
  if (!data.index) return;
  const list = watchList();
  $('worldCount').textContent = fmt(list.length);
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
}

/* ----------------------------------------------------------------- details */
function showDetails() {
  const p = view.last, s = view.summary, change = rangeChange(view.periods, field(), state.range);
  $('detailsWorld').textContent = state.world;
  $('detailMeta').innerHTML = metaOf(state.world);
  $('detailLast').textContent = p ? gold(p.rate[field()]) : 'N/A';
  $('detailLastLabel').textContent = `${MEASURES[state.measure].name} per day`;
  $('detailChange').innerHTML = change ? `${signedDelta(change.delta)} ${signedRatio(change.ratio)}` : '';
  $('detailChangeLabel').textContent = change ? `Change ${state.range}` : `Change ${state.range}: not enough complete periods`;
  const online = data.vip?.observations.find(o => o.world === state.world && o.metric === 'characters-online');
  $('detailNote').innerHTML = (p ? `Latest complete ${UNIT[state.interval]} <span>${esc(periodLabel(p))}</span>${change ? `, against <span>${esc(periodLabel(change.from))}</span>` : ''}<br>` : '')
    + `Kill days <span>${esc(s.first)}</span> to <span>${esc(s.last)}</span>: ${fmt(s.observed)} observed, ${fmt(s.recovered)} recovered exactly, ${fmt(s.missing)} missing`
    + (online ? `<br>TibiaVIP, ${esc(data.vip.observedAt.slice(0, 10))}: <span>${fmt(online.value)}</span> characters online at one instant` : '');
  $('detailCoins').textContent = p ? gold(p.rate.directCoins) : 'N/A';
  $('detailNpc').textContent = p ? gold(p.rate.npcPotential) : 'N/A';
  $('detailCoverage').textContent = p ? pct1(p.killCoverage) : 'N/A';
  $('detailPerformance').innerHTML = RANGES.map(r => {
    const c = rangeChange(view.periods, field(), r);
    return `<button type="button" data-range="${r}" aria-pressed="${r === state.range}"><span class="perf-value ${c ? tone(c.ratio) : ''}">${c ? percent.format(c.ratio) : 'N/A'}</span><span class="perf-range">${r}</span></button>`;
  }).join('');
}

/* --------------------------------------------------------------- creatures */
// A month's creatures (contributions are kept by month): its top 30 by gross potential, the rest summed as other. The
// latest complete month until another is chosen.
function drawCreatures() {
  const months = view.contrib.months.map(m => m.month).sort().reverse();
  if (!months.length) { $('creatureMonth').innerHTML = ''; $('creatureList').innerHTML = ''; $('creatureNote').textContent = 'No creature contributions for this world.'; return; }
  const complete = months.filter(m => periodOf(`${m}-01`, 'month')[1] <= view.end);
  const month = state.month && months.includes(state.month) ? state.month : (complete[0] ?? months[0]);
  $('creatureMonth').innerHTML = months.map(m => `<option value="${m}"${m === month ? ' selected' : ''}>${m}${complete.includes(m) ? '' : ' (unfinished)'}</option>`).join('');
  const c = contributions(view.contrib, periodOf(`${month}-01`, 'month'));
  const total = c.total.grossPotential, name = page => data.creatures[page]?.creature ?? `#${page}`;
  $('creatureNote').textContent = `${month}: ${gold(total)} gold of gross potential from ${gold(c.total.kills)} valued kills. Each month keeps its top 30 creatures; the rest are summed as other.`;
  $('creatureList').innerHTML = c.rows.map(r => `<li><span class="eco-list-name">${esc(name(r.page))}</span><span class="eco-list-value">${gold(r.grossPotential)}</span>`
    + `<span class="eco-list-sub">${fmt(r.kills)} kills, ${gold(r.coinsPerKill)} coins and ${gold(r.npcPerKill)} NPC value per kill</span><span class="eco-list-share">${pct1(r.share)}</span></li>`).join('')
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
    <p><strong>Measured.</strong> For every creature kill in tibia.com's kill statistics, the coins and the NPC value of the loot TibiaWiki's loot statistics expect from that creature, from the sample made after the game version of that day. Kills of creatures without an applicable sample count in kill coverage and are never valued or scaled up.</p>
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
  ctx.fillText(`${state.world}: ${MEASURES[state.measure].name.toLowerCase()}, ${gold(view.last.rate[field()])} gold per day (${periodLabel(view.last)})`, pad, 32);
  ctx.fillStyle = c.text; ctx.font = `400 12px ${font}`;
  ctx.fillText(`From valued creatures, by ${UNIT[state.interval]}, range ${state.range}; kill coverage ${pct1(view.last.killCoverage)}. Not money supply; no NPC liquidation assumed${state.rate !== null ? ` (dashed: coins + ${state.rate * 100}% NPC, an assumption)` : ''}.`, pad, 52);
  ctx.drawImage(shot, pad, 64, shot.width / ratio, shot.height / ratio);
  ctx.fillText(`Tibinance / Economy. Kill statistics through ${view.end}; TibiaWiki loot statistics, CC-BY-SA.`, pad, 64 + shot.height / ratio + 28);
  const name = `tibinance-economy-${state.world.toLowerCase()}-${state.measure}-${state.interval}-${state.range.toLowerCase()}-${view.end}.png`;
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
  for (const b of $(group).querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset[attr] === value));
}
function saveUrl() {
  const p = new URLSearchParams({ world: state.world, measure: state.measure, interval: state.interval, range: state.range,
    ...(state.price ? { price: '1' } : {}), ...(state.rate !== null ? { rate: String(state.rate) } : {}), ...(state.stable ? { stable: '1' } : {}) });
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
  dock($('dock'), { key: 'tibinance.economy.dock', roomy: () => matchMedia(ROOMY).matches, onChange() {
    const days = chart.chart.timeScale().getVisibleLogicalRange();
    requestAnimationFrame(() => requestAnimationFrame(() => { if (days) chart.chart.timeScale().setVisibleLogicalRange(days); }));
  } });
  $('measure').addEventListener('click', e => { const b = e.target.closest('button'); if (b && b.dataset.measure !== state.measure) { state.measure = b.dataset.measure; draw(); } });
  $('range').addEventListener('click', e => { const r = e.target.closest('button')?.dataset.range; if (r) { state.range = r; draw(); } });
  $('detailPerformance').addEventListener('click', e => { const r = e.target.closest('button')?.dataset.range; if (r) { state.range = r; draw(); } });
  $('interval').addEventListener('click', e => {
    const i = e.target.closest('button')?.dataset.interval;
    if (!i || i === state.interval || !view) return;
    state.interval = i;
    view = buildView(view.summary, view.daily, view.contrib);
    draw();
  });
  $('priceToggle').addEventListener('click', () => { state.price = !state.price; draw(); });
  $('liquidation').addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    state.rate = b.dataset.rate === '' ? null : Number(b.dataset.rate);
    setChoice('liquidation', 'rate', b.dataset.rate);
    draw();
  });
  $('stable').addEventListener('click', () => { state.stable = !state.stable; $('stable').setAttribute('aria-pressed', String(state.stable)); draw(); });
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

function failed(error) {
  console.error(error);
  $('status').hidden = false;
  $('status').textContent = 'The economy data could not be loaded.';
  $('economy').setAttribute('aria-busy', 'false');
}

async function main() {
  [data.index, data.overview, data.market, data.results, data.sync, data.access, data.creatures, data.vip] = await Promise.all([
    json('data/economy/gold/index.json'), json('data/economy/gold/overview.json'), optional('data/market-history/tibia-coin/index.json'),
    optional('reports/economy/results.json'), optional('data/economy/sync-status.json'), optional('data/economy/population/access.json'),
    optional('data/economy/gold/creatures.json'), optional('data/economy/population/tibiavip-snapshot/2026-10-13.json')]);
  data.creatures = data.creatures?.creatures ?? {};
  setChoice('liquidation', 'rate', state.rate === null ? '' : String(state.rate));
  $('stable').setAttribute('aria-pressed', String(state.stable));
  wire();
  renderFindings();
  renderProvenance();
  await document.fonts.ready;
  await new Promise(requestAnimationFrame);
  await select(state.world);
}

main().catch(failed);
