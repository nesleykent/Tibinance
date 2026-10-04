/*
 * The Projections layer of the Markets chart (js/market-chart.js): the Research's offer scenario for the selected
 * world and side (js/market-projections.js), drawn so it can never be read as an observation.
 *
 *   the boundary   a hairline on the last observed day, with "Projection" at its foot; the days after it are tinted
 *   central        a dashed ink line from the last observed best offer (its first value) through the weekly points;
 *                  no dots, which mark observations
 *   band           the heuristic stress band in the side's colour, faint, widening from the last observation
 *
 * The central line is a series, so the price scale makes room for it; the band, tint and boundary are a primitive,
 * so they are in every exported image. The band does not widen the price scale: a world whose band is very wide would
 * otherwise squeeze its own history flat. Where it passes the pane it is cut at the edge; its values are in the
 * readout, the chart's description and the exported notes. Days after the last observation are put on the axis one by one, so
 * time stays proportional. Hidden or unavailable, the layer draws nothing and leaves the market series untouched.
 */
import { axisDays, exportLines } from './market-projections.js';

const LABEL = 'Projection';

class ProjectionPrimitive {
  constructor(k, c) {
    Object.assign(this, { k, c, projection: null, side: 'sell' });
    const renderer = { draw: target => this.paint(target) };
    this.views = [{ zOrder: () => 'bottom', renderer: () => renderer }];
  }
  attached({ chart, series, requestUpdate }) { Object.assign(this, { chart, series, requestUpdate }); }
  detached() { this.chart = null; }
  paneViews() { return this.views; }
  updateAllViews() {}
  set(projection, side) { this.projection = projection; this.side = side; this.requestUpdate?.(); }

  paint(target) {
    const p = this.projection;
    if (!p?.available || !this.chart) return;
    const time = this.chart.timeScale(), series = this.series, { k, c } = this;
    const x0 = time.timeToCoordinate(p.anchor.day);
    if (x0 === null) return;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const { width, height } = mediaSize, from = Math.max(0, x0);
      if (from >= width) return;
      ctx.save();
      // The projected days, tinted, so no one mistakes them for history.
      ctx.fillStyle = c.projectionRegion;
      ctx.fillRect(from, 0, width - from, height);
      // The band: from the last observation (no width there) through every weekly low and high.
      const edge = key => [{ day: p.anchor.day, v: p.anchor.value }, ...p.points.map(q => ({ day: q.day, v: q[key] }))]
        .map(q => [time.timeToCoordinate(q.day), series.priceToCoordinate(q.v)]).filter(([x, y]) => x !== null && y !== null);
      const high = edge('high'), low = edge('low').reverse();
      if (high.length > 1) {
        ctx.beginPath();
        [...high, ...low].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = c[this.side];
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // The boundary, on the last observed day, and its name at the foot of the pane.
      if (x0 >= 0) {
        ctx.strokeStyle = c.crosshair;
        ctx.lineWidth = k;
        ctx.beginPath();
        ctx.moveTo(Math.round(x0) + 0.5, 0);
        ctx.lineTo(Math.round(x0) + 0.5, height);
        ctx.stroke();
      }
      ctx.font = `400 ${10 * k}px ${c.font}`;
      const tx = from + 14 * k;
      if (tx + ctx.measureText(LABEL).width < width) {
        ctx.fillStyle = c.text;
        ctx.textBaseline = 'middle';
        ctx.fillText(LABEL, tx, height - 11 * k);
      }
      ctx.restore();
    });
  }
}

export const projectionsLayer = {
  id: 'projections',
  optional: true,
  hidden: true,   // off until shown: a scenario is model output, shown when asked for
  depth: 0.5,
  add(chart, { line, k, L }, c) {
    const part = {
      central: line({ color: c.projection, lineWidth: 2 * k, lineStyle: L.LineStyle.Dashed }),
      primitive: new ProjectionPrimitive(k, c), shown: null
    };
    part.central.attachPrimitive(part.primitive);
    return part;
  },
  draw(part, view, side, c, { visible = true } = {}) {
    const p = visible ? view.projection?.[side] : null;
    // What the image's notes will say, available or not, while the layer is shown.
    part.shown = visible && view.projection ? { projection: view.projection[side], world: view.summary?.world, side } : null;
    if (!p?.available) {
      part.central.setData([]);
      part.primitive.set(null, side);
      return;
    }
    const weeks = new Map(p.points.map(q => [q.day, q]));
    const start = { time: p.anchor.day, value: p.anchor.value };
    part.central.setData([start, ...axisDays(p).map(day => (weeks.has(day) ? { time: day, value: weeks.get(day).central } : { time: day }))]);
    part.primitive.set(p, side);
  },
  keys: () => [],
  notes: (part, c, { fmt, offer, through }) => part.shown
    && exportLines(part.shown.projection, { fmt, world: part.shown.world, side: offer(part.shown.side), through })
};
