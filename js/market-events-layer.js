/*
 * The Events layer of the Markets and Economy charts (js/market-chart.js, js/economy-chart.js): a marker per event at
 * its actual day, standing on the chart's main line (the best offer, the token's close, the gold shown) with a stem to
 * its point, drawn by a pane primitive into the chart's own canvas, so the page and an exported image show the same
 * markers. Before the line is known, or where it has no value near, a marker stands at the foot of the pane. A marker carries its category's mark in its group's colour; an event lasting several days underlines
 * them. Markers that would overlap become one marker with their count (js/events.js `cluster`).
 *
 * The layer draws; it does not listen. A page subscribes to its layout (`onLayout`) to make markers inspectable
 * (js/market-events-ui.js) and marks one active (`setActive`), which then spans the chart's height. Hidden, it draws
 * nothing and reports no markers; the market series are untouched.
 */
import { cluster, exportNotes, within } from './events.js';

const HEIGHT = 14, PAD = 4, FONT = 9, FOOT = 4, LIFT = 8;   // marker size, label inset, type, gap above the foot, above the line

// One marker, centred on (x, y), in the units of `ctx` (k scales it). Shared by the chart and the exported legend.
export function drawMarker(ctx, { x, y, label, color, background, k = 1, font, active = false }) {
  const h = HEIGHT * k, w = markerWidth(ctx, label, k, font), r = h / 2;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
  ctx.fillStyle = active ? color : background;
  ctx.fill();
  ctx.lineWidth = k;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = active ? background : color;
  ctx.font = `600 ${FONT * k}px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x, y + 0.5 * k);
  ctx.restore();
  return w;
}
export function markerWidth(ctx, label, k = 1, font) {
  ctx.save();
  ctx.font = `600 ${FONT * k}px ${font}`;
  const w = Math.max(HEIGHT * k, ctx.measureText(label).width + 2 * PAD * k);
  ctx.restore();
  return w;
}

// A group's label is its category's mark, or its count; its colour is its events' group colour, or neutral.
const labelOf = events => events.length === 1 ? events[0].category.mark : String(events.length);
const colorOf = (events, c) => {
  const groups = new Set(events.map(e => e.category.group));
  return groups.size === 1 ? c.events[[...groups][0]] ?? c.ink : c.ink;
};

class EventsPrimitive {
  constructor(k, c) {
    Object.assign(this, { k, c, events: [], groups: [], active: null, listeners: new Set(), signature: '', series: null, values: [] });
    this.measure = document.createElement('canvas').getContext('2d');
    const renderer = { draw: target => this.paint(target) };
    this.views = [{ zOrder: () => 'top', renderer: () => renderer }];
  }
  attached({ chart, requestUpdate }) { this.chart = chart; this.requestUpdate = requestUpdate; }
  detached() { this.chart = null; }
  paneViews() { return this.views; }
  updateAllViews() { this.layout(); }

  set(events) { this.events = events; this.layout(); this.requestUpdate?.(); }
  // The line markers stand on: its series (for the price scale) and its [{time, value}] in time order.
  anchorTo(series, values) {
    this.series = series ?? null;
    this.values = (values ?? []).filter(v => Number.isFinite(v.value)).sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    this.layout(); this.requestUpdate?.();
  }
  // The line's value on a day: its own, or between the observations around it (as the dotted line runs), or the nearest.
  valueAt(day) {
    const v = this.values;
    if (!v.length) return null;
    let lo = 0, hi = v.length - 1;
    if (day <= v[0].time) return v[0].value;
    if (day >= v[hi].time) return v[hi].value;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; v[mid].time <= day ? (lo = mid) : (hi = mid); }
    if (v[lo].time === day) return v[lo].value;
    const t = d => Date.parse(`${d}T00:00:00Z`), f = (t(day) - t(v[lo].time)) / (t(v[hi].time) - t(v[lo].time));
    return v[lo].value + (v[hi].value - v[lo].value) * f;
  }
  setActive(key) { if (key !== this.active) { this.active = key; this.requestUpdate?.(); } }
  onLayout(listener) { this.listeners.add(listener); listener(this.groups); return () => this.listeners.delete(listener); }
  // The markers in view, as last laid out: [{key, x, width, events}] in pane pixels.
  get markers() { return this.groups; }

  // Where each event falls on the time scale now; markers outside the visible days are left out.
  layout() {
    const chart = this.chart;
    if (!chart) return;
    const time = chart.timeScale(), width = time.width(), range = time.getVisibleLogicalRange();
    const font = this.c.font, k = this.k;
    const spacing = range ? width / Math.max(1, range.to - range.from) : 0;
    const items = [];
    for (const event of this.events) {
      // Plotted at its own days, or where a chart of periods places them (at, atEnd: the periods that hold them).
      const at = event.at ?? event.start, atEnd = event.atEnd ?? event.end;
      const x = time.timeToCoordinate(at), xe = atEnd === at ? x : time.timeToCoordinate(atEnd);
      if (x === null || xe === null || xe + spacing / 2 < 0 || x - spacing / 2 > width) continue;
      items.push({ x, end: xe, width: markerWidth(this.measure, event.category.mark, k, font), event });
    }
    items.sort((a, b) => a.x - b.x);
    this.spacing = spacing;
    this.spans = new Map(items.map(i => [i.event.id, i]));
    // Whatever overlaps the days in view is marked, kept whole inside the plot: an event already under way at the
    // left edge is marked at the edge, and a marker at either edge is moved in, still covering its day.
    this.groups = cluster(items, { gap: 2 * k, bounds: [0, width], widthOf: events => markerWidth(this.measure, labelOf(events), k, font) });
    // Each marker stands on the line at its first event's day: its point (py) and its own centre (y) above it, kept
    // inside the pane; with no line, at the pane's foot.
    let pane = 0;
    try { pane = chart.paneSize(0).height; } catch { /* not laid out yet */ }
    const h = HEIGHT * k, foot = pane - FOOT * k - h / 2;
    for (const g of this.groups) {
      const day = g.events[0].at ?? g.events[0].start, value = this.series ? this.valueAt(day) : null;
      const py = value === null ? null : this.series.priceToCoordinate(value);
      g.py = py === null || py === undefined || !Number.isFinite(py) ? null : py;
      g.y = g.py === null ? foot : Math.max(h / 2 + 2 * k, Math.min(foot, g.py - LIFT * k - h / 2));
    }
    const signature = this.groups.map(g => `${g.key}@${Math.round(g.x)},${Math.round(g.y)}`).join('|');
    if (signature !== this.signature) {
      this.signature = signature;
      for (const listener of this.listeners) listener(this.groups);
    }
  }

  paint(target) {
    if (!this.groups.length) return;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const { k, c } = this, half = this.spacing / 2, h = HEIGHT * k;
      // The active marker's days, across the pane: a band for a span of days, a line for one day.
      const active = this.groups.find(g => g.key === this.active);
      for (const event of active?.events ?? []) {
        const span = this.spans.get(event.id), color = c.events[event.category.group] ?? c.ink;
        ctx.save();
        if (span.end > span.x) {
          ctx.globalAlpha = 0.1;
          ctx.fillStyle = color;
          ctx.fillRect(span.x - half, 0, span.end - span.x + 2 * half, mediaSize.height);
        } else {
          ctx.strokeStyle = color;
          ctx.lineWidth = k;
          ctx.setLineDash([3 * k, 3 * k]);
          ctx.beginPath();
          ctx.moveTo(Math.round(span.x) + 0.5, 0);
          ctx.lineTo(Math.round(span.x) + 0.5, mediaSize.height);
          ctx.stroke();
        }
        ctx.restore();
      }
      for (const g of this.groups) {
        const color = colorOf(g.events, c);
        // The stem from the marker to its point on the line, and the point.
        if (g.py !== null && g.py > g.y + h / 2) {
          ctx.save();
          ctx.strokeStyle = color; ctx.lineWidth = k; ctx.globalAlpha = 0.7;
          ctx.beginPath(); ctx.moveTo(Math.round(g.x) + 0.5, g.y + h / 2); ctx.lineTo(Math.round(g.x) + 0.5, g.py); ctx.stroke();
          ctx.globalAlpha = 1; ctx.fillStyle = color;
          ctx.beginPath(); ctx.arc(g.x, g.py, 2 * k, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      }
      // Each event of several days underlines them at the pane's foot, as a timeline: drawn by the line it would read as
      // a price.
      for (const span of this.spans.values()) {
        if (span.end <= span.x) continue;
        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = c.events[span.event.category.group] ?? c.ink;
        ctx.fillRect(span.x - half, mediaSize.height - 2 * k, span.end - span.x + 2 * half, 2 * k);
        ctx.restore();
      }
      for (const g of this.groups) {
        drawMarker(ctx, { x: g.x, y: g.y, label: labelOf(g.events), color: colorOf(g.events, c), background: c.canvas, k, font: c.font, active: g.key === this.active });
      }
    });
  }
}

export const eventsLayer = {
  id: 'events',
  optional: true,
  depth: 3,
  add: (chart, { k }, c) => {
    const primitive = new EventsPrimitive(k, c);
    chart.panes()[0].attachPrimitive(primitive);
    return primitive;
  },
  // The world's events on the days its chart spans (view.grid); none while hidden.
  draw(primitive, view, side, c, { visible = true } = {}) {
    primitive.set(visible && view.events?.length && view.grid.length ? within(view.events, view.grid[0], view.grid.at(-1)) : []);
  },
  // The exported legend names the series; what the markers mean is told under the chart (notes).
  keys: () => [],
  notes: primitive => primitive.markers.length ? exportNotes(primitive.markers.flatMap(g => g.events)) : null
};
