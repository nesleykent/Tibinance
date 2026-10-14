/*
 * The Economy chart, drawn as Markets draws its own (js/market-chart.js): one pane, one time axis, the page's status
 * block over its top left. Lightweight Charts is loaded as a global by economy.html.
 *
 *   measure      the chosen quantity in gold per day: dots on complete periods, joined solid between consecutive
 *                periods and dotted across periods without every day of data; the latest marked on the price scale
 *   kills        all creature kills per day of each complete period, as bars in a short pane of their own under the
 *                gold, so the gold scale never runs below zero to make room for them
 *   stable       the constant creature set's gross potential per day, dashed (when compared)
 *   scenario     coins plus a stated share of NPC potential, dashed, an assumption (when chosen)
 *   price        the median Tibia Coin Sell Offer of each period, on the left scale (when shown)
 *
 * Unfinished and gapped periods have no value: they keep their room on the axis (whitespace) and nothing is drawn
 * for them, so a partial week never reads as a fall.
 */
const HIDDEN = 'rgba(0,0,0,0)';   // Lightweight Charts colours a segment with its first point's colour
const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const dayOf = time => typeof time === 'string' ? time
  : typeof time === 'object' ? `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
  : new Date(time * 1000).toISOString().slice(0, 10);
export const colors = () => ({ gross: token('--ink'), coins: token('--sell'), npc: token('--buy'), stable: token('--accent'),
  scenario: token('--caution'), price: token('--average') || token('--muted'), text: token('--muted'), grid: token('--line-faint'),
  rule: token('--line'), crosshair: token('--line-strong'), ink: token('--ink') });

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
    crosshair: { mode: L.CrosshairMode.Normal, vertLine: { color: c.crosshair, labelBackgroundColor: c.ink }, horzLine: { color: c.crosshair, labelBackgroundColor: c.ink } },
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
  const solid = line({ lineWidth: 2 }), dotted = line({ lineWidth: 2, lineStyle: L.LineStyle.Dotted });
  const points = line({ lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 3, crosshairMarkerVisible: true,
    lastValueVisible: true, priceLineVisible: true, priceLineWidth: 1, priceLineStyle: L.LineStyle.LargeDashed });
  // Dots shrink, then give way to the line, as more periods share the same width (as on Markets).
  chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
    if (!range) return;
    const spacing = chart.timeScale().width() / Math.max(1, range.to - range.from);
    points.applyOptions({ pointMarkersVisible: spacing >= 2, pointMarkersRadius: Math.min(3, Math.max(1.5, spacing / 2)) });
  });
  chart.subscribeCrosshairMove(p => onCrosshair?.(p.time === undefined ? null : dayOf(p.time)));
  let topFraction = null, leftShown = false;
  const whitespaceOrValue = (p, v) => (v === null || v === undefined ? { time: p.start } : { time: p.start, value: v });

  return {
    chart,
    // view: {periods, measure ('gross'|'coins'|'npc'), field, rate (liquidation or null), stable, price ([{start, sell}] or null)}
    draw(view) {
      const color = c[view.measure];
      const rows = view.periods.map(p => ({ time: p.start, value: p.rate[view.field] }));
      const layers = periodLayers(rows);
      for (const s of [solid, dotted]) s.applyOptions({ color });
      points.applyOptions({ color, priceLineColor: color });
      solid.setData(layers.solid); dotted.setData(layers.dotted); points.setData(layers.points);
      kills.applyOptions({ color: `${color}40` });
      kills.setData(view.periods.map(p => whitespaceOrValue(p, p.rate.kills)));
      stable.setData(view.stable ? view.periods.map(p => whitespaceOrValue(p, p.rate.grossStable)) : []);
      scenario.setData(view.rate === null ? [] : view.periods.map(p => whitespaceOrValue(p,
        p.rate.directCoins === null ? null : p.rate.directCoins + view.rate * p.rate.npcPotential)));
      price.setData(view.price ? view.periods.map(p => whitespaceOrValue(p, view.price.get(p.start)?.sell ?? null)) : []);
      leftShown = Boolean(view.price);
      chart.applyOptions({ leftPriceScale: { visible: leftShown } });
    },
    show(from, to) { chart.timeScale().setVisibleRange({ from, to }); },
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
