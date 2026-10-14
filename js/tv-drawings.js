/*
 * Drawing tools on the chart, as TradingView draws them (its defaults, read from its line-tool properties: colours,
 * widths, Fibonacci levels and colours, a hit tolerance of 3px plus half the line width), kept in this browser per
 * symbol. Drawn by one Lightweight Charts series primitive over the main series, so they pan, zoom and rescale with
 * the chart, and label the price and time axes as TradingView does.
 *
 * A drawing: { id, type, points: [{ time: 'YYYY-MM-DD', price }], color, width, style (0 solid, 1 dotted, 2 dashed),
 * offset? (a channel's width, in price), text? (a text's words), hidden?, locked? }.
 *
 * Points are anchored to a time and a price, never to pixels: a time between two bars sits between them, and a time
 * past the last bar continues at the chart's interval, so drawings stay put whatever the window shows.
 */
const DAY = 86400000;
const dayNum = t => Date.parse(`${t}T00:00:00Z`) / DAY;
const dayStr = n => new Date(Math.round(n) * DAY).toISOString().slice(0, 10);
const dayOf = time => typeof time === 'string' ? time
  : typeof time === 'object' && time ? `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`
  : new Date(time * 1000).toISOString().slice(0, 10);

export const TOOLS = {
  trend: { name: 'Trend line', points: 2 },
  ray: { name: 'Ray', points: 2 },
  hline: { name: 'Horizontal line', points: 1 },
  hray: { name: 'Horizontal ray', points: 1 },
  vline: { name: 'Vertical line', points: 1 },
  crossline: { name: 'Cross line', points: 1 },
  channel: { name: 'Parallel channel', points: 3 },
  fib: { name: 'Fib retracement', points: 2 },
  rect: { name: 'Rectangle', points: 2 },
  measure: { name: 'Date and price range', points: 2 },
  text: { name: 'Text', points: 1 },
  arrowup: { name: 'Arrow mark up', points: 1 },
};
// TradingView's defaults for each tool.
const DEFAULTS = {
  trend: { color: '#2962ff', width: 2 }, ray: { color: '#2962ff', width: 2 },
  hline: { color: '#2962ff', width: 1 }, hray: { color: '#2962ff', width: 1 }, vline: { color: '#2962ff', width: 1 }, crossline: { color: '#2962ff', width: 1 },
  channel: { color: '#2962ff', width: 2 }, fib: { color: '#808080', width: 1 }, rect: { color: '#9c27b0', width: 1 },
  measure: { color: '#2962ff', width: 1 }, text: { color: '#2962ff', width: 1 }, arrowup: { color: '#089981', width: 1 },
};
export const FIB_LEVELS = [[0, '#808080'], [0.236, '#f23645'], [0.382, '#ff9800'], [0.5, '#4caf50'], [0.618, '#089981'], [0.786, '#00bcd4'],
  [1, '#808080'], [1.618, '#2962ff'], [2.618, '#f23645'], [3.618, '#9c27b0'], [4.236, '#e91e63']];
// TradingView's colour picker, its first rows.
export const PALETTE = ['#ffffff', '#d1d4dc', '#b2b5be', '#9598a1', '#787b86', '#5d606b', '#434651', '#131722',
  '#f23645', '#ff9800', '#ffeb3b', '#4caf50', '#089981', '#00bcd4', '#2962ff', '#673ab7', '#9c27b0', '#e91e63'];
const DASH = { 0: [], 1: [1, 2], 2: [5, 4] };
const HANDLE = 5.5, GRAB = 8;
const alpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
};
const STORE = key => `tibinance.tv.drawings.${key}`;
const FLAGS = 'tibinance.tv.drawflags';
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* this visit only */ } };
const uid = () => Math.random().toString(36).slice(2, 10);

function segDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}
// From a through b, on to the edge of a w×h box.
function extend(ax, ay, bx, by, w, h) {
  const dx = bx - ax, dy = by - ay;
  if (!dx && !dy) return [bx, by];
  const ts = [];
  if (dx > 0) ts.push((w - ax) / dx); if (dx < 0) ts.push(-ax / dx);
  if (dy > 0) ts.push((h - ay) / dy); if (dy < 0) ts.push(-ay / dy);
  const t = Math.max(1, Math.min(...ts.filter(v => v > 0)));
  return [ax + dx * t, ay + dy * t];
}

export function createDrawings({ area, onChange }) {
  let ctx = null, chart = null, series = null, key = null;
  let items = [], selected = null, tool = 'cursor', draft = null, drag = null, hover = null, editing = null;
  let flags = { magnet: false, lock: false, hide: false, ...read(FLAGS, {}) };
  const history = new Map();   // key → { undo: [json], redo: [json] }
  let valueMap = new Map(), step = 1;
  const measure = document.createElement('canvas').getContext('2d');
  const font = () => getComputedStyle(document.documentElement).getPropertyValue('--tv-font').trim() || 'sans-serif';
  const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  /* ---------------------------------------------------------- the primitive */
  const primitive = {
    _update: null,
    attached({ requestUpdate }) { this._update = requestUpdate; },
    detached() { this._update = null; },
    updateAllViews() {},
    paneViews: () => [{ zOrder: () => 'top', renderer: () => ({ draw: target => target.useMediaCoordinateSpace(scope => render(scope.context, scope.mediaSize)) }) }],
    priceAxisViews: () => axisViews('price'),
    timeAxisViews: () => axisViews('time'),
  };
  const redraw = () => primitive._update?.();

  /* ------------------------------------------------------------ coordinates */
  const ts = () => chart.timeScale();
  const times = () => ctx?.times?.() ?? [];
  function logicalOf(time) {
    const scale = ts(), exact = scale.timeToCoordinate(time);
    if (exact !== null) return Math.round(scale.coordinateToLogical(exact));
    const list = times();
    if (!list.length) return null;
    let anchor, after = null;
    if (time > list.at(-1)) anchor = list.at(-1);
    else if (time < list[0]) anchor = list[0];
    else {
      let lo = 0, hi = list.length - 1;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; (list[mid] <= time ? (lo = mid) : (hi = mid)); }
      anchor = list[lo]; after = list[hi];
    }
    const ax = scale.timeToCoordinate(anchor);
    if (ax === null) return null;
    const aL = Math.round(scale.coordinateToLogical(ax));
    if (after) return aL + (dayNum(time) - dayNum(anchor)) / Math.max(1, dayNum(after) - dayNum(anchor));
    return aL + (dayNum(time) - dayNum(anchor)) / step;
  }
  function xOf(time) {
    const x = ts().timeToCoordinate(time);
    if (x !== null) return x;
    const L = logicalOf(time);
    return L === null ? null : ts().logicalToCoordinate(L);
  }
  function timeAt(x) {
    const scale = ts(), L = scale.coordinateToLogical(x);
    if (L === null) return null;
    const Lr = Math.round(L), cx = scale.logicalToCoordinate(Lr), t = cx === null ? null : scale.coordinateToTime(cx);
    if (t !== null && t !== undefined) return dayOf(t);
    const list = times();
    if (!list.length) return null;
    const last = list.at(-1), lx = scale.timeToCoordinate(last);
    if (lx === null) return null;
    const lL = Math.round(scale.coordinateToLogical(lx));
    if (Lr > lL) return dayStr(dayNum(last) + (Lr - lL) * step);
    const first = list[0], fx = scale.timeToCoordinate(first);
    return fx === null ? null : dayStr(dayNum(first) + (Lr - Math.round(scale.coordinateToLogical(fx))) * step);
  }
  const yOf = price => series.priceToCoordinate(price);
  const priceAt = y => series.coordinateToPrice(y);
  const xy = p => [xOf(p.time), yOf(p.price)];
  const paneSize = () => ({ w: ts().width(), h: chart.panes?.()[0]?.getHeight?.() ?? area.clientHeight - ts().height() });

  // The point under the pointer: the bar's time, and its value when the magnet holds.
  function pointAt(x, y) {
    const time = timeAt(x);
    let price = priceAt(y);
    if (time === null || price === null) return null;
    if (flags.magnet && valueMap.has(time)) {
      const v = valueMap.get(time), vy = yOf(v);
      if (vy !== null) price = v;
    }
    return { time, price };
  }

  /* --------------------------------------------------------------- render */
  function stroke(c, d, emphasis = 0) {
    c.strokeStyle = d.color; c.lineWidth = d.width + emphasis; c.setLineDash((DASH[d.style ?? 0] ?? []).map(v => v * Math.max(1, d.width)));
  }
  const line = (c, ax, ay, bx, by) => { c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); };
  function handles(c, d, pts) {
    c.setLineDash([]);
    for (const [x, y] of pts) {
      if (x === null || y === null) continue;
      c.beginPath(); c.arc(x, y, HANDLE, 0, Math.PI * 2);
      c.fillStyle = token('--tv-pane') || '#fff'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = d.color; c.stroke();
    }
  }
  function textBox(c, lines, x, y, { color, bg, size = 12, align = 'center', pad = 6 } = {}) {
    c.font = `${size}px ${font()}`;
    const w = Math.max(...lines.map(l => c.measureText(l).width)) + pad * 2, h = lines.length * (size + 4) + pad * 2 - 4;
    const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    if (bg) { c.fillStyle = bg; c.beginPath(); c.roundRect(left, y, w, h, 4); c.fill(); }
    c.fillStyle = color; c.textBaseline = 'top'; c.textAlign = 'left';
    lines.forEach((l, i) => c.fillText(l, left + pad, y + pad + i * (size + 4)));
    return { left, top: y, w, h };
  }
  // Where each drawing is on screen, for drawing and for hit-testing alike.
  function geometry(d) {
    const { w, h } = paneSize();
    const pts = d.points.map(xy);
    if (pts.some(([x, y]) => x === null || y === null) && !['vline', 'hline'].includes(d.type)) return null;
    const g = { pts, w, h, handles: pts };
    switch (d.type) {
      case 'channel': {
        const [[ax, ay], [bx, by]] = pts, off = [yOf(d.points[0].price + (d.offset ?? 0)), yOf(d.points[1].price + (d.offset ?? 0))];
        if (off.includes(null)) return null;
        g.parallel = [[ax, off[0]], [bx, off[1]]];
        g.handles = [...pts, [(ax + bx) / 2, (off[0] + off[1]) / 2]];
        break;
      }
      case 'fib': {
        const [p0, p1] = d.points, levels = FIB_LEVELS.map(([lvl, color]) => ({ lvl, color, price: p1.price + (p0.price - p1.price) * lvl }));
        g.levels = levels.map(l => ({ ...l, y: yOf(l.price) })).filter(l => l.y !== null);
        g.x0 = Math.min(pts[0][0], pts[1][0]); g.x1 = Math.max(pts[0][0], pts[1][0]);
        break;
      }
      case 'text': {
        const c = measure, size = d.size ?? 14;
        c.font = `${size}px ${font()}`;
        const lines = (d.text || 'Text').split('\n');
        g.box = { x: pts[0][0], y: pts[0][1] - size, w: Math.max(...lines.map(l => c.measureText(l).width)), h: lines.length * (size + 4) };
        break;
      }
    }
    return g;
  }
  function render(c, size) {
    if (!chart || !series) return;
    const all = draft ? [...items, draft] : items;
    for (const d of all) {
      if ((flags.hide || d.hidden) && d !== draft) continue;
      const g = geometry(d);
      if (!g) continue;
      const on = d.id === selected || d === draft, em = d.id === hover && !on ? 1 : 0;
      c.save();
      paint(c, d, g, em, size);
      c.restore();
      if (on) { c.save(); handles(c, d, g.handles); c.restore(); }
    }
  }
  function paint(c, d, g, em, size) {
    const [[ax, ay] = [], [bx, by] = []] = g.pts;
    stroke(c, d, em);
    switch (d.type) {
      case 'trend': line(c, ax, ay, bx, by); break;
      case 'ray': { const [ex, ey] = extend(ax, ay, bx, by, g.w, g.h); line(c, ax, ay, ex, ey); break; }
      case 'hline': if (ay !== null) line(c, 0, ay, g.w, ay); break;
      case 'hray': line(c, ax, ay, g.w, ay); break;
      case 'vline': if (ax !== null) line(c, ax, 0, ax, size.height); break;
      case 'crossline': line(c, 0, ay, g.w, ay); line(c, ax, 0, ax, size.height); break;
      case 'channel': {
        const [[px, py], [qx, qy]] = g.parallel;
        c.fillStyle = alpha(d.color, 0.2); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.lineTo(qx, qy); c.lineTo(px, py); c.closePath(); c.fill();
        line(c, ax, ay, bx, by); line(c, px, py, qx, qy);
        c.setLineDash([5, 4]); c.lineWidth = 1; line(c, ax, (ay + py) / 2, bx, (by + qy) / 2);
        break;
      }
      case 'fib': {
        const sorted = [...g.levels].sort((a, b) => a.lvl - b.lvl);
        for (let i = 0; i < sorted.length - 1; i++) {
          c.fillStyle = alpha(sorted[i + 1].color, 0.12);
          c.fillRect(g.x0, Math.min(sorted[i].y, sorted[i + 1].y), g.x1 - g.x0, Math.abs(sorted[i + 1].y - sorted[i].y));
        }
        c.font = `12px ${font()}`; c.textAlign = 'right'; c.textBaseline = 'middle';
        for (const l of g.levels) {
          c.strokeStyle = l.color; c.lineWidth = d.width + em; c.setLineDash([]); line(c, g.x0, l.y, g.x1, l.y);
          c.fillStyle = l.color; c.fillText(`${l.lvl} (${ctx.format(l.price)})`, g.x0 - 4, l.y);
        }
        c.strokeStyle = '#808080'; c.lineWidth = 1; c.setLineDash([5, 4]); line(c, ax, ay, bx, by);
        break;
      }
      case 'rect':
        c.fillStyle = alpha(d.color, 0.2); c.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
        c.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay));
        break;
      case 'measure': {
        const up = d.points[1].price >= d.points[0].price, col = up ? '#2962ff' : '#f23645';
        const left = Math.min(ax, bx), top = Math.min(ay, by), wd = Math.abs(bx - ax), ht = Math.abs(by - ay);
        c.fillStyle = alpha(col, 0.2); c.fillRect(left, top, wd, ht);
        c.strokeStyle = col; c.lineWidth = 1; c.setLineDash([]);
        const mx = left + wd / 2, my = top + ht / 2;
        line(c, mx, ay, mx, by); line(c, ax, my, bx, my);
        const head = (x, y, dx, dy) => { c.beginPath(); c.moveTo(x - dy * 5 - dx * 6, y + dx * 5 - dy * 6); c.lineTo(x, y); c.lineTo(x + dy * 5 - dx * 6, y - dx * 5 - dy * 6); c.stroke(); };
        if (ht > 12) head(mx, by, 0, Math.sign(by - ay) || 1);
        if (wd > 12) head(bx, my, Math.sign(bx - ax) || 1, 0);
        const dp = d.points[1].price - d.points[0].price, pct = d.points[0].price ? dp / Math.abs(d.points[0].price) * 100 : 0;
        const L0 = logicalOf(d.points[0].time), L1 = logicalOf(d.points[1].time), bars = L0 === null || L1 === null ? 0 : Math.round(L1 - L0);
        const days = Math.round(dayNum(d.points[1].time) - dayNum(d.points[0].time));
        const lines = [`${dp >= 0 ? '' : '−'}${ctx.format(Math.abs(dp))} (${pct >= 0 ? '' : '−'}${Math.abs(pct).toFixed(2)}%)`, `${bars} bars, ${days}d`];
        const below = by >= ay;
        const boxH = lines.length * 16 + 8;
        textBox(c, lines, mx, below ? Math.max(ay, by) + 8 : Math.min(ay, by) - 8 - boxH, { color: '#fff', bg: col, size: 12, pad: 6 });
        break;
      }
      case 'text': {
        const size = d.size ?? 14;
        c.font = `${size}px ${font()}`; c.fillStyle = d.color; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
        (d.text || 'Text').split('\n').forEach((l, i) => c.fillText(l, ax, ay + i * (size + 4)));
        if (em || d.id === selected) { c.setLineDash([]); c.lineWidth = 1; c.strokeStyle = alpha(d.color, 0.6); c.strokeRect(g.box.x - 3, g.box.y - 3, g.box.w + 6, g.box.h + 6); }
        break;
      }
      case 'arrowup': {
        c.fillStyle = d.color; c.beginPath();
        c.moveTo(ax, ay); c.lineTo(ax + 10, ay + 10); c.lineTo(ax + 4, ay + 10); c.lineTo(ax + 4, ay + 24); c.lineTo(ax - 4, ay + 24); c.lineTo(ax - 4, ay + 10); c.lineTo(ax - 10, ay + 10);
        c.closePath(); c.fill();
        break;
      }
    }
  }
  // The price and time scales label a horizontal line's price, a vertical line's time, and the selected drawing's
  // anchors, in the drawing's colour.
  function axisViews(kind) {
    if (!chart || !series || flags.hide) return [];
    const views = [];
    const add = (coordinate, text, color) => coordinate !== null && views.push({
      coordinate: () => coordinate, text: () => text, textColor: () => '#ffffff', backColor: () => color, visible: () => true, tickVisible: () => true });
    for (const d of draft ? [...items, draft] : items) {
      if (d.hidden) continue;
      const on = d.id === selected || d === draft;
      if (kind === 'price') {
        if (['hline', 'hray', 'crossline'].includes(d.type) || (on && !['vline', 'text', 'arrowup'].includes(d.type)))
          for (const p of d.points) add(yOf(p.price), ctx.format(p.price), d.color);
      } else if (['vline', 'crossline'].includes(d.type) || (on && !['hline', 'hray'].includes(d.type))) {
        for (const p of d.points) add(xOf(p.time), p.time, d.color);
      }
    }
    return views;
  }

  /* ------------------------------------------------------------ hit-testing */
  function hit(d, x, y) {
    const g = geometry(d);
    if (!g) return null;
    const tol = 3 + d.width / 2;
    if (d.id === selected) {
      const i = g.handles.findIndex(([hx, hy]) => hx !== null && hy !== null && Math.hypot(x - hx, y - hy) <= GRAB);
      if (i !== -1) return { part: 'handle', index: i };
    }
    const [[ax, ay] = [], [bx, by] = []] = g.pts;
    const inside = (l, t, r, b) => x >= Math.min(l, r) && x <= Math.max(l, r) && y >= Math.min(t, b) && y <= Math.max(t, b);
    let on = false;
    switch (d.type) {
      case 'trend': on = segDistance(x, y, ax, ay, bx, by) <= tol; break;
      case 'ray': { const [ex, ey] = extend(ax, ay, bx, by, g.w, g.h); on = segDistance(x, y, ax, ay, ex, ey) <= tol; break; }
      case 'hline': on = ay !== null && Math.abs(y - ay) <= tol; break;
      case 'hray': on = x >= ax - tol && Math.abs(y - ay) <= tol; break;
      case 'vline': on = ax !== null && Math.abs(x - ax) <= tol; break;
      case 'crossline': on = Math.abs(y - ay) <= tol || Math.abs(x - ax) <= tol; break;
      case 'channel': {
        const [[px, py], [qx, qy]] = g.parallel;
        on = segDistance(x, y, ax, ay, bx, by) <= tol || segDistance(x, y, px, py, qx, qy) <= tol;
        if (!on && x >= Math.min(ax, bx) && x <= Math.max(ax, bx)) {
          const t = (x - ax) / ((bx - ax) || 1), y1 = ay + (by - ay) * t, y2 = py + (qy - py) * t;
          on = y >= Math.min(y1, y2) && y <= Math.max(y1, y2);
        }
        break;
      }
      case 'fib': on = g.levels.length > 1 && x >= g.x0 - tol && x <= g.x1 + tol && y >= Math.min(...g.levels.map(l => l.y)) - tol && y <= Math.max(...g.levels.map(l => l.y)) + tol; break;
      case 'rect': case 'measure': on = inside(ax, ay, bx, by); break;
      case 'text': on = inside(g.box.x - 3, g.box.y - 3, g.box.x + g.box.w + 3, g.box.y + g.box.h + 3); break;
      case 'arrowup': on = inside(ax - 10, ay, ax + 10, ay + 24); break;
    }
    return on ? { part: 'body' } : null;
  }
  function hitAny(x, y) {
    if (flags.hide) return null;
    const order = [...items].reverse().sort((a, b) => (b.id === selected) - (a.id === selected));
    for (const d of order) {
      if (d.hidden) continue;
      const h = hit(d, x, y);
      if (h) return { d, ...h };
    }
    return null;
  }

  /* --------------------------------------------------------------- history */
  const stack = () => { if (!history.has(key)) history.set(key, { undo: [], redo: [] }); return history.get(key); };
  const snapshot = () => JSON.stringify(items);
  function commit(before) {
    if (!key) return;
    const s = stack();
    if (before !== snapshot()) { s.undo.push(before); s.redo.length = 0; if (s.undo.length > 100) s.undo.shift(); }
    save();
  }
  function save() { if (key) items.length ? write(STORE(key), items) : (() => { try { localStorage.removeItem(STORE(key)); } catch { /* none */ } })(); changed(); redraw(); }
  function changed(reason = 'items') { onChange?.(reason); }

  /* ------------------------------------------------------------- creation */
  function begin(point) {
    const spec = TOOLS[tool], def = DEFAULTS[tool];
    const d = { id: uid(), type: tool, points: [point], color: def.color, width: def.width, style: 0 };
    if (spec.points >= 2) d.points.push({ ...point });
    if (tool === 'channel') d.offset = 0;
    if (tool === 'text') d.text = '';
    return d;
  }
  function finish() {
    const before = snapshot(), d = draft;
    draft = null;
    items.push(d);
    selected = d.id;
    setTool('cursor');
    commit(before);
    if (d.type === 'text') edit(d, true);
  }
  // A channel's third point sets its width: the distance from the line at that time.
  function channelOffset(d, point) {
    const [p0, p1] = d.points, L0 = logicalOf(p0.time), L1 = logicalOf(p1.time), L = logicalOf(point.time);
    const t = L0 === null || L1 === null || L === null || L1 === L0 ? 0 : (L - L0) / (L1 - L0);
    return point.price - (p0.price + (p1.price - p0.price) * t);
  }

  /* -------------------------------------------------------------- pointer */
  const local = e => { const r = area.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const inPane = (x, y) => { const { w, h } = paneSize(); return x >= 0 && y >= 0 && x < w && y < h; };
  let down = null;
  function freeze(on) { chart?.applyOptions({ handleScroll: !on, handleScale: !on }); }

  // Controls over the chart (the legend's buttons, event markers, the drawing's toolbar, replay) are not the chart.
  const OVER = '.tv-float,.tv-text-edit,.tv-replay,.tv-popup,#chartHead button,#eventMarks,#status';
  function pointerdown(e) {
    if (!chart || !series || !key || e.button > 0 || editing || e.target.closest?.(OVER)) return;
    const [x, y] = local(e);
    if (!inPane(x, y)) return;
    if (tool !== 'cursor') {
      e.preventDefault(); e.stopPropagation();
      const p = pointAt(x, y);
      if (!p) return;
      if (!draft) {
        draft = begin(p);
        if (TOOLS[tool].points === 1) { down = null; finish(); return; }
        down = { x, y, creating: true, index: 1 };
      } else {
        // The next click places the point where it lands, moved to or not.
        if (draft.type === 'channel' && draft.stage === 2) draft.offset = channelOffset(draft, p);
        else draft.points[1] = p;
        down = { x, y, creating: true, index: draft.stage ?? 1, second: true };
      }
      area.setPointerCapture?.(e.pointerId);
      redraw();
      return;
    }
    const h = hitAny(x, y);
    if (!h) {
      if (selected) { selected = null; changed('select'); redraw(); }
      return;
    }
    e.preventDefault(); e.stopPropagation();
    if (selected !== h.d.id) { selected = h.d.id; changed('select'); }
    if (flags.lock || h.d.locked) { redraw(); return; }
    drag = { id: h.d.id, part: h.part, index: h.index, x, y, before: snapshot(), orig: JSON.parse(JSON.stringify(h.d)), moved: false };
    area.classList.add('is-dragging-drawing');
    freeze(true);
    area.setPointerCapture?.(e.pointerId);
    redraw();
  }
  function pointermove(e) {
    if (!chart || !series || editing || (!draft && !drag && e.target.closest?.(OVER))) return;
    const [x, y] = local(e);
    if (draft) {
      const p = pointAt(Math.min(Math.max(x, 0), paneSize().w - 1), y);
      if (!p) return;
      if (draft.type === 'channel' && draft.stage === 2) draft.offset = channelOffset(draft, p);
      else if (draft.points[1]) draft.points[1] = p;
      redraw();
      return;
    }
    if (drag) {
      const d = items.find(i => i.id === drag.id);
      if (!d) return;
      drag.moved ||= Math.hypot(x - drag.x, y - drag.y) > 2;
      if (drag.part === 'handle') {
        const p = pointAt(x, y);
        if (!p) return;
        if (d.type === 'channel' && drag.index === 2) d.offset = channelOffset(d, p);
        else d.points[drag.index] = p;
      } else {
        const dx = x - drag.x, dy = y - drag.y;
        d.points = drag.orig.points.map(p => {
          const [px, py] = xy(p);
          if (px === null || py === null) return p;
          const time = ['hline'].includes(d.type) ? p.time : timeAt(px + dx), price = ['vline'].includes(d.type) ? p.price : priceAt(py + dy);
          return { time: time ?? p.time, price: price ?? p.price };
        });
      }
      redraw();
      return;
    }
    if (tool !== 'cursor') return;
    const h = inPane(x, y) ? hitAny(x, y) : null, id = h?.d.id ?? null;
    area.classList.toggle('is-hovering-drawing', !!h);
    if (id !== hover) { hover = id; redraw(); }
  }
  function pointerup(e) {
    if (draft && down?.creating) {
      const [x, y] = local(e), dragged = Math.hypot(x - down.x, y - down.y) > 4;
      const spec = TOOLS[draft.type];
      if (dragged || down.second) {
        if (spec.points === 3 && (draft.stage ?? 1) === 1) { draft.stage = 2; draft.offset = 0; }
        else { delete draft.stage; finish(); }
      }
      down = null;
      redraw();
      return;
    }
    if (drag) {
      const moved = drag.moved, before = drag.before;
      drag = null;
      area.classList.remove('is-dragging-drawing');
      freeze(tool !== 'cursor');
      if (moved) commit(before); else redraw();
    }
  }
  function dblclick(e) {
    if (e.target.closest?.(OVER)) return;
    const [x, y] = local(e), h = inPane(x, y) ? hitAny(x, y) : null;
    if (h?.d.type === 'text' && !flags.lock && !h.d.locked) { e.preventDefault(); e.stopPropagation(); edit(h.d, false); }
  }
  area.addEventListener('pointerdown', pointerdown, true);
  area.addEventListener('pointermove', pointermove, true);
  area.addEventListener('pointerup', pointerup, true);
  area.addEventListener('pointercancel', pointerup, true);
  area.addEventListener('dblclick', dblclick, true);

  // A text drawing's words, typed where it stands; Enter keeps them, Escape leaves them as they were.
  function edit(d, fresh) {
    const [x, y] = xy(d.points[0]);
    if (x === null || y === null) return;
    const input = Object.assign(document.createElement('textarea'), { className: 'tv-text-edit', value: d.text, rows: 1 });
    input.setAttribute('aria-label', 'Text');
    input.style.left = `${x - 7}px`; input.style.top = `${y - (d.size ?? 14) - 5}px`; input.style.color = d.color;
    area.append(input);
    editing = d.id;
    const before = fresh ? null : snapshot();
    let done = false;
    const close = keep => {
      if (done) return; done = true;
      editing = null; input.remove();
      if (keep) d.text = input.value.trim() || (fresh ? 'Text' : d.text);
      if (fresh) { save(); } else if (keep) commit(before);
      redraw();
    };
    input.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); close(true); }
      if (e.key === 'Escape') { e.preventDefault(); close(fresh); }
    });
    input.addEventListener('blur', () => close(true));
    requestAnimationFrame(() => input.focus());
  }

  /* -------------------------------------------------------------- the API */
  function setTool(next) {
    if (!TOOLS[next] && next !== 'cursor') return;
    tool = next;
    if (draft) draft = null;
    if (next !== 'cursor') selected = null;
    area.classList.toggle('is-drawing', next !== 'cursor');
    area.classList.remove('is-hovering-drawing');
    freeze(next !== 'cursor');
    changed('tool');
    redraw();
  }
  function load() {
    items = key ? read(STORE(key), []).filter(d => TOOLS[d.type] && Array.isArray(d.points)) : [];
    selected = null; draft = null; hover = null;
  }
  function refreshView() {
    if (!ctx) return;
    const next = ctx.series?.();
    if (next !== series) {
      if (series) try { series.detachPrimitive(primitive); } catch { /* detached already */ }
      series = next;
      series?.attachPrimitive(primitive);
    }
    const values = ctx.values?.() ?? [];
    valueMap = new Map(values.map(v => [v.time, v.value]));
    const list = times();
    step = list.length > 1 ? Math.max(1, dayNum(list.at(-1)) - dayNum(list.at(-2))) : 1;
    if (step > 27) step = 30.4375;
    const nextKey = ctx.key?.() ?? null;
    if (nextKey !== key) { key = nextKey; load(); changed('load'); }
    redraw();
  }
  const api = {
    attach(context) { ctx = context; chart = context.chart; refreshView(); },
    refresh: refreshView,
    get tool() { return tool; },
    setTool,
    get key() { return key; },
    get selected() { return selected; },
    get flags() { return { ...flags }; },
    setFlag(name, on) {
      flags[name] = on; write(FLAGS, flags);
      if (name === 'lock' || name === 'hide') { drag = null; if (on && name === 'hide') selected = null; }
      changed('flags'); redraw();
    },
    list: () => items.map(d => ({ id: d.id, type: d.type, name: d.type === 'text' ? `Text: ${d.text || 'Text'}` : TOOLS[d.type].name, hidden: !!d.hidden, locked: !!d.locked, color: d.color })),
    get current() { return items.find(d => d.id === selected) ?? null; },
    select(id) { selected = items.some(d => d.id === id) ? id : null; changed('select'); redraw(); },
    update(id, patch) {
      const d = items.find(i => i.id === id); if (!d) return;
      const before = snapshot(); Object.assign(d, patch); commit(before);
    },
    remove(id = selected) {
      if (!id) return;
      const before = snapshot(); items = items.filter(d => d.id !== id);
      if (selected === id) selected = null;
      commit(before);
    },
    removeAll() { if (!items.length) return; const before = snapshot(); items = []; selected = null; commit(before); },
    clone(id = selected) {
      const d = items.find(i => i.id === id); if (!d) return;
      const before = snapshot(), copy = { ...JSON.parse(JSON.stringify(d)), id: uid() };
      items.push(copy); selected = copy.id; commit(before);
    },
    canUndo: () => !!key && stack().undo.length > 0,
    canRedo: () => !!key && stack().redo.length > 0,
    undo() {
      const s = key && stack(); if (!s?.undo.length) return;
      s.redo.push(snapshot()); items = JSON.parse(s.undo.pop()); selected = null; save();
    },
    redo() {
      const s = key && stack(); if (!s?.redo.length) return;
      s.undo.push(snapshot()); items = JSON.parse(s.redo.pop()); selected = null; save();
    },
    // Escape: the drawing in progress, then the tool, then the selection.
    cancel() {
      if (draft) { draft = null; redraw(); return true; }
      if (tool !== 'cursor') { setTool('cursor'); return true; }
      if (selected) { selected = null; changed('select'); redraw(); return true; }
      return false;
    },
    get editing() { return !!editing; },
    redraw,
    // Where a drawing is on screen, for the floating toolbar.
    anchorOf(id) {
      const d = items.find(i => i.id === id); if (!d) return null;
      const g = geometry(d); if (!g) return null;
      const ys = g.handles.map(p => p[1]).filter(v => v !== null), xs = g.handles.map(p => p[0]).filter(v => v !== null);
      return { x: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : g.w / 2, y: ys.length ? Math.min(...ys) : 0 };
    },
  };
  return api;
}
