/*
 * The Forecast history layer of the Markets chart (js/market-chart.js): up to three past editions of the Research's
 * offer scenario for the selected world and side, chosen in the Forecast history panel
 * (js/market-forecast-history.js), drawn over what the market then did.
 *
 *   path      each edition's weekly central path, in its own colour and line style (never the projection's dashes,
 *             never dots, which mark observations)
 *   band      its heuristic stress band, faint, in the same colour
 *   marker    a hairline on the day the edition became public, numbered as in the panel, at the top of the pane
 *
 * Only editions with publication evidence reach this layer; the panel never offers archived-only ones. Days after the
 * last observation that a path reaches are put on the axis one by one, so time stays proportional. Hidden, or with
 * nothing chosen, the layer draws nothing and leaves the market series untouched.
 */
import { historyAxisDays } from './forecast-archive.js?v=20261014-rebuild';

export const HISTORY_SLOTS = 3;

class HistoryPrimitive {
  constructor(k, c) {
    Object.assign(this, { k, c, paths: [] });
    const renderer = { draw: target => this.paint(target) };
    this.views = [{ zOrder: () => 'bottom', renderer: () => renderer }];
  }
  attached({ chart, series, requestUpdate }) { Object.assign(this, { chart, series, requestUpdate }); }
  detached() { this.chart = null; }
  paneViews() { return this.views; }
  updateAllViews() {}
  set(paths) { this.paths = paths; this.requestUpdate?.(); }

  paint(target) {
    if (!this.paths.length || !this.chart) return;
    const time = this.chart.timeScale(), series = this.series, { k, c } = this;
    target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
      const { width, height } = mediaSize;
      ctx.save();
      for (const path of this.paths) {
        const color = c.history[path.slot];
        // The band: through every weekly low and high of the path.
        const edge = key => path.points.map(q => [time.timeToCoordinate(q.target), series.priceToCoordinate(q[key])])
          .filter(([x, y]) => x !== null && y !== null);
        const high = edge('high'), low = edge('low').reverse();
        if (high.length > 1) {
          ctx.beginPath();
          [...high, ...low].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.closePath();
          ctx.globalAlpha = 0.09;
          ctx.fillStyle = color;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
        // The publication: a hairline on the day it became public, numbered at the top (staggered, so editions a day
        // apart stay readable).
        const x = time.timeToCoordinate(path.published.at.slice(0, 10));
        if (x === null || x < 0 || x > width) continue;
        const px = Math.round(x) + 0.5, label = String(path.slot + 1), top = (6 + path.slot * 15) * k;
        ctx.strokeStyle = color;
        ctx.lineWidth = k;
        ctx.setLineDash([2 * k, 3 * k]);
        ctx.beginPath();
        ctx.moveTo(px, top + 12 * k);
        ctx.lineTo(px, height);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.font = `600 ${10 * k}px ${c.font}`;
        const w = ctx.measureText(label).width + 8 * k;
        ctx.fillStyle = color;
        ctx.fillRect(px - w / 2, top, w, 12 * k);
        ctx.fillStyle = c.canvas;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, px, top + 6.5 * k);
      }
      ctx.restore();
    });
  }
}

export const historyLayer = {
  id: 'history',
  optional: true,
  hidden: true,   // off until shown: past model output, drawn when asked for
  depth: 0.4,
  add(chart, { line, k, L }, c) {
    const styles = [L.LineStyle.LargeDashed, L.LineStyle.Dotted, L.LineStyle.SparseDotted];
    const paths = styles.map((lineStyle, i) => line({ color: c.history[i], lineWidth: 2 * k, lineStyle }));
    const part = { paths, primitive: new HistoryPrimitive(k, c), shown: null };
    paths[0].attachPrimitive(part.primitive);
    return part;
  },
  draw(part, view, side, c, { visible = true } = {}) {
    const history = visible && view.history?.side === side ? view.history : null;
    const drawn = history?.paths ?? [];
    part.shown = drawn.length ? { paths: drawn, world: view.summary?.world, side } : null;
    // Past the last observation, every day a path reaches is on the axis (on the first path's series).
    const axis = drawn.length ? historyAxisDays(drawn, view.end) : [];
    part.paths.forEach((s, slot) => {
      const path = drawn.find(p => p.slot === slot);
      const points = path ? path.points.filter(q => q.base != null).map(q => ({ time: q.target, value: q.base })) : [];
      const whitespace = slot === 0 ? axis.filter(day => !points.some(p => p.time === day)).map(time => ({ time })) : [];
      s.setData([...points, ...whitespace].sort((a, b) => (a.time < b.time ? -1 : 1)));
    });
    part.primitive.set(drawn);
  },
  keys: () => [],
  // What an exported image says: each drawn edition, when it was published and on what evidence, and its band.
  notes: (part, c, { fmt, offer, through }) => part.shown && { lines: part.shown.paths.flatMap(p => {
    const shown = p.points.filter(q => !through || q.target <= through), last = shown.at(-1);
    return [{ mark: 'dashed', color: c.history[p.slot], text: `${p.slot + 1}. Research offer scenario of ${p.cutoff} for ${part.shown.world}, ${offer(part.shown.side)}, `
      + `published ${p.published.at.slice(0, 10)} (${p.published.level === 'website' ? 'website deployment' : 'repository only, no website deployment recorded'})`
      + (last ? `; central ${fmt(last.base)} for the week of ${last.target}, heuristic stress band ${fmt(last.low)} to ${fmt(last.high)}.` : '; no week shown.') }];
  }) }
};
