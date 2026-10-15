/*
 * Export: an image of the market chart as it stands, drawn from the chart's own state rather than captured from the
 * page. A second chart is built offscreen by js/market-chart.js, from the same world, side and visible days, so its
 * layers draw exactly as they do on the page; each layer also names its key for the legend and may annotate the
 * image. Around the chart go the world, its latest best offer and change, the legend, the days shown and a discreet
 * Tibinance mark, all drawn on one canvas. A layer with marks to explain (events) adds notes under the chart: a key
 * per kind of mark and a line per mark, so the image grows by as many lines as it has to say.
 *
 * The image has the same layout from any window or phone (WIDTH by the height of its parts, in image pixels) and at
 * least twice as many device pixels: on a screen of lower density the offscreen chart is drawn larger instead.
 */
import { createMarketChart } from './market-chart.js?v=20261015-interval';
import { dateText } from './events.js';
import { drawMarker } from './market-events-layer.js?v=20261014-events';

const WIDTH = 1200, PAD = 32, CHART_HEIGHT = 560;
const HEAD = 104;     // title, quote, legend and rule above the chart
const FOOT = 68;      // rule and footer (conventions, then when and where it was exported) below it
const LINE = 20;      // a line of notes under the chart

const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const frames = n => new Promise(resolve => { const step = () => (n-- > 0 ? requestAnimationFrame(step) : resolve()); step(); });

/*
 * context: { world, tag, meta: [text], value, valueNote, change: {text, tone, note} | null, shown, footer }
 * logicalRange: the page chart's visible logical range, so the image shows the same days.
 * hidden: ids of the optional layers hidden on the page, hidden in the image too.
 * Returns the image as a canvas.
 */
export async function marketImage({ view, side, logicalRange, context, hidden = [] }) {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.ceil(2 / dpr));   // 2 on a 1x or 1.5x screen, 1 from 2x up
  const plotWidth = WIDTH - 2 * PAD;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${plotWidth * k}px;height:${CHART_HEIGHT * k}px;pointer-events:none`;
  document.body.append(host);
  const market = createMarketChart(host, { scale: k, width: plotWidth * k, height: CHART_HEIGHT * k, profile: view.profile });
  try {
    for (const id of market.optional) market.setVisible(id, !hidden.includes(id));
    market.draw(view, side);
    if (logicalRange) market.chart.timeScale().setVisibleLogicalRange(logicalRange);
    else market.chart.timeScale().fitContent();
    await frames(2);
    // With the top layer, where layers draw their primitives; without the crosshair.
    const shot = market.chart.takeScreenshot(true, false);
    return compose({ shot, ratio: dpr * k, k, plotWidth, market, keys: market.keys(side), notes: market.notes(), context, side });
  } finally {
    market.chart.remove();
    host.remove();
  }
}

function compose({ shot, ratio, k, plotWidth, market, keys, notes, context, side }) {
  // The chart's ground (TradingView's pane where the page has one), so the image matches the chart on screen.
  const c = { canvas: token('--tv-pane') || token('--canvas') || '#fff', ink: token('--ink'), muted: token('--muted'), line: token('--line'), lineStrong: token('--line-strong'),
    up: token('--positive'), down: token('--negative'),
    events: { world: token('--event-world'), game: token('--event-game'), market: token('--event-market') },
    band: token(side === 'buy' ? '--buy' : '--sell') };
  const ui = token('--font-ui'), serif = token('--font-editorial');
  const canvas = document.createElement('canvas');
  const measure = canvas.getContext('2d');
  const keyLines = note => {
    measure.font = `400 13px ${ui}`;
    let lines = 1, used = 0;
    for (const {category, count} of note.keys) {
      const label = category.recurring ? `${category.label} (${count})` : category.label;
      const width = 55 + measure.measureText(label).width;
      if (used && used + width > WIDTH - PAD * 2) { lines++; used = 0; }
      used += width;
    }
    return lines;
  };
  const noteLines = notes.reduce((n, note) => n + (note.lines ? note.lines.length : keyLines(note) + note.rows.length + (note.more ? 1 : 0)), 0);
  const details = context.details ?? null;
  const height = HEAD + CHART_HEIGHT + (noteLines ? 12 + noteLines * LINE : 0) + detailsHeight(details) + FOOT + PAD * 2;
  canvas.width = Math.round(WIDTH * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.fillStyle = c.canvas;
  ctx.fillRect(0, 0, WIDTH, height);
  ctx.textBaseline = 'alphabetic';
  const text = (value, x, y, { font, color = c.ink, align = 'left' }) => {
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, x, y);
    return ctx.measureText(value).width;
  };
  const right = WIDTH - PAD;
  let y = PAD;

  // The world, its status and properties; the latest best offer and its change over the range.
  const x = PAD + text(context.world, PAD, y + 28, { font: `400 30px ${serif}` }) + 12;
  if (context.tag) {
    ctx.font = `600 11px ${ui}`;
    const w = ctx.measureText(context.tag.toUpperCase()).width + 10;
    ctx.strokeStyle = c.lineStrong; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 13.5, w, 17);
    text(context.tag.toUpperCase(), x + 5, y + 26, { font: `600 11px ${ui}`, color: c.muted });
  }
  text(context.meta.join('   '), PAD, y + 52, { font: `400 13px ${ui}`, color: c.muted });
  let qx = right;
  if (context.change) {
    qx -= text(context.change.text, qx, y + 28, { font: `400 15px ${ui}`, color: c[context.change.tone] || c.muted, align: 'right' }) + 10;
  }
  text(context.value, qx, y + 28, { font: `600 26px ${ui}`, align: 'right' });
  text([context.valueNote, context.change?.note].filter(Boolean).join(', '), right, y + 52, { font: `400 13px ${ui}`, color: c.muted, align: 'right' });

  // The legend, from the chart's layers, and the days shown.
  const ky = y + 80;
  let kx = PAD;
  for (const key of keys) {
    drawKey(ctx, key, kx, ky - 4);
    kx += 24 + text(key.label, kx + 22, ky, { font: `400 13px ${ui}`, color: c.ink }) + 20;
  }
  if (context.shown) text(context.shown, right, ky, { font: `400 13px ${ui}`, color: c.muted, align: 'right' });
  y += HEAD;
  rule(ctx, PAD, right, y - 8, c.line);

  // The chart, then whatever its layers write over it, in the chart's own pixels.
  ctx.drawImage(shot, PAD, y, plotWidth, CHART_HEIGHT);
  ctx.save();
  ctx.translate(PAD, y);
  ctx.scale(1 / k, 1 / k);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  market.annotate(ctx, { x: 0, y: 0, font: size => `400 ${size}px ${ui}` });
  ctx.restore();
  y += CHART_HEIGHT;
  if (noteLines) y = drawNotes(ctx, notes, { x: PAD, y: y + 12, right, c, ui, text });
  y = drawDetails(ctx, details, { x: PAD, y, right, c, ui });

  // A discreet mark, as in the site header, and the conventions the chart follows.
  rule(ctx, PAD, right, y + 12, c.line);
  const fy = y + 36;
  const brand = text('Tibinance', PAD, fy, { font: `600 13px ${ui}` });
  text('/ Markets', PAD + brand + 6, fy, { font: `400 13px ${serif}`, color: c.muted });
  text(context.footer, right, fy, { font: `400 11px ${ui}`, color: c.muted, align: 'right' });
  text(fit(ctx, exportedLine(), right - PAD - 140, `400 11px ${ui}`), right, fy + 16, { font: `400 11px ${ui}`, color: c.muted, align: 'right' });
  return canvas;
}

/*
 * The notes of the chart's marks (js/events.js exportNotes): a line of keys, each kind of mark with its name
 * and, where it recurs, how many are shown; then one line per other mark, its days, its mark and its title.
 */
function drawNotes(ctx, notes, { x, y, right, c, ui, text }) {
  const font = `400 13px ${ui}`;
  const colorOf = category => c.events[category.group] ?? c.ink;
  for (const note of notes) {
    // Plain lines (a projection): a key, then the text, cut short where it would pass the edge.
    if (note.lines) {
      for (const line of note.lines) {
        if (line.mark !== 'none') drawKey(ctx, { mark: line.mark, color: line.color ?? (line.mark === 'band' ? c.band : c.ink) }, x, y + 10);
        const tx = line.mark === 'none' ? x : x + 28;
        text(fit(ctx, line.text, right - tx, font), tx, y + 14, { font, color: line.mark === 'none' ? c.muted : c.ink });
        y += LINE;
      }
      continue;
    }
    let kx = x;
    for (const { category, count } of note.keys) {
      const label = category.recurring ? `${category.label} (${count})` : category.label;
      ctx.font = font;
      const width = 55 + ctx.measureText(label).width;
      if (kx > x && kx + width > right) { kx = x; y += LINE; }
      const w = drawMarker(ctx, { x: kx + 10, y: y + 10, label: category.mark, color: colorOf(category), background: c.canvas, font: ui });
      text(label, kx + 10 + w / 2 + 6, y + 14, { font, color: c.ink });
      kx += width;
    }
    y += LINE;
    // The days in a column as wide as the longest, then the mark, then what happened.
    ctx.font = font;
    const column = Math.max(0, ...note.rows.map(e => ctx.measureText(dateText(e)).width)) + 16;
    for (const event of note.rows) {
      text(dateText(event), x, y + 14, { font, color: c.muted });
      const w = drawMarker(ctx, { x: x + column + 10, y: y + 10, label: event.category.mark, color: colorOf(event.category), background: c.canvas, font: ui });
      const tx = x + column + 10 + w / 2 + 8;
      text(fit(ctx, `${event.title}. ${event.description}`, right - tx, font), tx, y + 14, { font, color: c.ink });
      y += LINE;
    }
    if (note.more) { text(`and ${note.more} more`, x, y + 14, { font, color: c.muted }); y += LINE; }
  }
  return y;
}

// The text, cut short with an ellipsis where it would pass `width`.
function fit(ctx, value, width, font) {
  ctx.font = font;
  if (ctx.measureText(value).width <= width) return value;
  let end = value.length;
  while (end > 0 && ctx.measureText(`${value.slice(0, end)}…`).width > width) end--;
  return `${value.slice(0, end).trimEnd()}…`;
}

function rule(ctx, from, to, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(from, y, to - from, 1);
}

// The same marks as the legends on the page: a dot on its line, a dotted line, a plain line, a bar.
function drawKey(ctx, { mark, color }, x, y) {
  ctx.save();
  ctx.strokeStyle = ctx.fillStyle = color;
  ctx.lineCap = 'round';
  if (mark === 'band') {
    ctx.globalAlpha = 0.25;
    ctx.fillRect(x, y - 5, 18, 10);
  } else if (mark === 'dashed') {
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 3]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 18, y);
    ctx.stroke();
  } else if (mark === 'bar') {
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x + 5, y - 6, 8, 12);
  } else {
    ctx.lineWidth = mark === 'line' ? 1 : 2;
    if (mark === 'dotted') ctx.setLineDash([0.1, 4]);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 18, y);
    ctx.stroke();
    if (mark === 'dot') { ctx.beginPath(); ctx.arc(x + 9, y, 3.5, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

/*
 * The page's details beside the chart, as the image's band under it: the Key stats (every label and figure of the
 * page's .tv-keystats lists, as shown) and the Performance tiles. Read from the page, so the image says what it says.
 */
const STAT_LINE = 22, PERF_HEIGHT = 46;
// Four columns, or three where a figure is long (a week's dates), so no figure is cut short.
const columnsOf = details => details.stats.some(([, v]) => v.length > 16) ? 3 : 4;
export function pageDetails(root = document) {
  const clean = el => el.textContent.replace(/\s+/g, ' ').trim();
  const stats = [...root.querySelectorAll('.details .tv-keystats > div')].filter(d => !d.closest('[hidden]'))
    .map(d => [clean(d.querySelector('dt') ?? d), clean(d.querySelector('dd') ?? d)]).filter(([l, v]) => l && v);
  const performance = [...root.querySelectorAll('#detailPerformance button')].map(b => {
    const v = b.querySelector('.perf-value');
    return { value: clean(v ?? b), range: clean(b.querySelector('.perf-range') ?? b), tone: v?.matches('.up, :has(.up)') ? 'up' : v?.matches('.down, :has(.down)') ? 'down' : '', selected: b.getAttribute('aria-pressed') === 'true' };
  });
  return stats.length || performance.length ? { stats, performance } : null;
}
export function detailsHeight(details) {
  if (!details) return 0;
  return 20 + 24 + Math.ceil(details.stats.length / columnsOf(details)) * STAT_LINE + (details.performance.length ? 12 + PERF_HEIGHT : 0);
}
export function drawDetails(ctx, details, { x, y, right, c, ui }) {
  if (!details) return y;
  const put = (value, tx, ty, font, color, align = 'left') => { ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.fillText(value, tx, ty); };
  y += 20;
  rule(ctx, x, right, y - 8, c.line);
  put('Key stats', x, y + 10, `600 13px ${ui}`, c.ink);
  y += 24;
  const columns = columnsOf(details), gap = 24, col = (right - x - gap * (columns - 1)) / columns;
  details.stats.forEach(([label, value], i) => {
    const cx = x + (i % columns) * (col + gap), cy = y + Math.floor(i / columns) * STAT_LINE + 14;
    ctx.font = `600 13px ${ui}`;
    const vw = Math.min(ctx.measureText(value).width, col * 0.68);
    put(fit(ctx, value, col * 0.68, `600 13px ${ui}`), cx + col, cy, `600 13px ${ui}`, c.ink, 'right');
    put(fit(ctx, label, col - vw - 8, `400 13px ${ui}`), cx, cy, `400 13px ${ui}`, c.muted);
  });
  y += Math.ceil(details.stats.length / columns) * STAT_LINE;
  if (details.performance.length) {
    y += 12;
    const n = details.performance.length, w = (right - x - 8 * (n - 1)) / n;
    details.performance.forEach((p, i) => {
      const tx = x + i * (w + 8);
      ctx.save();
      ctx.fillStyle = p.tone === 'up' ? c.up : p.tone === 'down' ? c.down : c.muted;
      ctx.globalAlpha = 0.12; ctx.fillRect(tx, y, w, PERF_HEIGHT);
      ctx.restore();
      if (p.selected) { ctx.strokeStyle = c.lineStrong; ctx.lineWidth = 1; ctx.strokeRect(tx + 0.5, y + 0.5, w - 1, PERF_HEIGHT - 1); }
      put(p.value, tx + w / 2, y + 20, `600 14px ${ui}`, p.tone === 'up' ? c.up : p.tone === 'down' ? c.down : c.muted, 'center');
      put(p.range, tx + w / 2, y + 37, `400 11px ${ui}`, c.muted, 'center');
    });
    y += PERF_HEIGHT;
  }
  return y;
}
// When and where the image was made: the local time with its offset, and the page's address (the view it shows).
export function exportedLine(now = new Date()) {
  const pad = n => String(n).padStart(2, '0'), off = -now.getTimezoneOffset();
  const zone = `UTC${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
  return `Exported ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())} ${zone} from ${location.href}`;
}
