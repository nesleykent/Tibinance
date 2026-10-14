/*
 * Economy overview (economy-overview.html), as TradingView's /markets/ page reads an economy: its headline figures
 * across every active world, a monthly chart of the whole game, a heatmap of the worlds, highlights, the regions and
 * every world in one table. Figures come from the Economy datasets (data/economy/gold/): the per-world overview the
 * Economy terminal lists, and the monthly sums built for comparisons across worlds. Gold is from valued creatures only.
 *
 * The whole game per day in a month: each world's month total divided by its days with data, summed over the worlds.
 * A change of a sum over worlds: today's sum against the sum of each world's value at the start of the range.
 */
import { $, esc, pill, tone, short, whole, logo, percent, summaryChart, heatmap, heatScale, sortableTable, worldSearch, sectionChips } from './tv-overview.js?v=20261014-details';

const RANGES = ['1M', '3M', '6M', 'YTD', '1Y', 'All'];
const MEASURE = { gross: 'Gross potential', coins: 'Direct gold', npc: 'NPC potential' };
const COLOR = { gross: '#2962ff', coins: '#ff9800', npc: '#089981', kills: '#9c27b0' };
const href = world => `economy.html?world=${encodeURIComponent(world)}`;
const json = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };
const gold = v => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : 'N/A');

// The change of a sum over worlds, from each world's own change: now against then.
function sumChange(rows, measure, range) {
  const at = RANGES.indexOf(range) + 1;
  let now = 0, then = 0;
  for (const r of rows) {
    const m = r.week?.[measure];
    if (!m || !Number.isFinite(m[0]) || !Number.isFinite(m[at]) || m[at] <= -1) continue;
    now += m[0]; then += m[0] / (1 + m[at]);
  }
  return then ? now / then - 1 : null;
}

async function main() {
  const [overview, monthly, market] = await Promise.all([json('data/economy/gold/overview.json'), json('data/economy/gold/monthly.json'),
    json('data/market-history/tibia-coin/index.json').catch(() => null)]);
  document.querySelectorAll('[data-through]').forEach(el => { el.textContent = overview.through; });
  const facts = new Map((market?.worlds ?? []).map(w => [w.world, w]));
  const at = range => RANGES.indexOf(range) + 1;
  // The overview's own aggregate row (dir 'all', every world history summed) heads the figures; the worlds are the rest.
  const all = overview.worlds.find(w => w.dir === 'all') ?? null;
  const active = overview.worlds.filter(w => w !== all && !w.ended && w.week?.gross);
  const rows = active.map(w => {
    const f = facts.get(w.world), v = k => w.week[k]?.[0] ?? null;
    return { key: w.world, world: w.world, week: w.week, type: f?.type ?? 'World', location: f?.location ?? 'Unlisted',
      gross: v('gross'), coins: v('coins'), npc: v('npc'), share: v('gross') ? v('npc') / v('gross') : null, coverage: w.week.coverage,
      chg: (k, r) => w.week[k]?.[at(r)] ?? null, search: `${w.world} ${f?.type ?? ''} ${f?.location ?? ''}`.toLowerCase() };
  });

  /* ---- the whole game, month by month ---- */
  const months = new Map();
  for (const list of Object.values(monthly.worlds)) for (const [month, coins, npc, kills, , days] of list) {
    if (!days) continue;
    // Per day (each world's month total over its days with data), and the month's totals for accumulating.
    const m = months.get(month) ?? { coins: 0, npc: 0, kills: 0, worlds: 0, coinsTotal: 0, npcTotal: 0, killsTotal: 0 };
    m.coins += coins / days; m.npc += npc / days; m.kills += kills / days; m.worlds++;
    m.coinsTotal += coins; m.npcTotal += npc; m.killsTotal += kills;
    months.set(month, m);
  }
  const series = [...months].sort((a, b) => a[0].localeCompare(b[0])).map(([month, m]) => ({ time: `${month}-01`, ...m, gross: m.coins + m.npc, grossTotal: m.coinsTotal + m.npcTotal }));
  const lastMonth = series.at(-1);
  const latestTotal = k => all?.week?.[k]?.[0] ?? rows.reduce((a, r) => a + (r[k] ?? 0), 0);
  const CARDS = [
    { id: 'gross', name: 'Gross potential', desc: 'Gold per day, every active world', value: latestTotal('gross'), measure: 'gross' },
    { id: 'coins', name: 'Direct gold', desc: 'Gold dropped per day', value: latestTotal('coins'), measure: 'coins' },
    { id: 'npc', name: 'NPC potential', desc: 'Loot sold to NPCs, per day', value: latestTotal('npc'), measure: 'npc' },
    { id: 'kills', name: 'Creature kills', desc: `Per day in ${lastMonth?.time.slice(0, 7) ?? 'the latest month'}`, value: lastMonth?.kills ?? null },
  ];
  $('statCards').innerHTML = CARDS.map(c => {
    const ch = c.measure ? all?.week?.[c.measure]?.[1] ?? sumChange(rows, c.measure, '1M') : null;
    return `<button type="button" class="tv-stat" data-id="${c.id}" aria-pressed="${c.id === 'gross'}"><span class="tv-stat-name"><i style="--c:${COLOR[c.id]}"></i>${esc(c.name)}</span>`
      + `<span class="tv-stat-value">${short(c.value)}</span><span class="tv-stat-sub">${c.measure ? `${pill(ch)} 1M` : ''}<span>${esc(c.desc)}</span></span></button>`;
  }).join('');
  $('activeWorlds').textContent = `${rows.length} active worlds, latest complete weeks through ${overview.through}`;

  const chart = summaryChart($('summaryChart'));
  // Daily averages, or as the Economy terminal accumulates: every month's total added up from the range's first month,
  // on a logarithmic scale.
  let current = 'gross', range = 'All', mode = 'daily';
  function showChart() {
    const lastTime = series.at(-1).time;
    const first = range === 'All' ? null : (() => {
      const [y, m] = lastTime.split('-').map(Number), back = { '6M': 6, YTD: m - 1, '1Y': 12 }[range];
      return new Date(Date.UTC(y, m - 1 - back, 1)).toISOString().slice(0, 10);
    })();
    const name = CARDS.find(c => c.id === current).name, worlds = series.at(-1)?.worlds, what = current === 'kills' ? 'kills' : 'gold';
    let data;
    if (mode === 'accumulated') {
      let sum = 0;
      data = series.filter(m => !first || m.time >= first).map(m => ({ time: m.time, value: (sum += m[`${current}Total`]) }));
      $('summaryName').textContent = `${name}, the whole game: accumulated since ${data[0].time.slice(0, 7)}`;
      $('summaryUnit').textContent = `${what} accumulated to ${lastTime.slice(0, 7)}, ${worlds} worlds`;
      $('summaryChange').innerHTML = `<span class="tv-muted">${range}, log scale</span>`;
    } else {
      data = series.map(m => ({ time: m.time, value: m[current] }));
      const base = first ? data.find(d => d.time >= first) : data[0], last = data.at(-1);
      const ch = base && last && base !== last ? last.value / base.value - 1 : null;
      $('summaryName').textContent = `${name}, the whole game: per day in each month`;
      $('summaryUnit').textContent = `${what} per day, ${lastTime.slice(0, 7)}, ${worlds} worlds`;
      $('summaryChange').innerHTML = ch == null ? '' : `<span class="${tone(ch)}">${percent.format(ch)}</span> <span class="tv-muted">${range}</span>`;
    }
    $('summaryLast').textContent = short(data.at(-1)?.value);
    chart?.log(mode === 'accumulated');
    chart?.set(data, { color: COLOR[current] });
    chart?.show(mode === 'accumulated' ? null : first);
    document.querySelectorAll('#summaryMode button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    document.querySelectorAll('#statCards .tv-stat').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.id === current)));
    document.querySelectorAll('#summaryRanges button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.range === range)));
  }
  $('statCards').addEventListener('click', e => { const id = e.target.closest('[data-id]')?.dataset.id; if (id) { current = id; showChart(); } });
  $('summaryRanges').addEventListener('click', e => { const r = e.target.closest('[data-range]')?.dataset.range; if (r) { range = r; showChart(); } });
  $('summaryMode').addEventListener('click', e => { const m = e.target.closest('[data-mode]')?.dataset.mode; if (m) { mode = m; showChart(); } });
  showChart();

  /* ---- heatmap ---- */
  const STEPS = { '1M': [0.02, 0.06, 0.12], '3M': [0.04, 0.1, 0.2], '6M': [0.05, 0.15, 0.3], YTD: [0.05, 0.15, 0.3], '1Y': [0.1, 0.25, 0.5], All: [0.2, 0.5, 1] };
  const heat = { measure: 'gross', range: '1M' };
  const map = heatmap($('heatmap'), { steps: () => STEPS[heat.range] });
  function drawHeat() {
    map.set(rows.map(r => {
      const change = r.chg(heat.measure, heat.range);
      return { name: r.world, weight: Math.max(1, r[heat.measure] ?? 0), change, href: href(r.world),
        tip: `<strong>${esc(r.world)}</strong><span class="tv-muted">${esc(r.type)}, ${esc(r.location)}</span><span>${MEASURE[heat.measure]} ${gold(r[heat.measure])} per day</span>`
          + `<span>${heat.range} <b class="${tone(change)}">${change == null ? 'N/A' : percent.format(change)}</b></span><span class="tv-muted">Kill coverage ${r.coverage == null ? 'N/A' : `${(100 * r.coverage).toFixed(1)}%`}</span>` };
    }));
    $('heatScale').innerHTML = `<span style="background:none;color:var(--tv-text-2);min-width:0;margin-right:8px">${heat.range} change</span>${heatScale(STEPS[heat.range])}`;
  }
  $('heatMeasure').addEventListener('change', e => { heat.measure = e.target.value; drawHeat(); });
  $('heatRange').addEventListener('change', e => { heat.range = e.target.value; drawHeat(); });
  drawHeat();

  /* ---- highlights ---- */
  const hot = (id, list, value, sub) => {
    $(id).innerHTML = list.slice(0, 6).map(r => `<li><a href="${href(r.world)}">${logo(r.world, 'sm')}<span class="tv-row-name">${esc(r.world)}<small>${esc(r.type)}, ${esc(r.location)}</small></span>`
      + `<span class="tv-row-value">${value(r)}</span>${sub(r)}</a></li>`).join('');
  };
  const moved = rows.filter(r => r.chg('gross', '1M') != null);
  hot('hotRichest', [...rows].sort((a, b) => b.gross - a.gross), r => short(r.gross), r => pill(r.chg('gross', '1M')));
  hot('hotGrowing', [...moved].sort((a, b) => b.chg('gross', '1M') - a.chg('gross', '1M')), r => short(r.gross), r => pill(r.chg('gross', '1M')));
  hot('hotShrinking', [...moved].sort((a, b) => a.chg('gross', '1M') - b.chg('gross', '1M')), r => short(r.gross), r => pill(r.chg('gross', '1M')));
  hot('hotNpc', rows.filter(r => r.share != null).sort((a, b) => b.share - a.share), r => short(r.npc), r => `<span class="tv-pill">${(100 * r.share).toFixed(1)}%</span>`);

  /* ---- regions ---- */
  const total = rows.reduce((a, r) => a + (r.gross ?? 0), 0) || 1;
  const regions = [...Map.groupBy(rows, r => r.location)].map(([name, list]) => {
    const gross = list.reduce((a, r) => a + (r.gross ?? 0), 0);
    return { name, list, gross, chg: sumChange(list, 'gross', '1M') };
  }).sort((a, b) => b.gross - a.gross);
  $('regions').innerHTML = regions.map(r => `<li><span><strong>${esc(r.name)}</strong><br><span class="tv-muted">${r.list.length} worlds</span></span>`
    + `<span class="tv-bar"><i style="width:${(100 * r.gross / regions[0].gross).toFixed(1)}%"></i></span><span class="tv-bar-value">${short(r.gross)} ${pill(r.chg)}</span>`
    + `<span class="tv-bar-share">${(100 * r.gross / total).toFixed(1)}%</span></li>`).join('');

  /* ---- all worlds ---- */
  const table = sortableTable($('worldsTable'), [
    { key: 'world', label: 'World', left: true, value: r => r.world, cell: r => `<span class="tv-cell-sym">${logo(r.world, 'sm')}<span><a href="${href(r.world)}">${esc(r.world)}</a><small>${esc(r.type)}, ${esc(r.location)}</small></span></span>` },
    { key: 'gross', label: 'Gross / day', value: r => r.gross, cell: r => gold(r.gross) },
    { key: 'coins', label: 'Gold / day', value: r => r.coins, cell: r => gold(r.coins) },
    { key: 'npc', label: 'NPC / day', value: r => r.npc, cell: r => gold(r.npc) },
    { key: 'share', label: 'NPC share', value: r => r.share, cell: r => r.share == null ? 'N/A' : `${(100 * r.share).toFixed(1)}%` },
    { key: 'c1m', label: 'Chg % 1M', value: r => r.chg('gross', '1M'), cell: r => pill(r.chg('gross', '1M')) },
    { key: 'c3m', label: '3M', value: r => r.chg('gross', '3M'), cell: r => pill(r.chg('gross', '3M')) },
    { key: 'c1y', label: '1Y', value: r => r.chg('gross', '1Y'), cell: r => pill(r.chg('gross', '1Y')) },
    { key: 'coverage', label: 'Coverage', value: r => r.coverage, cell: r => r.coverage == null ? 'N/A' : `${(100 * r.coverage).toFixed(1)}%` },
  ], { onOpen: world => location.assign(href(world)), initial: { key: 'gross', dir: -1 } });
  table.set(rows);
  $('worldsFilter').addEventListener('input', e => table.filter(e.target.value));
  $('worldsCount').textContent = `${rows.length} active worlds, weekly`;

  worldSearch($('pageSearch'), () => rows.map(r => ({ name: r.world, meta: `${r.type}, ${r.location}`, value: `${short(r.gross)} / day`, change: r.chg('gross', '1M') })), href);
  sectionChips($('sectionChips'));
}

main().catch(error => {
  console.error(error);
  $('summaryName').textContent = 'The economy data could not be loaded. Reload the page to try again.';
});
