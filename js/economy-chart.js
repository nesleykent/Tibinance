// One chart instance, plot and time axis. Optional price and activity comparisons have independent scales.
import { fmt, esc } from './format.js';
import { chartPeriods, brokenLine, withLiquidation, periodOf, sumPeriod } from './economy-data.js?v=20261014-rebuild';
const ink = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const value = n => Number.isFinite(n) ? fmt(Math.round(n)) : 'N/A';
const dayOf = t => typeof t === 'string' ? t : `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}`;
function pixels(name) {
  const probe = document.createElement('div');
  probe.style.cssText = `position:absolute;visibility:hidden;width:var(${name})`;
  document.body.append(probe);
  const n = probe.getBoundingClientRect().width;
  probe.remove();
  return n;
}

export function economyChart({ onPeriod }) {
  const L = window.LightweightCharts, el = document.getElementById('chart');
  let chart = null, rows = [], context = null, viewKey = null, resize = null;
  const lines = new Map();
  const selected = () => rows.find(p => p.start === context.period) ?? { ...sumPeriod(context.world, periodOf(context.period, context.unit)), sell: null, priceDays: 0 };
  const readout = p => {
    document.getElementById('chartReadout').textContent = `${p.start} to ${p.end}: gross ${value(p.grossPotential)}, direct coins ${value(p.directCoins)}, NPC potential ${value(p.npcPotential)} gold; ${p.covered} of ${p.days} days${p.complete ? '' : ' (incomplete, gold and activity not plotted)'}; kill coverage ${p.killCoverage === null ? 'N/A' : `${(100 * p.killCoverage).toFixed(1)}%`}; TC median ${value(p.sell)} gold per coin from ${p.priceDays} daily closes; players killed ${value(p.playerDeaths)}.`;
  };
  function render(world, closes, state, preserveRange = false) {
    const rangeBefore = chart?.timeScale().getVisibleLogicalRange();
    context = { ...state, world };
    rows = chartPeriods(world, closes, state.unit);
    const chosen = selected();
    readout(chosen);
    document.getElementById('chartContext').textContent = `${world.world}, per ${state.unit}. Selected ${chosen.start} to ${chosen.end}.${chosen.covered ? '' : ' No data in this period; the chart shows the available history.'} Latest-evidence reconstruction; values cover valued creatures only. Constant-set comparisons can still reflect revised loot values.`;
    document.getElementById('chartUnits').textContent = `Right axis: gold per ${state.unit} from valued creatures.`
      + (state.price ? ' Left axis: median TC Sell Offer, gold per coin; observed closes only.' : '')
      + (state.activity ? ' Bottom bars: players killed by creatures, on an independent count scale.' : '');
    for (const [id, key] of [['chartPrice', 'price'], ['chartActivity', 'activity']]) document.getElementById(id).setAttribute('aria-pressed', String(state[key]));
    document.getElementById('legend').innerHTML = '<span class="eco-key gross">Gross potential = coins + NPC</span><span class="eco-key coins">Direct coins</span><span class="eco-key npc">NPC potential</span>'
      + (state.stable ? '<span class="eco-key stable">Constant creature set</span>' : '')
      + (state.rate !== null ? `<span class="eco-key assumption">Coins + ${state.rate * 100}% NPC (assumption)</span>` : '')
      + (state.price ? '<span class="eco-key market">TC Sell Offer, left axis</span>' : '')
      + (state.activity ? '<span class="eco-key activity">Players killed, bottom bars</span>' : '');
    el.setAttribute('aria-label', `Gold generation potential of ${world.world} per ${state.unit}, one chart. ${state.price ? 'Tibia Coin Sell Offer on the left axis. ' : ''}${state.activity ? 'Players killed by creatures as bottom bars on a separate count scale. ' : ''}Incomplete periods are gaps. Exact values and coverage are in the chart table.`);
    const comparisons = [
      ...(state.stable ? [{ title: 'Constant creature set', get: p => p.grossStable }] : []),
      ...(state.rate !== null ? [{ title: `Coins + ${state.rate * 100}% NPC (assumption)`, get: p => withLiquidation(p, state.rate) }] : []),
    ];
    const extraHead = comparisons.map(c => `<th class="num">${esc(c.title)}</th>`).join('');
    const extraCells = p => comparisons.map(c => `<td class="num">${value(c.get(p))}</td>`).join('');
    document.getElementById('chartData').innerHTML = '<caption>Gold from valued creatures only; partial totals are labelled by days with data.</caption><thead><tr><th>Period</th><th class="num">Direct coins</th><th class="num">NPC potential</th><th class="num">Gross potential</th>' + extraHead + '<th>Days with data</th><th class="num">Kill coverage</th><th class="num">TC median</th><th class="num">Price days</th><th class="num">Players killed</th></tr></thead><tbody>'
      + [...rows].reverse().map(p => `<tr${p.start === state.period ? ' class="current"' : ''}><td>${esc(p.start)}</td><td class="num">${value(p.directCoins)}</td><td class="num">${value(p.npcPotential)}</td><td class="num">${value(p.grossPotential)}</td>${extraCells(p)}<td>${p.covered} / ${p.days}${p.complete ? '' : ' incomplete'}</td><td class="num">${p.killCoverage === null ? 'N/A' : `${(p.killCoverage * 100).toFixed(1)}%`}</td><td class="num">${value(p.sell)}</td><td class="num">${p.priceDays}</td><td class="num">${value(p.playerDeaths)}</td></tr>`).join('') + '</tbody>';
    if (!L) { el.textContent = 'Interactive chart unavailable. Open Chart values and coverage below.'; return; }
    const fontSize = parseFloat(getComputedStyle(document.querySelector('.eco-note')).fontSize);
    if (!chart) {
      chart = L.createChart(el, {
        width: el.clientWidth, height: el.clientHeight,
        layout: { background: { type: 'solid', color: ink('--canvas') }, textColor: ink('--muted'), fontFamily: ink('--font-ui'), fontSize },
        grid: { vertLines: { visible: false }, horzLines: { color: ink('--line-faint') } },
        rightPriceScale: { borderVisible: false }, leftPriceScale: { borderVisible: false },
        timeScale: { borderVisible: false, minBarSpacing: 0.1, rightOffset: 1 },
        localization: { locale: 'en-US', priceFormatter: value },
        crosshair: { mode: L.CrosshairMode.Normal, horzLine: { labelVisible: false, color: ink('--line-strong') }, vertLine: { color: ink('--line-strong') } },
      });
      chart.subscribeCrosshairMove(event => readout(event.time ? rows.find(r => r.start === dayOf(event.time)) ?? selected() : selected()));
      chart.subscribeClick(event => { if (event.time) onPeriod(dayOf(event.time)); });
      resize = new ResizeObserver(() => {
        const range = chart.timeScale().getVisibleLogicalRange();
        chart.resize(el.clientWidth, el.clientHeight);
        chart.applyOptions({ layout: { fontSize: parseFloat(getComputedStyle(document.querySelector('.eco-note')).fontSize) } });
        if (range) chart.timeScale().setVisibleLogicalRange(range);
      });
      resize.observe(el);
    }
    const add = (id, color, get, { scale = 'right', style = L.LineStyle.Solid, zero = false, visible = true } = {}) => {
      if (!lines.has(id)) lines.set(id, chart.addSeries(L.LineSeries, { color, priceScaleId: scale, lineWidth: pixels('--rule-strong'), lineStyle: style,
        priceLineVisible: false, lastValueVisible: false, pointMarkersVisible: true, pointMarkersRadius: pixels('--space-0'),
        ...(zero ? { autoscaleInfoProvider: base => { const info = base(); return info ? { ...info, priceRange: { ...info.priceRange, minValue: 0 } } : info; } } : {}) }));
      const s = lines.get(id); s.applyOptions({ visible }); s.setData(visible ? brokenLine(rows, get) : []);
    };
    const complete = field => p => p.complete ? p[field] : null;
    // Context bars are added first so they cannot cover the gold lines.
    if (!lines.has('activity')) lines.set('activity', chart.addSeries(L.HistogramSeries, { priceScaleId: 'activity', color: ink('--line-strong'), priceLineVisible: false, lastValueVisible: false }));
    add('gross', ink('--ink'), complete('grossPotential'), { zero: true });
    add('coins', ink('--sell'), complete('directCoins'));
    add('npc', ink('--buy'), complete('npcPotential'));
    add('stable', ink('--accent'), complete('grossStable'), { style: L.LineStyle.Dashed, visible: state.stable });
    add('scenario', ink('--caution'), p => p.complete ? withLiquidation(p, state.rate) : null, { style: L.LineStyle.Dotted, visible: state.rate !== null });
    add('price', ink('--muted'), p => p.sell, { scale: 'left', style: L.LineStyle.Dashed, visible: state.price });
    lines.get('activity').applyOptions({ visible: state.activity });
    lines.get('activity').setData(state.activity ? rows.map(p => p.complete ? { time: p.start, value: p.playerDeaths } : { time: p.start }) : []);
    chart.applyOptions({ leftPriceScale: { visible: state.price }, rightPriceScale: { scaleMargins: { top: 0.1, bottom: 0 } } });
    chart.priceScale('left').applyOptions({ scaleMargins: { top: 0.1, bottom: state.activity ? 0.25 : 0.1 } });
    chart.priceScale('activity').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    const nextKey = `${world.world}/${state.unit}/${state.period}/${state.range}`;
    if (rangeBefore && (preserveRange || nextKey === viewKey)) chart.timeScale().setVisibleLogicalRange(rangeBefore);
    if (!preserveRange && nextKey !== viewKey) {
      if (state.range === 'All' || !chosen.covered) chart.timeScale().fitContent();
      else {
        const anchor = new Date(`${state.period}T00:00:00Z`); anchor.setUTCFullYear(anchor.getUTCFullYear() - 1);
        const from = periodOf(anchor.toISOString().slice(0, 10), state.unit)[0];
        const end = rows[Math.min(rows.length - 1, rows.findIndex(p => p.start === state.period) + 1)]?.start ?? state.period;
        chart.timeScale().setVisibleRange({ from: from < rows[0].start ? rows[0].start : from, to: end });
      }
    }
    viewKey = nextKey;
  }
  return { render, destroy() { resize?.disconnect(); chart?.remove(); chart = null; } };
}
