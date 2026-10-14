// The Economy page: gold generation potential of one world, period by period, and every world beside it.
// Arithmetic lives in js/economy-data.js (tested); this file loads the data and draws it.
//
// Data (all static files): data/economy/gold/ (index, the world's daily file, its monthly contributions, monthly
// sums of every world, creatures), data/market-history/tibia-coin/index.json (Sell Offer closes, for the price pane
// only), data/economy/population/ (the TibiaVIP snapshot), reports/economy/results.json (findings) and
// data/economy/sync-status.json. The address holds world, period unit and period, so a view can be shared.
import { searchPicker } from './site-header.js';
import { fmt, esc } from './format.js';
import { periodOf, previousPeriod, sumPeriod, growth, series, withLiquidation, contributions, lastDay, addDays } from './economy-data.js';

const $ = id => document.getElementById(id);
const json = async path => { const r = await fetch(path); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); };
const optional = path => json(path).catch(() => null);
const gold = n => (Number.isFinite(n) ? fmt(Math.round(n)) : 'N/A');
const pct = (v, digits = 1) => (Number.isFinite(v) ? `${(100 * v).toFixed(digits)}%` : 'N/A');
const UNITS = ['day', 'week', 'month', 'quarter', 'year'];
const REPO = 'https://github.com/nesleykent/Tibinance';   // notes and methodology are read there, rendered
const INK = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const params = new URLSearchParams(location.search);
const state = { world: params.get('world') || 'Antica', unit: UNITS.includes(params.get('unit')) ? params.get('unit') : 'month',
  period: params.get('period'), rate: null, stable: false, comparableOnly: false, sort: { key: 'gross', dir: -1 } };
const data = { index: null, monthly: null, creatures: null, market: null, vip: null, results: null, sync: null, world: null, contrib: null };
let chart = null;

function address() {
  const p = new URLSearchParams({ world: state.world, unit: state.unit, ...(state.period ? { period: state.period } : {}) });
  history.replaceState(null, '', `${location.pathname}?${p}`);
}

function radio(group, attr, value) {
  for (const b of $(group).querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset[attr] === value));
}

async function loadWorld() {
  const w = data.index.worlds.find(x => x.world === state.world) ?? data.index.worlds.find(x => x.world === 'Antica');
  state.world = w.world;
  [data.world, data.contrib] = await Promise.all([json(`data/economy/gold/worlds/${w.dir}.json`), json(`data/economy/gold/contributions/${w.dir}.json`)]);
  // The latest complete period by default (an unfinished one would read as a fall); any period can be picked.
  const periods = series(data.world, state.unit).filter(p => p.covered > 0);
  if (!state.period || !periods.some(p => p.start === state.period)) state.period = (periods.findLast(p => p.complete) ?? periods.at(-1))?.start ?? null;
}

function render() {
  const w = data.world, s = data.index.worlds.find(x => x.world === state.world);
  $('ecoWorld').textContent = state.world;
  $('ecoSpan').textContent = `Kill days ${w.first} to ${lastDay(w)}: ${fmt(s.observed)} observed, ${fmt(s.recovered)} recovered exactly from weekly counts, ${fmt(s.missing)} missing. Kill coverage ${pct(s.killCoverage)}.`;
  radio('unit', 'unit', state.unit);
  radio('liquidation', 'rate', state.rate === null ? '' : String(state.rate));
  const periods = series(w, state.unit).filter(p => p.covered > 0).reverse();
  $('period').innerHTML = periods.map(p => `<option value="${p.start}"${p.start === state.period ? ' selected' : ''}>${esc(label(p, state.unit))}${p.complete ? '' : ' (incomplete)'}</option>`).join('');
  const period = periodOf(state.period, state.unit);
  renderTiles(sumPeriod(w, period), sumPeriod(w, previousPeriod(period, state.unit)));
  renderChart();
  renderContributions(period);
  renderWorlds(period);
  address();
}

// A period's name: from a period object ({start, end}) or a [start, end] pair.
function label(period, unit) {
  const start = Array.isArray(period) ? period[0] : period.start;
  const d = new Date(`${start}T00:00:00Z`);
  const month = d.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }), y = d.getUTCFullYear();
  return { day: start, week: `Week of ${start}`, month: `${month} ${y}`, quarter: `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${y}`, year: String(y) }[unit];
}

function tile(cls, title, value, sub) {
  return `<div class="eco-tile ${cls}"><span class="eco-label">${title}</span><span class="eco-value">${value}</span>${sub ? `<span class="eco-sub">${sub}</span>` : ''}</div>`;
}

function renderTiles(cur, prev) {
  const g = growth(cur, prev), gross = state.stable ? cur.grossStable : cur.grossPotential;
  const change = g.value === null ? `Change: not computed (${g.reason})` : `<span class="${g.value >= 0 ? 'eco-up' : 'eco-down'}">${g.value >= 0 ? '+' : ''}${pct(g.value)}</span> on ${esc(label(prev, state.unit))}`;
  const days = `${fmt(cur.covered)} of ${fmt(cur.days)} days with data${cur.recovered ? `, ${fmt(cur.recovered)} recovered` : ''}${cur.missing ? `, ${fmt(cur.missing)} missing` : ''}`;
  const tiles = [
    tile('gross', state.stable ? 'Gross potential, constant creature set' : 'Gross potential from valued creatures', gold(gross), state.stable ? 'Creatures valued since the first day only: changes come from kills, not newly valued creatures' : change),
    tile('coins', 'Direct coin drops', gold(cur.directCoins), 'Gold, platinum and crystal coins dropped'),
    tile('npc', 'Potential NPC conversion', gold(cur.npcPotential), 'Other loot at NPC prices: potential, not gold that entered the game'),
    tile('', 'Kill coverage', pct(cur.killCoverage), `${fmt(cur.killsValued)} of ${fmt(cur.kills)} kills valued; ${days}`),
    tile('', 'Players killed by creatures', fmt(cur.playerDeaths), 'An activity count, not a population'),
  ];
  if (state.rate !== null) tiles.splice(1, 0, tile('assumption', `Coins plus ${state.rate * 100}% of NPC potential`, gold(withLiquidation(cur, state.rate)), 'A hypothetical liquidation rate: an assumption, not an observation'));
  const vip = data.vip;
  const snapshotInPeriod = vip && vip.observedAt.slice(0, 10) >= cur.start && vip.observedAt.slice(0, 10) <= cur.end;
  const online = vip?.observations.find(o => o.world === state.world && o.metric === 'characters-online');
  tiles.push(snapshotInPeriod && online
    ? tile('', 'Characters online (TibiaVIP)', fmt(online.value), `One snapshot, ${vip.observedAt.slice(0, 16).replace('T', ' ')} UTC. A count at an instant: not combined with period totals.`)
    : tile('', 'Gold per active character', '<span class="eco-unavailable">Unavailable</span>', 'No active-population history for this period: GuildStats and TibiaVIP block automated access, and their histories are an open requirement'));
  $('tiles').innerHTML = tiles.join('');
}

function renderChart() {
  const L = window.LightweightCharts, el = $('chart');
  if (!L) { el.textContent = 'The chart library could not be loaded.'; return; }
  if (chart) { chart.remove(); chart = null; }
  chart = L.createChart(el, {
    autoSize: true,
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: INK('--muted'), fontFamily: INK('--font-ui'), fontSize: 11,
      panes: { separatorColor: INK('--line'), enableResize: false } },
    grid: { vertLines: { color: INK('--line-faint') }, horzLines: { color: INK('--line-faint') } },
    rightPriceScale: { borderVisible: false }, timeScale: { borderVisible: false },
    localization: { priceFormatter: v => fmt(Math.round(v)) },
  });
  const periods = series(data.world, state.unit);
  // Only complete periods are drawn: an unfinished month or one with missing days would read as a fall. They stay in
  // the tiles and tables with their coverage.
  const point = (p, v) => (p.complete ? { time: p.start, value: v } : { time: p.start });
  const line = (pane, color, options = {}) => chart.addSeries(L.LineSeries, { color, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, ...options }, pane);
  line(0, INK('--coins')).setData(periods.map(p => point(p, p.directCoins)));
  line(0, INK('--npc')).setData(periods.map(p => point(p, p.npcPotential)));
  line(0, INK('--gross'), { lineWidth: 3 }).setData(periods.map(p => point(p, state.stable ? p.grossStable : p.grossPotential)));
  if (state.rate !== null) line(0, INK('--caution'), { lineStyle: 2 }).setData(periods.map(p => point(p, withLiquidation(p, state.rate))));
  // The Tibia Coin Sell Offer, median of daily closes per period: its own pane and scale (gold per coin).
  const closes = data.market?.worlds.find(m => m.world === state.world)?.bestOfferCloses ?? [];
  if (closes.length) {
    const byPeriod = new Map();
    for (const [day, sell] of closes) { const k = periodOf(day, state.unit)[0]; if (!byPeriod.has(k)) byPeriod.set(k, []); byPeriod.get(k).push(sell); }
    const median = v => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    line(1, INK('--sell')).setData([...byPeriod].sort().map(([time, v]) => ({ time, value: median(v) })));
  }
  line(2, INK('--muted'), { lineWidth: 1 }).setData(periods.map(p => point(p, p.playerDeaths)));
  const panes = chart.panes();
  // Gold three parts, price and activity one part each (pane stretch factors; heights follow the container).
  [3, 1, 0.8].forEach((f, i) => panes[i]?.setStretchFactor?.(f));
  chart.timeScale().fitContent();
  const unit = { day: 'day', week: 'week', month: 'month', quarter: 'quarter', year: 'year' }[state.unit];
  $('legend').innerHTML = `<span class="eco-key gross">Gross potential${state.stable ? ', constant set' : ''}</span><span class="eco-key coins">Direct coins</span><span class="eco-key npc">NPC potential</span>`
    + (state.rate !== null ? `<span class="eco-key assumption" style="color:var(--caution)">Coins + ${state.rate * 100}% NPC (assumption)</span>` : '')
    + `<span class="eco-key" style="color:var(--sell)">TC Sell Offer, gold per coin</span><span class="eco-key" style="color:var(--muted)">Players killed by creatures</span>`;
  $('chart').setAttribute('aria-label', `Gold generation potential of ${state.world} per ${unit}, with the Tibia Coin Sell Offer and players killed by creatures in separate panes. Periods with missing or unfinished days are not drawn.`);
}

async function renderContributions(period) {
  if (!data.creatures) data.creatures = (await optional('data/economy/gold/creatures.json'))?.creatures ?? {};
  // Contributions are kept by month: a day or week shows the month that holds it, compared with the month before; a
  // quarter or year with the one before. The change is computed only when both ranges have every day.
  const unit = state.unit === 'day' || state.unit === 'week' ? 'month' : state.unit;
  const range = unit === 'month' ? periodOf(period[0], 'month') : period, previous = previousPeriod(range, unit);
  const c = contributions(data.contrib, range);
  const prev = contributions(data.contrib, previous);
  const comparable = sumPeriod(data.world, range).complete && sumPeriod(data.world, previous).complete;
  const before = new Map(comparable ? prev.rows.map(r => [r.page, r.grossPotential]) : []);
  const name = page => data.creatures[page]?.creature ?? `#${page}`;
  const listed = c.rows.reduce((s, r) => s + r.grossPotential, 0);
  $('contribNote').textContent = c.months.length
    ? `${c.months.length === 1 ? `Month ${c.months[0]}` : `Months ${c.months[0]} to ${c.months.at(-1)}`}${state.unit === 'day' || state.unit === 'week' ? ' (contributions are kept by month: the month that holds this period)' : ''}. The listed creatures hold ${pct(c.total.grossPotential ? listed / c.total.grossPotential : null)} of the gross potential; each month's creatures beyond its top 30 are summed as other.${comparable ? '' : ` No change is computed: this ${unit} or the one before has missing or unfinished days.`}`
    : 'No contributions in this period.';
  $('contrib').innerHTML = `<thead><tr><th>Creature</th><th class="num">Kills</th><th class="num">Coins per kill</th><th class="num">NPC per kill</th><th class="num">Gross potential</th><th class="num">Share</th><th class="num">Change on the previous ${unit}</th></tr></thead><tbody>`
    + c.rows.slice(0, 30).map(r => {
      const b = before.get(r.page);
      return `<tr><td>${esc(name(r.page))}</td><td class="num">${fmt(r.kills)}</td><td class="num">${gold(r.coinsPerKill)}</td><td class="num">${gold(r.npcPerKill)}</td><td class="num">${gold(r.grossPotential)}</td><td class="num">${pct(r.share)}</td><td class="num">${b ? pct(r.grossPotential / b - 1) : 'N/A'}</td></tr>`;
    }).join('')
    + `<tr><td>Other creatures</td><td class="num">${fmt(c.other.kills)}</td><td></td><td></td><td class="num">${gold(c.other.directCoins + c.other.npcPotential)}</td><td></td><td></td></tr></tbody>`;
}

function renderWorlds([start, end]) {
  const months = [periodOf(start, 'month')[0].slice(0, 7), periodOf(end, 'month')[0].slice(0, 7)];
  const monthly = state.unit === 'day' || state.unit === 'week' ? [start.slice(0, 7), start.slice(0, 7)] : months;
  const rows = data.index.worlds.map(w => {
    const ms = (data.monthly.worlds[w.dir] ?? []).filter(m => m[0] >= monthly[0] && m[0] <= monthly[1]);
    const sum = ms.reduce((a, m) => ({ dc: a.dc + m[1], np: a.np + m[2], k: a.k + m[3], kv: a.kv + m[4], covered: a.covered + m[5], days: a.days + m[6] }), { dc: 0, np: 0, k: 0, kv: 0, covered: 0, days: 0 });
    const span = Math.round((Date.parse(`${addDays(`${monthly[1]}-01`, 32).slice(0, 7)}-01`) - Date.parse(`${monthly[0]}-01`)) / 86400000);
    const coverage = sum.k ? sum.kv / sum.k : null;
    const warnings = [];
    if (!sum.covered) warnings.push('no data');
    else {
      if (sum.covered < span) warnings.push(`${fmt(sum.covered)} of ${fmt(span)} days`);
      if (coverage !== null && coverage < 0.95) warnings.push(`kill coverage ${pct(coverage)}`);
    }
    return { world: w.world, gross: sum.dc + sum.np, dc: sum.dc, np: sum.np, kills: sum.k, coverage, covered: sum.covered, warnings, comparable: sum.covered === span && coverage >= 0.95 };
  }).filter(r => r.covered && (!state.comparableOnly || r.comparable));
  const { key, dir } = state.sort;
  rows.sort((a, b) => (key === 'world' ? a.world.localeCompare(b.world) : (a[key] ?? -Infinity) - (b[key] ?? -Infinity)) * dir);
  const head = [['world', 'World', ''], ['gross', 'Gross potential', 'num'], ['dc', 'Direct coins', 'num'], ['np', 'NPC potential', 'num'], ['kills', 'Kills', 'num'], ['coverage', 'Kill coverage', 'num']];
  $('worlds').innerHTML = `<caption class="eco-note">${esc(monthly[0] === monthly[1] ? monthly[0] : `${monthly[0]} to ${monthly[1]}`)}, whole months</caption><thead><tr>${head.map(([k, t, c]) =>
    `<th class="${c}" aria-sort="${key === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${k}">${t}</button></th>`).join('')}<th>Comparability</th></tr></thead><tbody>`
    + rows.map(r => `<tr${r.world === state.world ? ' class="current"' : ''}><td><a href="?world=${encodeURIComponent(r.world)}&unit=${state.unit}">${esc(r.world)}</a></td><td class="num">${gold(r.gross)}</td><td class="num">${gold(r.dc)}</td><td class="num">${gold(r.np)}</td><td class="num">${fmt(r.kills)}</td><td class="num">${pct(r.coverage)}</td><td class="${r.comparable ? '' : 'warn'}">${r.comparable ? 'Comparable' : esc(r.warnings.join('; '))}</td></tr>`).join('') + '</tbody>';
}

function renderFindings() {
  const R = data.results;
  if (!R) { $('findings').innerHTML = '<p>The research results are not available.</p>'; return; }
  const lv = R.levels, ch = R.changes;
  const r2 = k => (lv[k] ? lv[k].pooled.r2.toFixed(2) : 'N/A');
  // Out of sample: each gold-based specification (A to E) against the no-change forecast, at identical origins.
  const fc = R.forecasting?.byHorizon;
  const GOLD_MODELS = ['A', 'B', 'C', 'D', 'E'];
  const horizons = fc ? Object.entries(fc).map(([h, x]) => {
    const [best, b] = GOLD_MODELS.filter(m => x.models[m]).map(m => [m, x.models[m]]).sort((a, c) => a[1].maeLogPct - c[1].maeLogPct)[0];
    return { h, n: x.n, constant: x.models.constant.maeLogPct, best, mae: b.maeLogPct, beats: b.maeLogPct < x.models.constant.maeLogPct };
  }) : [];
  const forecastLine = horizons.length
    ? `${horizons.map(x => `${x.h} week${x.h === '1' ? '' : 's'} ahead, no change ${x.constant.toFixed(2)}% against the best gold-based specification (${x.best}) ${x.mae.toFixed(2)}%`).join('; ')} (mean absolute error of the log price, ${fmt(horizons[0].n)} or fewer forecasts per horizon, point-in-time gold data only). ${horizons.some(x => x.beats) ? 'A gold-based specification beats no change at some horizon; see the notes for its significance.' : 'No gold-based specification beats the no-change forecast at any horizon, so none is used in the Projections.'}`
    : 'Out-of-sample results are pending.';
  // Gold up and price down, quarter on previous quarter, in the quarters of late 2025 and 2026.
  const quarters = (R.divergenceByQuarter?.quarters ?? []).filter(q => q.quarter >= '2025Q3' && q.worlds >= 10);
  const split = quarters.filter(q => q.goldUpPriceDown > q.worlds / 2), q = x => x.quarter.replace('Q', ' Q');
  const divergenceLine = quarters.length
    ? `Quarter on quarter, gold potential rose while the Sell Offer fell in ${quarters.map(x => `${fmt(x.goldUpPriceDown)} of ${fmt(x.worlds)} worlds in ${q(x)}`).join(', ')}. ${split.length
      ? `Most worlds split only in ${split.map(q).join(' and ')}; with the constant creature set the counts are ${split.map(x => `${fmt(x.goldUpPriceDownStable)} of ${fmt(x.worlds)}`).join(' and ')}, so newly valued creatures do not explain it.`
      : 'In no quarter did most worlds split.'}`
    : `In ${fmt(R.divergence.worldsWithMajorityDivergent)} of ${fmt(R.divergence.worldsChecked)} worlds did most weeks between August 2025 and February 2026 combine rising gold potential with falling prices.`;
  $('findings').innerHTML = `
    <p><strong>Association in levels.</strong> Across ${fmt(R.meta.worlds)} worlds and ${fmt(R.meta.analysedWeeks)} world-weeks, the log of gross potential gives an R² of ${r2('ask.C')} against the log Sell Offer and ${r2('bid.C')} against the log Buy Offer (pooled); direct coins alone ${r2('ask.A')} and ${r2('bid.A')}. Most of it is between worlds: worlds that generate more gold have higher prices. Within worlds over time the share is far smaller (R² ${lv['ask.C'].withinWorld.r2Within.toFixed(2)}). Most price and gold series are not stationary, so level associations can be spurious.</p>
    <p><strong>Week-to-week changes.</strong> With world and week effects, changes in gold potential explain little of price changes (within R² at most ${Math.max(...Object.values(ch).map(x => x.r2Within)).toFixed(2)}).</p>
    <p><strong>Gold up, prices down.</strong> ${esc(divergenceLine)}</p>
    <p><strong>Forecasting.</strong> ${esc(forecastLine)}</p>
    <p>These are associations, not causes. An R² is not the share of a price "caused" by gold. Details, specifications and limits: <a href="${REPO}/tree/main/reports/economy">the economy research notes</a> and <a href="${REPO}/blob/main/docs/economy.md">the methodology</a>. An earlier estimate of about 45% is a reference here, never a target.</p>`;
}

function renderProvenance() {
  const I = data.index, sync = data.sync?.sources ?? {};
  const kills = I.killstats.map(k => `<li><a href="https://github.com/${esc(k.repo)}/tree/${esc(k.commit)}">${esc(k.repo)}</a> at ${esc(k.commit.slice(0, 7))}</li>`).join('');
  $('provenance').innerHTML = `
    <p><strong>What is measured.</strong> For every creature kill reported by tibia.com's kill statistics, the coins and the NPC value of the loot that TibiaWiki's loot statistics expect from that creature, using the sample made after the game version in force that day. Kills of creatures without an applicable sample are counted in kill coverage and never valued or scaled up. No NPC liquidation rate is assumed.</p>
    <p><strong>Not measured.</strong> Gold leaving the game (fees, NPC purchases), money supply, inflation, GDP, or what players actually sold. World transfers move wealth between worlds and are not modelled.</p>
    <p><strong>Kill statistics</strong> (read at these commits, not republished):</p><ul>${kills}</ul>
    <p><strong>Loot evidence</strong>: ${fmt(I.evidence.lootRecords)} sample records from TibiaWiki (CC-BY-SA), the latest revision ${esc(I.evidence.latestLootRevision)}; NPC prices from revision ${esc(String(I.evidence.prices?.revId))} of ${esc(I.evidence.prices?.revTimestamp ?? '')}; ${fmt(I.evidence.creatureMap.matched)} of ${fmt(I.evidence.creatureMap.races)} kill-statistics races matched to creatures.</p>
    <p><strong>Build</strong>: ${esc(I.mode.kind)}, methodology version ${esc(String(I.methodology.version))}, ${esc(I.methodology.rule)} sample rule (at least ${fmt(I.methodology.minKills)} kills preferred). A file dated D reports the kills of D minus one day.</p>
    <p><strong>Population</strong>: TibiaVIP snapshot of ${esc(data.vip?.observedAt ?? 'none')}; GuildStats history from archived pages only (sparse). Live access: GuildStats ${esc(data.sync ? '' : '')}${esc(dataAccess('guildstats'))}, TibiaVIP ${esc(dataAccess('tibiavip'))}.</p>
    <p><strong>Market data synchronised</strong>: TibiaMarket's source last updated ${esc(sync.tibiamarket?.sourceLatestUpdate ?? 'unknown')}.</p>
    <p><a href="${REPO}/blob/main/data/economy/README.md">Data files and licenses</a>; <a href="${REPO}/blob/main/docs/economy.md">methodology</a>.</p>`;
}

let access = null;
const dataAccess = id => access?.sources?.[id] ? `${access.sources[id].status} since ${access.sources[id].since.slice(0, 10)}` : 'unknown';

function wire() {
  $('unit').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.unit = b.dataset.unit; state.period = periodOf(state.period, state.unit)[0]; render(); });
  $('period').addEventListener('change', e => { state.period = e.target.value; render(); });
  $('liquidation').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.rate = b.dataset.rate === '' ? null : Number(b.dataset.rate); render(); });
  $('stable').addEventListener('change', e => { state.stable = e.target.checked; render(); });
  $('comparableOnly').addEventListener('change', e => { state.comparableOnly = e.target.checked; renderWorlds(periodOf(state.period, state.unit)); });
  $('worlds').addEventListener('click', e => {
    const b = e.target.closest('button[data-sort]'); if (!b) return;
    state.sort = { key: b.dataset.sort, dir: state.sort.key === b.dataset.sort ? -state.sort.dir : (b.dataset.sort === 'world' ? 1 : -1) };
    renderWorlds(periodOf(state.period, state.unit));
  });
}

async function main() {
  try {
    [data.index, data.monthly, data.market, data.vip, data.results, data.sync, access] = await Promise.all([
      json('data/economy/gold/index.json'), json('data/economy/gold/monthly.json'), optional('data/market-history/tibia-coin/index.json'),
      optional('data/economy/population/tibiavip-snapshot/2026-10-13.json'), optional('reports/economy/results.json'), optional('data/economy/sync-status.json'),
      optional('data/economy/population/access.json')]);
    await loadWorld();
    searchPicker($('site-world'), { id: 'world-picker', name: 'World', value: state.world,
      options: data.index.worlds.map(w => ({ value: w.world, label: w.world })),
      onPick: async world => { state.world = world; state.period = null; await loadWorld(); render(); } });
    wire();
    $('status').hidden = true;
    $('economy').hidden = false;
    render();
    renderFindings();
    renderProvenance();
  } catch (error) {
    $('status').textContent = `The economy data could not be loaded: ${error.message}`;
  }
}

main();
