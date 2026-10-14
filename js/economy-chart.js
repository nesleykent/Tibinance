/*
 * The Economy chart, drawn as Markets draws its own (js/market-chart.js): one pane, one time axis, the page's status
 * block over its top left. Lightweight Charts is loaded as a global by economy.html.
 *
 *   measures     independent gold series, as daily averages or selected-range accumulated totals; real points
 *                are joined solid between consecutive bins and dotted across missing bins
 *   kills        all creature kills per day of each complete period, as bars in a short pane of their own under the
 *                gold, so the gold scale never runs below zero to make room for them
 *   stable       the constant creature set's gross potential per day, dashed (when compared)
 *   scenario     gold plus a stated share of NPC potential, dashed, an assumption (when chosen)
 *   price        the median Tibia Coin Sell Offer of each period, on the left scale (when shown)
 *
 * Daily averages omit incomplete bins. Accumulated gold uses available daily subtotals with coverage in the page
 * readout; wholly missing bins remain whitespace. Hidden series retain their timeline and the explored range.
 */
import { MEASURES } from './economy-data.js?v=20261014-series';

const HIDDEN = 'rgba(0,0,0,0)';   // Lightweight Charts colours a segment with its first point's colour
const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const dayOf = time => typeof time === 'string' ? time
  : typeof time === 'object' ? `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
  : new Date(time * 1000).toISOString().slice(0, 10);
// Economy's own measure tokens where the page defines them (css/tv.css), else the Market's inks.
const either = (a, b) => token(a) || token(b);
export const colors = () => ({ gross: either('--eco-gross', '--ink'), coins: either('--eco-coins', '--sell'), npc: either('--eco-npc', '--buy'), stable: token('--accent'),
  scenario: token('--caution'), price: token('--average') || token('--muted'), text: either('--tv-chart-text', '--muted'), grid: token('--line-faint'),
  rule: token('--line'), crosshair: either('--tv-crosshair', '--line-strong'), ink: token('--ink'), label: either('--tv-crosshair-label', '--ink') });

// rows: [{time, value}] for every period in order, value null where the period is not complete. Returns the layers
// over the real points only: `solid` joins neighbouring periods, `dotted` spans the periods between two values.
export function periodLayers(rows) {
  const solid = [], dotted = [], points = [];
  rows.forEach((row, i) => {
    if (row.value === null) { solid.push({ time: row.time }); dotted.push({ time: row.time }); return; }
    const nextValue = rows.slice(i + 1).findIndex(r => r.value !== null);
    const adjacent = nextValue === 0, spans = nextValue > 0;
    solid.push(adjacent ? { time: row.time, value: row.value } : { time: row.time, value: row.value, color: HIDDEN });
    dotted.push(spans ? { time: row.time, value: row.value } : { time: row.time, value: row.value, color: HIDDEN });
    points.push({ time: row.time, value: row.value });
  });
  return { solid, dotted, points };
}

export function economyChart(container, { onCrosshair } = {}) {
  const L = window.LightweightCharts, c = colors();
  if (!L) {
    container.textContent = 'Interactive chart unavailable. Open Help for chart values and coverage.';
    container.classList.add('eco-chart-unavailable');
    return null;
  }
  const axis = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });
  const chart = L.createChart(container, {
    autoSize: true,
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: c.text, fontFamily: token('--font-ui'), fontSize: 11,
      panes: { separatorColor: c.rule } },
    grid: { vertLines: { visible: false }, horzLines: { color: c.grid } },
    rightPriceScale: { borderVisible: false, entireTextOnly: true, scaleMargins: { top: 0.16, bottom: 0.06 } },
    leftPriceScale: { visible: false, borderVisible: false, entireTextOnly: true, scaleMargins: { top: 0.16, bottom: 0.06 } },
    // The library preserves the time window across container and optional-axis width changes.
    // https://tradingview.github.io/lightweight-charts/docs/api/interfaces/TimeScaleOptions#lockvisibletimerangeonresize
    timeScale: { borderVisible: false, rightOffset: 4, minBarSpacing: 0.1, lockVisibleTimeRangeOnResize: true },
    crosshair: { mode: L.CrosshairMode.Normal, vertLine: { color: c.crosshair, labelBackgroundColor: c.label }, horzLine: { color: c.crosshair, labelBackgroundColor: c.label } },
    localization: { priceFormatter: v => axis.format(v), timeFormatter: dayOf },
  });
  const line = options => chart.addSeries(L.LineSeries, { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...options });
  const kills = chart.addSeries(L.HistogramSeries, { priceLineVisible: false, lastValueVisible: false,
    priceFormat: { type: 'custom', minMove: 1, formatter: v => axis.format(v) } }, 1);
  kills.priceScale().applyOptions({ scaleMargins: { top: 0.1, bottom: 0 } });
  chart.panes()[1]?.setStretchFactor(0.22);
  const price = line({ priceScaleId: 'left', color: c.price, lineWidth: 1 });
  const stable = line({ color: c.stable, lineWidth: 2, lineStyle: L.LineStyle.Dashed });
  const scenario = line({ color: c.scenario, lineWidth: 2, lineStyle: L.LineStyle.Dashed });
  const measures = Object.fromEntries(Object.keys(MEASURES).map(k => [k, {
    solid: line({ color: c[k], lineWidth: 2 }),
    dotted: line({ color: c[k], lineWidth: 2, lineStyle: L.LineStyle.Dotted }),
    points: line({ color: c[k], lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 3, crosshairMarkerVisible: true,
      lastValueVisible: true, priceLineVisible: true, priceLineWidth: 1, priceLineStyle: L.LineStyle.LargeDashed }),
  }]));
  // 'line' | 'markers' | 'step' | 'curved', the chart style; markers show the dots.
  // The gold mode's own scale (accumulated gold is logarithmic), set when the mode changes; between changes the scale
  // is the viewer's (the terminal's %, log and auto).
  let style = 'markers', last = null, scaleFor = null;
  // Dots shrink, then give way to the line, as more periods share the same width (as on Markets).
  const markers = () => {
    const range = chart.timeScale().getVisibleLogicalRange();
    if (!range) return;
    const spacing = chart.timeScale().width() / Math.max(1, range.to - range.from);
    for (const { points } of Object.values(measures)) points.applyOptions({ pointMarkersVisible: style === 'markers' && spacing >= 2, pointMarkersRadius: Math.min(3, Math.max(1.5, spacing / 2)) });
  };
  chart.timeScale().subscribeVisibleLogicalRangeChange(markers);
  chart.subscribeCrosshairMove(p => onCrosshair?.(p.time === undefined ? null : dayOf(p.time)));
  let topFraction = null, leftShown = false;
  const whitespaceOrValue = (p, v) => (v === null || v === undefined ? { time: p.start } : { time: p.start, value: v });

  return {
    chart,
    // Gold values are either daily averages or exact-range running sums. Kills and TC keep their own units.
    draw(view) {
      last = view;
      // Replay: nothing after `until` is drawn; the periods keep their place on the axis.
      const cut = p => view.until && p.start > view.until;
      if (view.mode !== scaleFor) {
        scaleFor = view.mode;
        chart.priceScale('right').applyOptions({ mode: view.mode === 'accumulated' ? L.PriceScaleMode.Logarithmic : L.PriceScaleMode.Normal });
      }
      const color = c[view.measure];
      for (const [k, m] of Object.entries(MEASURES)) {
        const layers = periodLayers(view.periods.map(p => ({ time: p.start, value: cut(p) ? null : view.values.get(p.start)[m.field] })));
        for (const [layer, s] of Object.entries(measures[k])) {
          s.applyOptions({ visible: view.measures.includes(k) });
          s.setData(layers[layer]);
        }
      }
      kills.applyOptions({ color: `${color}40`, visible: view.kills });
      kills.setData(view.periods.map(p => whitespaceOrValue(p, cut(p) ? null : p.rate.kills)));
      stable.setData(view.stable ? view.periods.map(p => whitespaceOrValue(p, cut(p) ? null : view.values.get(p.start).grossStable)) : []);
      scenario.setData(view.rate === null ? [] : view.periods.map(p => whitespaceOrValue(p,
        cut(p) || view.values.get(p.start).directCoins === null ? null : view.values.get(p.start).directCoins + view.rate * view.values.get(p.start).npcPotential)));
      price.setData(view.price ? view.periods.map(p => whitespaceOrValue(p, cut(p) ? null : view.price.get(p.start)?.sell ?? null)) : []);
      leftShown = Boolean(view.price);
      chart.applyOptions({ leftPriceScale: { visible: leftShown } });
    },
    show(from, to) { chart.timeScale().setVisibleRange({ from, to }); },
    // The series drawings attach to and indicators read: the measure shown.
    main: () => measures[last?.measure ?? 'gross'].points,
    replay(until) { if (last) this.draw({ ...last, until: until ?? null }); },
    // The tokens again, after the theme changes.
    retheme() {
      Object.assign(c, colors());
      chart.applyOptions({ layout: { textColor: c.text, panes: { separatorColor: c.rule } }, grid: { horzLines: { color: c.grid } },
        crosshair: { vertLine: { color: c.crosshair, labelBackgroundColor: c.label }, horzLine: { color: c.crosshair, labelBackgroundColor: c.label } } });
      for (const [k, m] of Object.entries(measures)) for (const s of Object.values(m)) s.applyOptions({ color: c[k] });
      price.applyOptions({ color: c.price }); stable.applyOptions({ color: c.stable }); scenario.applyOptions({ color: c.scenario });
      if (last) this.draw(last);
    },
    setStyle(next) {
      style = next;
      const lineType = { step: L.LineType.WithSteps, curved: L.LineType.Curved }[style] ?? L.LineType.Simple;
      for (const m of Object.values(measures)) { m.solid.applyOptions({ lineType }); m.dotted.applyOptions({ lineType }); }
      markers();
    },
    // The status block stands over the chart's top: the price scale starts below it (as js/market-chart.js fitTop).
    fitTop(element) {
      if (getComputedStyle(element).position !== 'absolute') {
        element.style.marginLeft = ''; element.style.maxWidth = '';
        if (topFraction === 0.08) return;
        topFraction = 0.08;
        for (const id of ['right', 'left']) chart.priceScale(id).applyOptions({ scaleMargins: { top: 0.08, bottom: 0.06 } });
        return;
      }
      // Clear of the left scale when the TC price shows one.
      let left = 0;
      try { left = leftShown ? chart.priceScale('left').width() : 0; } catch { /* not laid out yet */ }
      element.style.marginLeft = left ? `${left + 8}px` : '';
      element.style.maxWidth = left ? `calc(100% - ${left + 8}px - var(--space-8) * 2)` : '';
      const area = container.getBoundingClientRect(), head = element.getBoundingClientRect();
      const pane = chart.panes()[0]?.getHeight() ?? (area.height - chart.timeScale().height());
      if (pane <= 0 || !head.height) return;
      const top = Math.min(0.5, Math.max(0.08, (head.bottom - area.top + 12) / pane));
      if (topFraction !== null && Math.abs(top - topFraction) < 0.004) return;
      // The top margin only grows with the head here; a narrower head lets it shrink back on the next call.
      topFraction = top;
      for (const id of ['right', 'left']) chart.priceScale(id).applyOptions({ scaleMargins: { top, bottom: 0.06 } });
    },
  };
}
