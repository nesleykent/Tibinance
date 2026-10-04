// Token history uses completed UTC pool candles, never Tibia server days or best offers.
import { dayGrid, lineLayers } from './market-series.js';
import { eventsLayer } from './market-events-layer.js';
import { eventsFor } from './market-events.js';
export const CONTRACT = '0x111B95C2b65CbA53aB4E0AaDA12f55985045E446';
export const POOL = '0xd2acfaec0e3b556f285fbb9026ede7e87885e611';
export const tokenPrice = value => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 5, maximumFractionDigits: 5 }).format(value);
const price = {
  id: 'token-price', depth: 1,
  add(chart, { line, k, L }) {
    return { solid: line({ lineWidth: 2 * k }), dotted: line({ lineWidth: 2 * k, lineStyle: L.LineStyle.Dotted }),
      points: line({ lineVisible: false, pointMarkersVisible: true, pointMarkersRadius: 3 * k, crosshairMarkerVisible: true, lastValueVisible: true, priceLineVisible: true }) };
  },
  draw(s, view, side, c) {
    const points = view.prices.map(p => ({ time: p.day, value: p.close })), split = lineLayers(points);
    for (const series of Object.values(s)) series.applyOptions({ color: c.sell });
    s.solid.setData(split.solid); s.dotted.setData(split.dotted); s.points.setData(points);
  },
  keys: (side, c) => [{ mark: 'dot', color: c.sell, label: 'Daily close (USD / TIB)' }, { mark: 'dotted', color: c.sell, label: 'Days not observed' }]
};
const volume = {
  id: 'token-volume', depth: -1,
  add(chart, { L }) {
    const s = chart.addSeries(L.HistogramSeries, { priceScaleId: 'volume', priceLineVisible: false, lastValueVisible: false });
    s.priceScale().applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } }); return s;
  },
  draw(s, view, side, c) {
    s.applyOptions({ color: `${c.sell}40` });
    s.setData(view.grid.map(day => { const p = view.byDay.get(day); return p ? { time: day, value: p.volumeUsd } : { time: day }; }));
  },
  keys: (side, c) => [{ mark: 'bar', color: c.sell, label: 'Pool volume (USD)' }]
};
export const TOKEN_PROFILE = { layers: [price, volume, eventsLayer], priceLayer: price, format: tokenPrice,
  priceFormat: { type: 'custom', minMove: 0.00001, formatter: tokenPrice } };
export function tokenView(file, dataset) {
  if (file.asset !== 'tibia-token' || file.contract !== CONTRACT || file.pool !== POOL || file.quote !== 'USD' || file.timezone !== 'UTC') throw new Error('Unexpected TIB history identity or units.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(file.asOf) || new Date(`${file.asOf}T00:00:00Z`).toISOString().slice(0, 10) !== file.asOf) throw new Error('Invalid acquisition date.');
  let previous = '';
  for (const p of file.prices) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p.day) || new Date(`${p.day}T00:00:00Z`).toISOString().slice(0, 10) !== p.day || p.day <= previous || p.day >= file.asOf
      || ![p.open, p.high, p.low, p.close].every(v => Number.isFinite(v) && v > 0) || !Number.isFinite(p.volumeUsd) || p.volumeUsd < 0
      || p.high < Math.max(p.open, p.close, p.low) || p.low > Math.min(p.open, p.close)) throw new Error('Invalid TIB daily candle.');
    previous = p.day;
  }
  const prices = file.prices, end = prices.at(-1)?.day;
  // Only explicitly token-related events are relevant. TC world lifecycle and game events are excluded.
  const events = eventsFor(dataset, '').filter(e => /tibia token/i.test(`${e.title} ${e.description}`));
  return { prices, byDay: new Map(prices.map(p => [p.day, p])), end, grid: prices.length ? dayGrid(prices[0].day, end) : [], events, profile: TOKEN_PROFILE };
}
