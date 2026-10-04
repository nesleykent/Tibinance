/*
 * The Markets chart: one builder for the chart on the page and for the image Export draws (js/market-export.js).
 * Lightweight Charts is loaded as a global by markets.html.
 *
 * The chart is a list of layers, in the order a legend reads them. Each layer adds its series to a chart (layers
 * of lower depth first, so beneath), draws them from a world's view for one side, names its keys for an exported
 * legend and may annotate the exported image. A layer added to LAYERS (events, projections, a comparison) is drawn
 * on the page and in every export alike; nothing else has to change.
 *
 * `scale` multiplies type, line widths and marks, so an export drawn at twice the size keeps the page's proportions.
 */
import { fmt } from './format.js';
import { lineLayers } from './market-series.js';

export const SIDES = {
  sell: { offer: 'Best Sell Offer', offers: 'Sell Offers' },
  buy: { offer: 'Best Buy Offer', offers: 'Buy Offers' }
};

const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const colors = () => ({ sell: token('--sell'), buy: token('--buy'), average: token('--average'), text: token('--muted'),
  grid: token('--line-faint'), rule: token('--line'), crosshair: token('--line-strong'), ink: token('--ink') });
// Lightweight Charts reports a day as the string it was given or as {year, month, day}.
export const dayOf = time => typeof time === 'string' ? time
  : typeof time === 'object' ? `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
  : new Date(time * 1000).toISOString().slice(0, 10);

/* ---------------------------------------------------------------- layers */
// The best offer for the selected side: its observations (dots, the latest marked across the chart and on the price
// scale), joined solid between consecutive server days and dotted across unobserved days.
const bestOffer = {
  depth: 1,
  add(chart, { line, k, L }) {
    return {
      solid: line({ lineWidth: 2 * k }),
      dotted: line({ lineWidth: 2 * k, lineStyle: L.LineStyle.Dotted }),
      points: line({ lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 3 * k, crosshairMarkerVisible: true,
        lastValueVisible: true, priceLineVisible: true, priceLineWidth: k, priceLineStyle: L.LineStyle.LargeDashed })
    };
  },
  draw(s, view, side, c) {
    const points = view.closes.map(close => ({ time: close.serverDay, value: close[side] }));
    const layers = lineLayers(points);
    s.solid.applyOptions({ color: c[side] });
    s.dotted.applyOptions({ color: c[side] });
    s.points.applyOptions({ color: c[side], priceLineColor: c[side] });
    s.solid.setData(layers.solid);
    s.dotted.setData(layers.dotted);
    s.points.setData(points);
  },
  keys: (side, c) => [{ mark: 'dot', color: c[side], label: SIDES[side].offer }, { mark: 'dotted', color: c[side], label: 'Days not observed' }]
};

// The daily average trade price for the same side, in grey, by the same rule. A day without trades has no average.
const dailyAverage = {
  depth: 0,
  add: (chart, { line, k, L }, c) => ({
    solid: line({ color: c.average, lineWidth: k }),
    dotted: line({ color: c.average, lineWidth: k, lineStyle: L.LineStyle.Dotted })
  }),
  draw(s, view, side) {
    const average = lineLayers(view.daily.filter(d => d[side]?.transactions > 0).map(d => ({ time: d.serverDay, value: d[side].averagePrice })));
    s.solid.setData(average.solid);
    s.dotted.setData(average.dotted);
  },
  keys: (side, c) => [{ mark: 'line', color: c.average, label: 'Daily average' }]
};

// Coins traded per server day on that side, as bars along the foot of the price pane on their own hidden scale, as
// part of the chart. Every server day is on the axis, so a gap takes the width of its missing days; a day without
// trades is a real zero.
const volume = {
  depth: -1,
  add(chart, { L }) {
    const s = chart.addSeries(L.HistogramSeries, { priceScaleId: 'volume', priceLineVisible: false, lastValueVisible: false,
      priceFormat: { type: 'custom', minMove: 1, formatter: v => fmt(Math.round(v)) } });
    s.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    return s;
  },
  draw(s, view, side, c) {
    s.applyOptions({ color: `${c[side]}40` });
    s.setData(view.grid.map(day => {
      const value = view.dailyByDay.get(day)?.[side]?.tcVolume;
      return value === undefined ? { time: day } : { time: day, value };
    }));
  },
  keys: (side, c) => [{ mark: 'bar', color: c[side], label: 'Volume (TC)' }]
};

// Read in this order; drawn by depth: the volume at the back, the average beneath the best offer.
export const LAYERS = [bestOffer, dailyAverage, volume];

/* ---------------------------------------------------------------- chart */
export function createMarketChart(container, { scale: k = 1, width, height } = {}) {
  const L = window.LightweightCharts, c = colors();
  const chart = L.createChart(container, {
    ...(width ? { width, height, autoSize: false } : { autoSize: true }),
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: c.text, fontFamily: token('--font-ui'), fontSize: 11 * k,
      panes: { separatorColor: c.rule, separatorHoverColor: c.crosshair }, attributionLogo: !width },
    grid: { vertLines: { visible: false }, horzLines: { color: c.grid } },
    // Room above the highest price for the status lines, and below the lowest for the volume.
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.18, bottom: 0.22 } },
    timeScale: { borderVisible: false, rightOffset: 4 },
    crosshair: { mode: L.CrosshairMode.Normal,
      vertLine: { color: c.crosshair, labelBackgroundColor: c.ink },
      horzLine: { color: c.crosshair, labelBackgroundColor: c.ink } },
    localization: { priceFormatter: v => fmt(Math.round(v)), timeFormatter: dayOf }
  });
  const line = options => chart.addSeries(L.LineSeries, { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false, ...options });
  const series = new Map();
  for (const layer of [...LAYERS].sort((a, b) => a.depth - b.depth)) series.set(layer, layer.add(chart, { line, k, L }, c));
  // Dots shrink, then give way to the line, as more days share the same width.
  chart.timeScale().subscribeVisibleLogicalRangeChange(range => {
    if (!range) return;
    const spacing = chart.timeScale().width() / Math.max(1, range.to - range.from) / k;
    series.get(bestOffer).points.applyOptions({ pointMarkersVisible: spacing >= 2, pointMarkersRadius: k * Math.min(3, Math.max(1.5, spacing / 2)) });
  });
  return {
    chart,
    draw(view, side) { LAYERS.forEach(layer => layer.draw(series.get(layer), view, side, c)); },
    keys: side => LAYERS.flatMap(layer => layer.keys(side, c)),
    annotate: (ctx, geometry) => LAYERS.forEach(layer => layer.annotate?.(ctx, { ...geometry, chart, k, c })),
  };
}
