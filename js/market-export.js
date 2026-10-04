/*
 * Export: an image of the market chart as it stands, drawn from the chart's own state rather than captured from the
 * page. A second chart is built offscreen by js/market-chart.js, from the same world, side and visible days, so its
 * layers draw exactly as they do on the page; each layer also names its key for the legend and may annotate the
 * image. Around the chart go the world, its latest best offer and change, the legend, the days shown and a discreet
 * Tibinance mark, all drawn on one canvas.
 *
 * The image has the same layout from any window or phone (WIDTH by the height of its parts, in image pixels) and at
 * least twice as many device pixels: on a screen of lower density the offscreen chart is drawn larger instead.
 */
import { createMarketChart } from './market-chart.js';

const WIDTH = 1200, PAD = 32, CHART_HEIGHT = 560;
const HEAD = 104;     // title, quote, legend and rule above the chart
const FOOT = 52;      // rule and footer below it

const token = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const frames = n => new Promise(resolve => { const step = () => (n-- > 0 ? requestAnimationFrame(step) : resolve()); step(); });

/*
 * context: { world, tag, meta: [text], value, valueNote, change: {text, tone, note} | null, shown, footer }
 * logicalRange: the page chart's visible logical range, so the image shows the same days.
 * Returns the image as a canvas.
 */
export async function marketImage({ view, side, logicalRange, context }) {
  const dpr = window.devicePixelRatio || 1;
  const k = Math.max(1, Math.ceil(2 / dpr));   // 2 on a 1x or 1.5x screen, 1 from 2x up
  const plotWidth = WIDTH - 2 * PAD;
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${plotWidth * k}px;height:${CHART_HEIGHT * k}px;pointer-events:none`;
  document.body.append(host);
  const market = createMarketChart(host, { scale: k, width: plotWidth * k, height: CHART_HEIGHT * k });
  try {
    market.draw(view, side);
    if (logicalRange) market.chart.timeScale().setVisibleLogicalRange(logicalRange);
    else market.chart.timeScale().fitContent();
    await frames(2);
    const shot = market.chart.takeScreenshot();
    return compose({ shot, ratio: dpr * k, k, plotWidth, market, keys: market.keys(side), context });
  } finally {
    market.chart.remove();
    host.remove();
  }
}

function compose({ shot, ratio, k, plotWidth, market, keys, context }) {
  const c = { canvas: token('--canvas') || '#fff', ink: token('--ink'), muted: token('--muted'), line: token('--line'), lineStrong: token('--line-strong'),
    up: token('--positive'), down: token('--negative') };
  const ui = token('--font-ui'), serif = token('--font-editorial');
  const height = HEAD + CHART_HEIGHT + FOOT + PAD * 2;
  const canvas = document.createElement('canvas');
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

  // A discreet mark, as in the site header, and the conventions the chart follows.
  rule(ctx, PAD, right, y + 12, c.line);
  const fy = y + 36;
  const brand = text('Tibinance', PAD, fy, { font: `600 13px ${ui}` });
  text('/ Markets', PAD + brand + 6, fy, { font: `400 13px ${serif}`, color: c.muted });
  text(context.footer, right, fy, { font: `400 11px ${ui}`, color: c.muted, align: 'right' });
  return canvas;
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
  if (mark === 'bar') {
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
