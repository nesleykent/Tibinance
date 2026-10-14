// The Economy page: gold generation potential of one world, period by period, and every world beside it.
// Arithmetic lives in js/economy-data.js (tested); this file loads the data and draws it.
//
// Data (all static files): data/economy/gold/ (index, the world's daily file, its monthly contributions, monthly
// sums of every world, creatures), data/market-history/tibia-coin/index.json (Sell Offer closes, for the price pane
// only), data/economy/population/ (the TibiaVIP snapshot), reports/economy/results.json (findings) and
// data/economy/sync-status.json. The address holds world, period unit and period, so a view can be shared.
import { searchPicker } from './site-header.js';
import { fmt, esc } from './format.js';
import { periodOf, previousPeriod, sumPeriod, growth, series, withLiquidation, contributions, lastDay, monthlySums, LIQUIDATION_SCENARIOS } from './economy-data.js?v=20261014-rebuild';
import { economyChart } from './economy-chart.js?v=20261014-fix';

const $ = id => document.getElementById(id);
let requests = new AbortController();
const json = async path => { const r = await fetch(path, { signal: requests.signal }); if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`); return r.json(); };
const optional = path => json(path).catch(() => null);
const gold = n => (Number.isFinite(n) ? fmt(Math.round(n)) : 'N/A');
const pct = (v, digits = 1) => (Number.isFinite(v) ? `${(100 * v).toFixed(digits)}%` : 'N/A');
const UNITS = ['day', 'week', 'month', 'quarter', 'year'];
const REPO = 'https://github.com/nesleykent/Tibinance';   // notes and methodology are read there, rendered


const params = new URLSearchParams(location.search);
const state = { world: params.get('world') || 'Antica', unit: UNITS.includes(params.get('unit')) ? params.get('unit') : 'month',
  period: /^\d{4}-\d{2}-\d{2}$/.test(params.get('period')) && Number.isFinite(Date.parse(params.get('period'))) ? params.get('period') : null,
  rate: params.has('rate') && LIQUIDATION_SCENARIOS.includes(Number(params.get('rate'))) ? Number(params.get('rate')) : null,
  stable: params.get('stable') === '1', comparableOnly: params.get('comparable') === '1', range: params.get('range') === 'All' ? 'All' : '1Y', price: params.get('price') === '1', activity: params.get('activity') === '1', sort: { key: 'gross', dir: -1 } };
const data = { index: null, monthly: null, creatures: null, market: null, vip: null, results: null, sync: null, world: null, contrib: null };
const worldFiles = new Map();
let worldRequest = 0, comparisonRequest = 0;
let worldPicker = null, retryWorld = null, wired = false;
const cancelRequests = () => { worldRequest++; comparisonRequest++; requests.abort(); };
addEventListener('pagehide', cancelRequests);
addEventListener('beforeunload', cancelRequests);
addEventListener('pageshow', e => {
  if (!e.persisted) return;
  requests = new AbortController();
  worldFiles.clear();
  if (data.world) {
    $('economy').setAttribute('aria-busy', 'false');
    $('feedback').hidden = true; $('status').hidden = true;
    retryWorld = null; worldPicker?.set(state.world);
    render();
  } else main();
});
const chart = economyChart({ onPeriod: day => { state.period = day; render(true); } });
const dailyFile = w => {
  if (!worldFiles.has(w.dir)) worldFiles.set(w.dir, json(`data/economy/gold/worlds/${w.dir}.json`).catch(e => { worldFiles.delete(w.dir); throw e; }));
  return worldFiles.get(w.dir);
};

function viewParams(world = state.world) {
  return new URLSearchParams({ world, unit: state.unit, ...(state.period ? { period: state.period } : {}),
    ...(state.rate !== null ? { rate: state.rate } : {}), ...(state.stable ? { stable: '1' } : {}),
    ...(state.comparableOnly ? { comparable: '1' } : {}), range: state.range, ...(state.price ? { price: '1' } : {}), ...(state.activity ? { activity: '1' } : {}) });
}

function address() {
  history.replaceState(null, '', `${location.pathname}?${viewParams()}`);
}

function radio(group, attr, value) {
  for (const b of $(group).querySelectorAll('button')) { const selected = b.dataset[attr] === value; b.setAttribute('aria-checked', String(selected)); b.tabIndex = selected ? 0 : -1; }
}

function feedback(message, error = false) {
  $('feedback').hidden = false;
  $('status').hidden = false;
  $('status').textContent = message;
  $('status').toggleAttribute('data-error', error);
  $('retry').hidden = !error;
}
// WebKit can keep a now-hidden Retry button as activeElement; Chrome moves to body.
const retryFocusVacant = () => document.activeElement === document.body || document.activeElement === $('retry');

async function loadWorld(world = state.world) {
  const w = data.index.worlds.find(x => x.world === world) ?? data.index.worlds.find(x => x.world === 'Antica');
  const request = ++worldRequest;
  feedback(`Loading ${w.world}.${data.world ? ` Still showing ${data.world.world}.` : ''}`);
  $('economy').setAttribute('aria-busy', 'true');
  let file, contrib;
  try { [file, contrib] = await Promise.all([dailyFile(w), json(`data/economy/gold/contributions/${w.dir}.json`)]); }
  catch (error) { if (request !== worldRequest) return false; $('economy').setAttribute('aria-busy', 'false'); throw error; }
  if (request !== worldRequest) return false;
  // Commit the world identity and its files together. A failed/stale request must not relabel the old data.
  state.world = w.world;
  data.world = file; data.contrib = contrib;
  // The latest complete period by default (an unfinished one would read as a fall); any period can be picked.
  const periods = series(data.world, state.unit);
  if (state.period) state.period = periodOf(state.period, state.unit)[0];
  if (!state.period) state.period = (periods.findLast(p => p.complete) ?? periods.at(-1))?.start ?? null;
  $('economy').setAttribute('aria-busy', 'false');
  $('feedback').hidden = true;
  $('status').hidden = true;
  retryWorld = null;
  return true;
}

async function selectWorld(world) {
  const retryFocused = document.activeElement === $('retry');
  let loaded;
  try { loaded = await loadWorld(world); }
  catch {
    worldPicker.set(state.world);
    retryWorld = world;
    feedback(`${world} data could not be loaded. Still showing ${state.world}. Retry or choose another world.`, true);
    if (retryFocused && retryFocusVacant()) $('retry').focus();
    return;
  }
  if (!loaded) return;
  worldPicker.set(state.world); render();
  if (retryFocused && retryFocusVacant()) $('site-world').querySelector('button').focus();
}

function render(preserveChartRange = false) {
  const w = data.world, s = data.index.worlds.find(x => x.world === state.world);
  $('ecoWorld').textContent = state.world;
  $('ecoSpan').textContent = `Kill days ${w.first} to ${lastDay(w)}: ${fmt(s.observed)} observed, ${fmt(s.recovered)} recovered exactly from weekly counts, ${fmt(s.missing)} missing. Kill coverage ${pct(s.killCoverage)}.`;
  $('ecoEvidence').textContent = `${data.index.mode.kind} reconstruction; methodology ${data.index.methodology.version}. Loot evidence through ${data.index.evidence.latestLootRevision.slice(0, 10)}; NPC prices from ${data.index.evidence.prices?.revTimestamp?.slice(0, 10) ?? 'unknown'}.`;
  radio('unit', 'unit', state.unit);
  radio('liquidation', 'rate', state.rate === null ? '' : String(state.rate));
  radio('chartRange', 'range', state.range);
  $('stable').setAttribute('aria-pressed', String(state.stable));
  $('comparableOnly').setAttribute('aria-pressed', String(state.comparableOnly));
  const periods = series(w, state.unit);
  if (!periods.some(p => p.start === state.period)) periods.push(sumPeriod(w, periodOf(state.period, state.unit)));
  periods.sort((a, b) => b.start.localeCompare(a.start));
  $('period').innerHTML = periods.map(p => `<option value="${p.start}"${p.start === state.period ? ' selected' : ''}>${esc(label(p, state.unit))}${p.complete ? '' : ' (incomplete)'}</option>`).join('');
  const period = periodOf(state.period, state.unit);
  renderTiles(sumPeriod(w, period), sumPeriod(w, previousPeriod(period, state.unit)));
  chart.render(w, data.market?.worlds.find(m => m.world === state.world)?.bestOfferCloses ?? [], state, preserveChartRange);
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
  const g = growth(cur, prev), gross = cur.grossPotential;
  const change = g.value === null ? `Change: not computed (${g.reason})` : `<span class="${g.value >= 0 ? 'eco-up' : 'eco-down'}">${g.value >= 0 ? '+' : ''}${pct(g.value)}</span> on ${esc(label(prev, state.unit))}`;
  const days = `${fmt(cur.covered)} of ${fmt(cur.days)} days with data${cur.recovered ? `, ${fmt(cur.recovered)} recovered` : ''}${cur.missing ? `, ${fmt(cur.missing)} missing` : ''}`;
  const tiles = [
    tile('gross', 'Gross potential from valued creatures', gold(gross), `${change}; ${pct(cur.killCoverage)} kill coverage`),
    tile('coins', 'Direct coin drops from valued creatures', gold(cur.directCoins), `Gold, platinum and crystal coins dropped; ${pct(cur.killCoverage)} kill coverage`),
    tile('npc', 'Potential NPC conversion from valued creatures', gold(cur.npcPotential), `Other loot at NPC prices; ${pct(cur.killCoverage)} kill coverage. Potential, not observed issuance`),
    tile('', 'Kill coverage', pct(cur.killCoverage), `${gold(cur.killsValued)} of ${gold(cur.kills)} kills valued, ${gold(cur.kills === null ? null : cur.kills - cur.killsValued)} unvalued; ${days}`),
    tile('', 'Players killed by creatures', gold(cur.playerDeaths), 'An activity count, not a population'),
  ];
  if (state.stable) tiles.push(tile('stable', 'Constant creature set potential', gold(cur.grossStable), 'Only creatures valued at the start of the archive; loot values may still change with evidence. A separate comparison, not the sum of the full-set components.'));
  if (state.rate !== null) tiles.splice(1, 0, tile('assumption', `Coins plus ${state.rate * 100}% of NPC potential`, gold(withLiquidation(cur, state.rate)), 'A hypothetical liquidation rate: an assumption, not an observation'));
  const vip = data.vip;
  const snapshotInPeriod = vip && vip.observedAt.slice(0, 10) >= cur.start && vip.observedAt.slice(0, 10) <= cur.end;
  const online = vip?.observations.find(o => o.world === state.world && o.metric === 'characters-online');
  tiles.push(snapshotInPeriod && online
    ? tile('', 'Characters online (TibiaVIP)', fmt(online.value), `One snapshot, ${vip.observedAt.slice(0, 16).replace('T', ' ')} UTC. A count at an instant: not combined with period totals.`)
    : tile('', 'Gold per active character', '<span class="eco-unavailable">Unavailable</span>', 'No active-population history for this period: GuildStats and TibiaVIP block automated access, and their histories are an open requirement'));
  $('tiles').innerHTML = tiles.join('');
}

function renderContributions(period) {
  // Contributions are kept by month: a day or week shows the month that holds it, compared with the month before; a
  // quarter or year with the one before. The change is computed only when both ranges have every day.
  const unit = state.unit === 'day' || state.unit === 'week' ? 'month' : state.unit;
  const range = unit === 'month' ? periodOf(period[0], 'month') : period, previous = previousPeriod(range, unit);
  const c = contributions(data.contrib, range);
  const prev = contributions(data.contrib, previous, Infinity);
  const comparable = sumPeriod(data.world, range).complete && sumPeriod(data.world, previous).complete;
  const before = new Map(comparable ? prev.rows.filter(r => r.complete).map(r => [r.page, r.grossPotential]) : []);
  const name = page => data.creatures[page]?.creature ?? `#${page}`;
  const listed = c.rows.reduce((s, r) => s + r.grossPotential, 0);
  $('contribNote').textContent = c.months.length
    ? `${c.months.length === 1 ? `Month ${c.months[0]}` : `Months ${c.months[0]} to ${c.months.at(-1)}`}${state.unit === 'day' || state.unit === 'week' ? ' (monthly context, not the selected day or week)' : ''}. The listed creatures hold ${pct(c.total.grossPotential ? listed / c.total.grossPotential : null)} of the gross potential; each month's creatures beyond its top 30 are summed as other. A creature absent from a monthly top list has only its listed-month portion shown; its growth is unavailable. Totals may differ by a few gold from daily sums due to rounding.${comparable ? '' : ` No change is computed: this ${unit} or the one before has missing or unfinished days.`}`
    : 'No contributions in this period.';
  if (!c.months.length) { $('contrib').innerHTML = '<caption>No creature contributions available for this period.</caption>'; return; }
  $('contrib').innerHTML = `<thead><tr><th>Creature</th><th class="num">Kills</th><th class="num">Coins per kill</th><th class="num">NPC per kill</th><th class="num">Direct coins</th><th class="num">NPC potential</th><th class="num">Gross potential</th><th class="num">Share</th><th class="num">Change on the previous ${unit}</th></tr></thead><tbody>`
    + c.rows.slice(0, 30).map(r => {
      const b = r.complete ? before.get(r.page) : null;
      return `<tr><td>${esc(name(r.page))}${r.complete ? '' : ' (listed months only)'}</td><td class="num">${fmt(r.kills)}</td><td class="num">${gold(r.coinsPerKill)}</td><td class="num">${gold(r.npcPerKill)}</td><td class="num">${gold(r.directCoins)}</td><td class="num">${gold(r.npcPotential)}</td><td class="num">${gold(r.grossPotential)}</td><td class="num">${pct(r.share)}</td><td class="num">${b ? pct(r.grossPotential / b - 1) : 'N/A'}</td></tr>`;
    }).join('')
    + `<tr><td>Other creatures</td><td class="num">${fmt(c.other.kills)}</td><td></td><td></td><td class="num">${gold(c.other.directCoins)}</td><td class="num">${gold(c.other.npcPotential)}</td><td class="num">${gold(c.other.directCoins + c.other.npcPotential)}</td><td></td><td></td></tr></tbody>`;
}

async function renderWorlds(period) {
  const focusedSort = $('worlds').contains(document.activeElement) ? document.activeElement.dataset.sort : null;
  const request = ++comparisonRequest;
  const worlds = data.index.worlds;
  const daily = state.unit === 'day' || state.unit === 'week';
  const files = new Map();
  $('worlds').setAttribute('aria-busy', 'true');
  if (daily) {
    $('worlds').innerHTML = '<caption>Loading exact daily comparisons…</caption>';
    let next = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (next < worlds.length && request === comparisonRequest) {
        const w = worlds[next++];
        try { files.set(w.dir, await dailyFile(w)); } catch { files.set(w.dir, null); }
      }
    }));
  }
  if (request !== comparisonRequest) return;
  const rows = worlds.map(w => {
    const sum = daily ? (files.get(w.dir) ? sumPeriod(files.get(w.dir), period) : null) : monthlySums(data.monthly.worlds[w.dir] ?? [], period);
    const warnings = [];
    if (!sum) warnings.push('data unavailable');
    else if (!sum.covered) warnings.push('no data in this period');
    else {
      if (!sum.complete) warnings.push(`${fmt(sum.covered)} of ${fmt(sum.days)} days`);
      if (sum.killCoverage === null || sum.killCoverage < 0.95) warnings.push(`kill coverage ${pct(sum.killCoverage)}`);
    }
    return { world: w.world, gross: sum?.grossPotential ?? null, dc: sum?.directCoins ?? null, np: sum?.npcPotential ?? null,
      kills: sum?.kills ?? null, coverage: sum?.killCoverage ?? null, warnings,
      comparable: Boolean(sum?.complete && sum.killCoverage >= 0.95) };
  }).filter(r => !state.comparableOnly || r.comparable);
  const { key, dir } = state.sort;
  rows.sort((a, b) => key === 'world' ? a.world.localeCompare(b.world) * dir
    : a[key] === null ? (b[key] === null ? a.world.localeCompare(b.world) : 1) : b[key] === null ? -1 : (a[key] - b[key]) * dir);
  const head = [['world', 'World', ''], ['gross', 'Gross potential', 'num'], ['dc', 'Direct coins', 'num'], ['np', 'NPC potential', 'num'], ['kills', 'Kills', 'num'], ['coverage', 'Kill coverage', 'num']];
  $('worlds').innerHTML = `<caption class="eco-note">${esc(period[0])} to ${esc(period[1])}, ${esc(state.unit)} totals from valued creatures; ${fmt(rows.length)} of ${fmt(worlds.length)} worlds shown. Comparable means full days and at least 95% kill coverage; world age and merger lineage are not controlled.</caption><thead><tr>${head.map(([k, t, c]) =>
    `<th class="${c}" aria-sort="${key === k ? (dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${k}">${t}</button></th>`).join('')}<th>Comparability</th></tr></thead><tbody>`
    + rows.map(r => `<tr${r.world === state.world ? ' class="current"' : ''}><td><a href="?${esc(viewParams(r.world))}">${esc(r.world)}</a></td><td class="num">${gold(r.gross)}</td><td class="num">${gold(r.dc)}</td><td class="num">${gold(r.np)}</td><td class="num">${gold(r.kills)}</td><td class="num">${pct(r.coverage)}</td><td class="${r.comparable ? '' : 'warn'}">${r.comparable ? 'Comparable' : esc(r.warnings.join('; '))}</td></tr>`).join('') + '</tbody>';
  $('worlds').setAttribute('aria-busy', 'false');
  if (focusedSort && document.activeElement === document.body) $('worlds').querySelector(`[data-sort="${focusedSort}"]`)?.focus({ preventScroll: true });
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
    ? `In the archived research sample, quarter on quarter, gold potential rose while the Sell Offer fell in ${quarters.map(x => `${fmt(x.goldUpPriceDown)} of ${fmt(x.worlds)} worlds in ${q(x)}`).join(', ')}. ${split.length
      ? `Most worlds split only in ${split.map(q).join(' and ')}; with the constant creature set the counts are ${split.map(x => `${fmt(x.goldUpPriceDownStable)} of ${fmt(x.worlds)}`).join(' and ')}, so newly valued creatures do not explain it.`
      : 'In no quarter did most worlds split.'}`
    : `In ${fmt(R.divergence.worldsWithMajorityDivergent)} of ${fmt(R.divergence.worldsChecked)} worlds did most weeks between August 2025 and February 2026 combine rising gold potential with falling prices.`;
  $('findings').innerHTML = `
    <p><strong>Association in levels.</strong> Across ${fmt(R.meta.worlds)} worlds and ${fmt(R.meta.analysedWeeks)} world-weeks, the log of gross potential gives an R² of ${r2('ask.C')} against the log Sell Offer and ${r2('bid.C')} against the log Buy Offer (pooled); direct coins alone ${r2('ask.A')} and ${r2('bid.A')}. Most of it is between worlds: worlds with greater estimated gold potential tend to have higher prices. Within worlds over time the share is far smaller (R² ${lv['ask.C'].withinWorld.r2Within.toFixed(2)}). Most price and gold series are not stationary, so level associations can be spurious.</p>
    <p><strong>Week-to-week changes.</strong> With world and week effects, changes in gold potential explain little of price changes (within R² at most ${Math.max(...Object.values(ch).map(x => x.r2Within)).toFixed(2)}).</p>
    <p><strong>Gold up, prices down.</strong> ${esc(divergenceLine)}</p>
    <p><strong>Forecasting.</strong> ${esc(forecastLine)} These archived results use monthly evidence cutoffs, but undated game versions use lower date bounds and historical world metadata is incomplete. They have not met the plan’s full strict eligibility requirements.</p>
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
    <p><strong>Build</strong>: ${esc(I.mode.kind)}, methodology version ${esc(String(I.methodology.version))}, ${esc(I.methodology.rule)} sample rule (at least ${fmt(I.methodology.minKills)} kills preferred). A file dated D reports the kills of D minus one day. Undated versions use lower date bounds; descriptive reconstructions can therefore apply those samples earlier than their unknown release day. World merger lineage, dated metadata, coverage-change markers and strict historical eligibility remain incomplete and are not inferred here.</p>
    <p><strong>Population</strong>: TibiaVIP snapshot of ${esc(data.vip?.observedAt ?? 'none')}; GuildStats history from archived pages only (sparse). Live access: GuildStats ${esc(data.sync ? '' : '')}${esc(dataAccess('guildstats'))}, TibiaVIP ${esc(dataAccess('tibiavip'))}.</p>
    <p><strong>Market data synchronised</strong>: TibiaMarket's source last updated ${esc(sync.tibiamarket?.sourceLatestUpdate ?? 'unknown')}.</p>
    <p><a href="${REPO}/blob/main/data/economy/README.md">Data files and licenses</a>; <a href="${REPO}/blob/main/docs/economy.md">methodology</a>.</p>`;
}

let access = null;
const dataAccess = id => access?.sources?.[id] ? `${access.sources[id].status} since ${access.sources[id].since.slice(0, 10)}` : 'unknown';

function wire() {
  // Wide tables keep their full data. Make the scroll affordance reflect the actual rendered width.
  const tableResize = new ResizeObserver(entries => {
    for (const { target } of entries) {
      const frame = target.matches('table') ? target.parentElement : target;
      frame.previousElementSibling.hidden = frame.scrollWidth <= frame.clientWidth;
    }
  });
  for (const frame of document.querySelectorAll('.eco-table-scroll')) { tableResize.observe(frame); tableResize.observe(frame.querySelector('table')); }
  for (const id of ['unit', 'liquidation', 'chartRange']) $(id).addEventListener('keydown', e => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const buttons = [...$(id).querySelectorAll('button')], i = buttons.indexOf(e.target);
    if (i < 0) return; e.preventDefault();
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].click(); buttons[next].focus();
  });
  $('unit').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.unit = b.dataset.unit; state.period = periodOf(state.period, state.unit)[0]; render(); });
  $('period').addEventListener('change', e => { state.period = e.target.value; render(); });
  $('liquidation').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.rate = b.dataset.rate === '' ? null : Number(b.dataset.rate); render(); });
  $('stable').addEventListener('click', () => { state.stable = !state.stable; render(); });
  for (const [id, key] of [['chartPrice', 'price'], ['chartActivity', 'activity']]) $(id).addEventListener('click', () => { state[key] = !state[key]; render(true); });
  $('chartRange').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.range = b.dataset.range; render(); });
  $('comparableOnly').addEventListener('click', () => { state.comparableOnly = !state.comparableOnly; $('comparableOnly').setAttribute('aria-pressed', String(state.comparableOnly)); address(); renderWorlds(periodOf(state.period, state.unit)); });
  $('worlds').addEventListener('click', e => {
    const b = e.target.closest('button[data-sort]'); if (!b) return;
    state.sort = { key: b.dataset.sort, dir: state.sort.key === b.dataset.sort ? -state.sort.dir : (b.dataset.sort === 'world' ? 1 : -1) };
    renderWorlds(periodOf(state.period, state.unit));
  });
}

async function main(restoreFocus = false) {
  const requestController = requests;
  try {
    [data.index, data.monthly, data.market, data.vip, data.results, data.sync, access, data.creatures] = await Promise.all([
      json('data/economy/gold/index.json'), json('data/economy/gold/monthly.json'), optional('data/market-history/tibia-coin/index.json'),
      optional('data/economy/population/tibiavip-snapshot/2026-10-13.json'), optional('reports/economy/results.json'), optional('data/economy/sync-status.json'),
      optional('data/economy/population/access.json'), optional('data/economy/gold/creatures.json')]);
    data.creatures = data.creatures?.creatures ?? {};
    if (requestController !== requests || !await loadWorld()) return;
    worldPicker ??= searchPicker($('site-world'), { id: 'world-picker', name: 'World', value: state.world,
      options: data.index.worlds.map(w => ({ value: w.world, label: w.world })),
      onPick: selectWorld });
    if (!wired) { wire(); wired = true; }
    $('status').hidden = true;
    $('economy').hidden = false;
    render();
    renderFindings();
    renderProvenance();
    if (restoreFocus && retryFocusVacant()) $('site-world').querySelector('button').focus();
  } catch {
    if (requestController !== requests || requestController.signal.aborted) return;
    feedback('The economy data could not be loaded. Retry to try again.', true);
    if (restoreFocus && retryFocusVacant()) $('retry').focus();
  }
}

$('retry').addEventListener('click', () => {
  const world = retryWorld;
  if (world) selectWorld(world);
  else { feedback('Loading the economy data.'); main(true); }
});
main();
