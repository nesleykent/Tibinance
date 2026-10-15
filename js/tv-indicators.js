/*
 * Indicators computed in the browser from the chart's main line, as TradingView defines them: a simple and an
 * exponential moving average, Bollinger Bands (a simple average and its population standard deviation times a
 * multiplier) and the Relative Strength Index (Wilder's smoothing, in a pane of its own with its 70 and 30 bands).
 * They run over the observed values only, so a day without an observation is no bar to them, as a missing bar is not
 * one to TradingView. The set shown is kept in this browser for each page, and can be saved as a named template.
 */
export const INDICATORS = {
  sma: { name: 'Moving Average', short: 'MA', params: { length: 20 }, colors: ['#2962ff'] },
  ema: { name: 'Moving Average Exponential', short: 'EMA', params: { length: 20 }, colors: ['#ff9800'] },
  bb: { name: 'Bollinger Bands', short: 'BB', params: { length: 20, mult: 2 }, colors: ['#ff6d00', '#2962ff', '#2962ff'] },
  rsi: { name: 'Relative Strength Index', short: 'RSI', params: { length: 14 }, colors: ['#7e57c2'], pane: true },
};

export function sma(values, n) {
  const out = []; let sum = 0;
  values.forEach((v, i) => { sum += v.value; if (i >= n) sum -= values[i - n].value; if (i >= n - 1) out.push({ time: v.time, value: sum / n }); });
  return out;
}
export function ema(values, n) {
  const out = [], k = 2 / (n + 1); let prev = null, sum = 0;
  values.forEach((v, i) => {
    if (i < n) { sum += v.value; if (i === n - 1) { prev = sum / n; out.push({ time: v.time, value: prev }); } return; }
    prev = v.value * k + prev * (1 - k); out.push({ time: v.time, value: prev });
  });
  return out;
}
export function bollinger(values, n, mult) {
  const basis = [], upper = [], lower = [];
  for (let i = n - 1; i < values.length; i++) {
    const w = values.slice(i - n + 1, i + 1).map(v => v.value), mean = w.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - mean) ** 2, 0) / n), time = values[i].time;
    basis.push({ time, value: mean }); upper.push({ time, value: mean + mult * sd }); lower.push({ time, value: mean - mult * sd });
  }
  return { basis, upper, lower };
}
export function rsi(values, n) {
  const out = []; let gain = 0, loss = 0;
  for (let i = 1; i < values.length; i++) {
    const ch = values[i].value - values[i - 1].value, g = Math.max(ch, 0), l = Math.max(-ch, 0);
    if (i <= n) { gain += g; loss += l; if (i === n) { gain /= n; loss /= n; } else continue; }
    else { gain = (gain * (n - 1) + g) / n; loss = (loss * (n - 1) + l) / n; }
    out.push({ time: values[i].time, value: loss === 0 ? 100 : 100 - 100 / (1 + gain / loss) });
  }
  return out;
}

const STORE = page => `tibinance.tv.indicators.${page}`;
const TEMPLATES = page => `tibinance.tv.templates.${page}`;
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* this visit only */ } };

export function createIndicators({ legend, onChange }) {
  let ctx = null, chart = null, L = null, page = null;
  let list = [];   // [{ id, type, params, series: [] }]
  let hoverTime = null;

  function seriesFor(ind) {
    const spec = INDICATORS[ind.type], common = { priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false };
    if (ind.type === 'rsi') {
      const pane = chart.panes().length;
      const s = chart.addSeries(L.LineSeries, { ...common, color: spec.colors[0], lineWidth: 1, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } }, pane);
      s.createPriceLine({ price: 70, color: '#787b86', lineWidth: 1, lineStyle: L.LineStyle.Dashed, axisLabelVisible: false });
      s.createPriceLine({ price: 50, color: 'rgba(120,123,134,.5)', lineWidth: 1, lineStyle: L.LineStyle.Dotted, axisLabelVisible: false });
      s.createPriceLine({ price: 30, color: '#787b86', lineWidth: 1, lineStyle: L.LineStyle.Dashed, axisLabelVisible: false });
      chart.panes()[pane]?.setStretchFactor?.(0.3);
      return [s];
    }
    return spec.colors.map(color => chart.addSeries(L.LineSeries, { ...common, color, lineWidth: 1, lastValueVisible: false }));
  }
  function compute(ind) {
    const values = ctx.values?.() ?? [], p = ind.params;
    switch (ind.type) {
      case 'sma': return [sma(values, p.length)];
      case 'ema': return [ema(values, p.length)];
      case 'bb': { const b = bollinger(values, p.length, p.mult); return [b.basis, b.upper, b.lower]; }
      case 'rsi': return [rsi(values, p.length)];
    }
    return [];
  }
  function draw() {
    for (const ind of list) compute(ind).forEach((data, i) => ind.series[i]?.setData(data));
    showLegend();
  }
  const label = ind => `${INDICATORS[ind.type].short} ${Object.values(ind.params).join(' ')}`;
  function showLegend() {
    if (!legend) return;
    legend.innerHTML = list.map(ind => {
      const values = ind.series.map(s => {
        const data = s.data(), at = hoverTime ? data.find(d => d.time === hoverTime) : data.at(-1);
        return at?.value;
      });
      const text = values.map((v, i) => v === undefined ? '' : `<span style="color:${INDICATORS[ind.type].colors[i]}">${ind.type === 'rsi' ? v.toFixed(2) : ctx.format(v)}</span>`).join(' ');
      return ` <span class="label">${label(ind)} <button type="button" data-ind-remove="${ind.id}" aria-label="Remove ${INDICATORS[ind.type].name}" title="Remove">×</button></span> <b class="value">${text || '—'}</b> <span class="rest"></span>`;
    }).join('');
  }
  function persist() { if (page) write(STORE(page), list.map(({ type, params }) => ({ type, params }))); onChange?.(); }
  function add(type, params = INDICATORS[type].params, { save = true } = {}) {
    if (!INDICATORS[type] || !chart) return;
    const ind = { id: Math.random().toString(36).slice(2, 9), type, params: { ...params } };
    ind.series = seriesFor(ind);
    list.push(ind);
    compute(ind).forEach((data, i) => ind.series[i]?.setData(data));
    showLegend();
    if (save) persist();
  }
  function remove(id) {
    const ind = list.find(i => i.id === id);
    if (!ind) return;
    for (const s of ind.series) chart.removeSeries(s);
    list = list.filter(i => i !== ind);
    // A pane left empty goes with its indicator.
    for (const pane of [...chart.panes()].reverse()) if (pane.paneIndex() > 0 && pane.getSeries().length === 0) chart.removePane(pane.paneIndex());
    showLegend();
    persist();
  }
  legend?.addEventListener('click', e => { const id = e.target.closest('[data-ind-remove]')?.dataset.indRemove; if (id) remove(id); });

  return {
    attach(context) {
      ctx = context; chart = context.chart; L = window.LightweightCharts; page = context.page;
      for (const { type, params } of read(STORE(page), [])) add(type, params, { save: false });
      chart.subscribeCrosshairMove(p => {
        const t = p.time === undefined ? null : typeof p.time === 'string' ? p.time
          : typeof p.time === 'object' ? `${p.time.year}-${String(p.time.month).padStart(2, '0')}-${String(p.time.day).padStart(2, '0')}` : null;
        if (t !== hoverTime) { hoverTime = t; showLegend(); }
      });
    },
    refresh: draw,
    add,
    remove,
    removeAll() { [...list].forEach(i => remove(i.id)); },
    list: () => list.map(i => ({ id: i.id, type: i.type, name: INDICATORS[i.type].name, label: label(i) })),
    // Templates: the indicators shown, under a name.
    templates: () => read(TEMPLATES(page), {}),
    saveTemplate(name) {
      const all = read(TEMPLATES(page), {});
      all[name] = list.map(({ type, params }) => ({ type, params }));
      write(TEMPLATES(page), all);
    },
    applyTemplate(name) {
      const t = read(TEMPLATES(page), {})[name];
      if (!t) return;
      [...list].forEach(i => remove(i.id));
      t.forEach(({ type, params }) => add(type, params, { save: false }));
      persist();
    },
    deleteTemplate(name) { const all = read(TEMPLATES(page), {}); delete all[name]; write(TEMPLATES(page), all); },
  };
}
