/*
 * Markets overview (markets-overview.html), as TradingView's /markets/ page reads a market: its summary (an index of
 * the Tibia Coin market across every active world, and the Tibia Token), highlights (gainers, losers, the most active
 * and the widest spreads), a heatmap of the worlds, the regions, every world in one table, and the events calendar.
 * Every figure comes from the Markets datasets (data/market-history/); nothing is estimated beyond what is stated.
 *
 * The index: on each server day, the median of every active world's latest Best Offer observed within the previous
 * 14 days (a world without one in that window is left out that day).
 */
import { RANGES, changeOver, rangeStart } from './market-series.js';
import { loadEvents, eventsFor, queryEvents, addEventDays } from './events.js';
import { $, esc, pill, tone, short, whole, logo, percent, summaryChart, heatmap, heatScale, sortableTable, worldSearch, sectionChips } from './tv-overview.js?v=20261014-details';

const DATA = 'data/market-history/';
const STALE = 14;
const fmt = v => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : 'N/A');
const usd = v => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 5, maximumFractionDigits: 5 }).format(v);
const dayNum = d => Date.parse(`${d}T00:00:00Z`) / 86400000;
const median = v => { const s = [...v].sort((a, b) => a - b), m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null; };
const href = world => `markets.html?world=${encodeURIComponent(world)}`;
const json = async url => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); };

// One index series per day: the median of each world's latest observation within STALE days.
function indexSeries(worlds, pick) {
  const all = worlds.map(w => ({ closes: w.bestOfferCloses, i: 0, last: null, lastDay: null }));
  const days = [...new Set(worlds.flatMap(w => w.bestOfferCloses.map(c => c[0])))].sort();
  if (!days.length) return [];
  const out = [];
  for (let d = dayNum(days[0]), end = dayNum(days.at(-1)); d <= end; d++) {
    const day = new Date(d * 86400000).toISOString().slice(0, 10), values = [];
    for (const w of all) {
      while (w.i < w.closes.length && w.closes[w.i][0] <= day) { w.last = pick(w.closes[w.i]); w.lastDay = w.closes[w.i][0]; w.i++; }
      if (w.last != null && d - dayNum(w.lastDay) <= STALE) values.push(w.last);
    }
    if (values.length >= 5) out.push({ time: day, value: median(values) });
  }
  return out;
}

async function main() {
  const [index, overview, token] = await Promise.all([json(`${DATA}tibia-coin/index.json`), json(`${DATA}tibia-coin/overview.json`),
    json(`${DATA}tibia-token/history.json`).catch(() => null)]);
  const through = index.through;
  document.querySelectorAll('[data-through]').forEach(el => { el.textContent = through; });
  const active = index.worlds.filter(w => w.status === 'active' && w.bestOfferCloses.length);
  const tx = new Map(overview.worlds.map(w => {
    const s = w.transactions, n = Math.max(s.sell.length, s.buy.length);
    let sum = 0; for (let i = Math.max(0, n - 30); i < n; i++) sum += (s.sell[i] ?? 0) + (s.buy[i] ?? 0);
    return [w.world, { last30: sum, series: s }];
  }));

  /* ---- each world's figures ---- */
  const rows = active.map(w => {
    const closes = side => w.bestOfferCloses.map(c => ({ day: c[0], value: c[side === 'sell' ? 1 : 2] }));
    const change = (range, side = 'sell') => changeOver(closes(side), rangeStart(through, range))?.ratio ?? null;
    const last = w.latestBestOffer;
    return { key: w.world, world: w.world, type: w.type, location: w.location, battleye: w.battleye, sell: last?.sell ?? null, buy: last?.buy ?? null,
      spread: last ? last.sell - last.buy : null, spreadRatio: last && last.sell ? (last.sell - last.buy) / last.sell : null, observed: last?.serverDay,
      tx: tx.get(w.world)?.last30 ?? 0, change, chg: Object.fromEntries(RANGES.map(r => [r, change(r)])), chgBuy: Object.fromEntries(RANGES.map(r => [r, change(r, 'buy')])),
      search: `${w.world} ${w.type} ${w.location}`.toLowerCase() };
  });

  /* ---- summary: the indices and the token ---- */
  const sellIndex = indexSeries(active, c => c[1]), buyIndex = indexSeries(active, c => c[2]);
  const spreadIndex = indexSeries(active, c => c[1] - c[2]);
  // Activity: every world's counters summed by day. A day fewer than 80% of the usual worlds have reported yet (the
  // latest, still arriving) would read as a fall, so it is left out.
  const activity = (() => {
    const byDay = new Map();
    for (const w of overview.worlds) {
      const s = w.transactions, n = Math.max(s.sell.length, s.buy.length);
      for (let i = 0; i < n; i++) {
        if (s.sell[i] == null && s.buy[i] == null) continue;
        const day = addEventDays(s.first, i), at = byDay.get(day) ?? { value: 0, worlds: 0 };
        at.value += (s.sell[i] ?? 0) + (s.buy[i] ?? 0); at.worlds++; byDay.set(day, at);
      }
    }
    const days = [...byDay].sort((a, b) => a[0].localeCompare(b[0]));
    const usual = median(days.slice(-60).map(([, d]) => d.worlds));
    return days.filter(([, d]) => d.worlds >= 0.8 * usual).map(([time, d]) => ({ time, value: d.value }));
  })();
  const tokenSeries = token ? token.prices.map(p => ({ time: p.day, value: p.close })) : [];
  const SYMBOLS = [
    { id: 'sell', name: 'TC Sell index', desc: 'Median Best Sell Offer, active worlds', data: sellIndex, color: '#f23645', format: fmt, unit: 'gold per TC' },
    { id: 'buy', name: 'TC Buy index', desc: 'Median Best Buy Offer, active worlds', data: buyIndex, color: '#2962ff', format: fmt, unit: 'gold per TC' },
    { id: 'spread', name: 'Spread index', desc: 'Median of Sell less Buy', data: spreadIndex, color: '#ff9800', format: fmt, unit: 'gold' },
    { id: 'activity', name: 'Market activity', desc: 'Transactions per day, every world', data: activity, color: '#089981', format: whole, unit: 'transactions' },
    ...(tokenSeries.length ? [{ id: 'tib', name: 'Tibia Token', desc: 'TIB / USD, PancakeSwap V3', data: tokenSeries, color: '#9c27b0', format: usd, unit: 'USD' }] : []),
  ];
  const chart = summaryChart($('summaryChart'));
  let current = SYMBOLS[0], range = '1Y';
  const changeOf = (s, r) => { const d = s.data; if (d.length < 2) return null; return changeOver(d.map(p => ({ day: p.time, value: p.value })), rangeStart(d.at(-1).time, r))?.ratio ?? null; };
  function showSymbol() {
    const last = current.data.at(-1), ch = changeOf(current, range);
    $('summaryName').textContent = `${current.name}: ${current.desc}`;
    $('summaryLast').textContent = last ? current.format(last.value) : 'N/A';
    $('summaryUnit').textContent = current.unit;
    $('summaryChange').innerHTML = ch == null ? '' : `<span class="${tone(ch)}">${percent.format(ch)}</span> <span class="tv-muted">${range}</span>`;
    chart?.set(current.data, { color: current.color, format: current.format });
    chart?.show(last ? rangeStart(last.time, range) : null);
    $('summaryCards').innerHTML = SYMBOLS.map(s => {
      const l = s.data.at(-1), c = changeOf(s, range);
      return `<li><button type="button" class="tv-card" data-id="${s.id}" aria-pressed="${s === current}"><span class="tv-logo-chip" style="--c:${s.color}">${esc(s.name[0])}</span>`
        + `<span class="tv-card-name">${esc(s.name)}<span class="tv-card-desc">${esc(s.desc)}</span></span>`
        + `<span class="tv-card-value">${l ? s.format(l.value) : 'N/A'}<small class="${tone(c)}">${c == null ? '' : percent.format(c)}</small></span></button></li>`;
    }).join('');
    document.querySelectorAll('#summaryRanges button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.range === range)));
  }
  $('summaryCards').addEventListener('click', e => { const id = e.target.closest('[data-id]')?.dataset.id; if (id) { current = SYMBOLS.find(s => s.id === id); showSymbol(); } });
  $('summaryRanges').addEventListener('click', e => { const r = e.target.closest('[data-range]')?.dataset.range; if (r) { range = r; showSymbol(); } });
  showSymbol();

  /* ---- highlights ---- */
  const hot = (id, list, value, sub) => {
    $(id).innerHTML = list.slice(0, 6).map(r => `<li><a href="${href(r.world)}">${logo(r.world, 'sm')}<span class="tv-row-name">${esc(r.world)}<small>${esc(r.type)}, ${esc(r.location)}</small></span>`
      + `<span class="tv-row-value">${value(r)}</span>${sub(r)}</a></li>`).join('');
  };
  const byChange = rows.filter(r => r.chg['1M'] != null);
  hot('hotGainers', [...byChange].sort((a, b) => b.chg['1M'] - a.chg['1M']), r => fmt(r.sell), r => pill(r.chg['1M']));
  hot('hotLosers', [...byChange].sort((a, b) => a.chg['1M'] - b.chg['1M']), r => fmt(r.sell), r => pill(r.chg['1M']));
  hot('hotActive', [...rows].sort((a, b) => b.tx - a.tx), r => `${whole(r.tx)} <span class="tv-muted">tx</span>`, r => pill(r.chg['1M']));
  hot('hotSpread', rows.filter(r => r.spreadRatio != null).sort((a, b) => b.spreadRatio - a.spreadRatio), r => fmt(r.spread), r => `<span class="tv-pill">${(r.spreadRatio * 100).toFixed(1)}%</span>`);

  /* ---- heatmap ---- */
  const STEPS = { '1M': [0.01, 0.03, 0.06], '3M': [0.02, 0.05, 0.1], '6M': [0.03, 0.08, 0.15], YTD: [0.03, 0.08, 0.15], '1Y': [0.05, 0.12, 0.25], All: [0.1, 0.25, 0.5] };
  const heat = { size: 'activity', range: '1M', side: 'sell' };
  const map = heatmap($('heatmap'), { steps: () => STEPS[heat.range] });
  function drawHeat() {
    map.set(rows.map(r => {
      const change = (heat.side === 'sell' ? r.chg : r.chgBuy)[heat.range];
      return { name: r.world, weight: heat.size === 'activity' ? Math.max(1, r.tx) : 1, change, href: href(r.world),
        tip: `<strong>${esc(r.world)}</strong><span class="tv-muted">${esc(r.type)}, ${esc(r.location)}</span><span>${heat.side === 'sell' ? 'Sell' : 'Buy'} ${fmt(heat.side === 'sell' ? r.sell : r.buy)}</span>`
          + `<span>${heat.range} <b class="${tone(change)}">${change == null ? 'N/A' : percent.format(change)}</b></span><span class="tv-muted">${whole(r.tx)} transactions in 30 days</span>` };
    }));
    $('heatScale').innerHTML = `<span class="tv-muted" style="background:none;color:var(--tv-text-2);min-width:0;margin-right:8px">${heat.range} change</span>${heatScale(STEPS[heat.range])}`;
  }
  for (const id of ['heatSize', 'heatRange', 'heatSide']) $(id).addEventListener('change', e => { heat[id.slice(4).toLowerCase()] = e.target.value; drawHeat(); });
  drawHeat();

  /* ---- regions ---- */
  const regions = [...Map.groupBy(rows, r => r.location)].map(([name, list]) => ({ name, list, tx: list.reduce((a, r) => a + r.tx, 0),
    sell: median(list.map(r => r.sell).filter(Number.isFinite)), chg: median(list.map(r => r.chg['1M']).filter(Number.isFinite)) }))
    .sort((a, b) => b.tx - a.tx);
  const totalTx = regions.reduce((a, r) => a + r.tx, 0) || 1;
  $('regions').innerHTML = regions.map(r => `<li><span><strong>${esc(r.name)}</strong><br><span class="tv-muted">${r.list.length} worlds, median Sell ${fmt(r.sell)}</span></span>`
    + `<span class="tv-bar"><i style="width:${(100 * r.tx / regions[0].tx).toFixed(1)}%"></i></span><span class="tv-bar-value">${whole(r.tx)} tx ${pill(r.chg)}</span>`
    + `<span class="tv-bar-share">${(100 * r.tx / totalTx).toFixed(1)}%</span></li>`).join('');

  /* ---- all worlds ---- */
  const table = sortableTable($('worldsTable'), [
    { key: 'world', label: 'World', left: true, value: r => r.world, cell: r => `<span class="tv-cell-sym">${logo(r.world, 'sm')}<span><a href="${href(r.world)}">${esc(r.world)}</a><small>${esc(r.type)}, ${esc(r.location)}</small></span></span>` },
    { key: 'sell', label: 'Sell', value: r => r.sell, cell: r => fmt(r.sell) },
    { key: 'buy', label: 'Buy', value: r => r.buy, cell: r => fmt(r.buy) },
    { key: 'spread', label: 'Spread', value: r => r.spread, cell: r => fmt(r.spread) },
    { key: 'c1m', label: 'Chg % 1M', value: r => r.chg['1M'], cell: r => pill(r.chg['1M']) },
    { key: 'c3m', label: '3M', value: r => r.chg['3M'], cell: r => pill(r.chg['3M']) },
    { key: 'c1y', label: '1Y', value: r => r.chg['1Y'], cell: r => pill(r.chg['1Y']) },
    { key: 'tx', label: 'Transactions 30D', value: r => r.tx, cell: r => whole(r.tx) },
    { key: 'be', label: 'BattlEye', value: r => r.battleye, cell: r => esc(r.battleye ?? '') },
    { key: 'observed', label: 'Observed', value: r => r.observed, cell: r => esc(r.observed ?? '') },
  ], { onOpen: world => location.assign(href(world)), initial: { key: 'tx', dir: -1 } });
  table.set(rows);
  $('worldsFilter').addEventListener('input', e => table.filter(e.target.value));
  $('worldsCount').textContent = `${rows.length} active worlds`;

  worldSearch($('pageSearch'), () => rows.map(r => ({ name: r.world, meta: `${r.type}, ${r.location}`, value: fmt(r.sell), change: r.chg['1M'] })), href);

  /* ---- events ---- */
  let events = [];
  try { events = eventsFor(await loadEvents()); } catch (error) { console.warn('Events are unavailable.', error); }
  const GROUP = { world: '#2962ff', game: '#ff9800', market: '#808080' };
  let period = 'upcoming';
  function drawEvents() {
    const today = new Date().toISOString().slice(0, 10);
    const list = queryEvents(events, { period, today }).sort((a, b) => period === 'upcoming' ? a.start.localeCompare(b.start) : b.start.localeCompare(a.start)).slice(0, 40);
    const days = Map.groupBy(list, e => e.start);
    $('calendar').innerHTML = list.length ? [...days].map(([day, evs]) => `<section class="tv-cal-day"><h3>${new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</h3><ul>`
      + evs.map(e => `<li><span class="tv-cal-when">${e.start === e.end ? esc(e.start) : `${esc(e.start)} to ${esc(e.end)}`}</span><span class="tv-cal-mark" style="--c:${GROUP[e.category.group] ?? '#808080'}" title="${esc(e.category.label)}">${esc(e.category.mark)}</span>`
        + `<span class="tv-cal-title">${esc(e.title)}<small>${esc(e.description)}</small></span><span class="tv-cal-scope">${e.worlds === 'all' ? 'All worlds' : esc(e.worlds.slice(0, 3).join(', ') + (e.worlds.length > 3 ? ` +${e.worlds.length - 3}` : ''))}</span></li>`).join('')
      + '</ul></section>').join('') : '<p class="tv-muted">No events in this view.</p>';
    document.querySelectorAll('#calendarTabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.period === period)));
  }
  $('calendarTabs').addEventListener('click', e => { const p = e.target.closest('[data-period]')?.dataset.period; if (p) { period = p; drawEvents(); } });
  drawEvents();
  sectionChips($('sectionChips'));
}

main().catch(error => {
  console.error(error);
  $('summaryName').textContent = 'The market data could not be loaded. Reload the page to try again.';
});
