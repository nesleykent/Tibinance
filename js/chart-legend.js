// Shared series-label and PNG legend layout. The label itself carries the chart series color.
/** @param {string} color */
export const seriesStyle = color => {
  const rgb = color.startsWith('rgb') ? color.match(/[\d.]+/g)?.slice(0, 3) : null;
  const solid = rgb?.length === 3 ? `rgb(${rgb.join(',')})` : color;
  return `--series:${solid}`;
};

// Export-only wrapping keeps the compact TradingView legend typography readable in a fixed-width PNG.
/** @param {string} text @param {(text:string)=>number} measure @param {number} width */
export function wrapLines(text, measure, width) {
  const lines = []; let line = '';
  for (const word of text.split(/\s+/)) {
    if (line && measure(`${line} ${word}`) > width) { lines.push(line); line = ''; }
    for (const char of (line ? ` ${word}` : word)) {
      if (line && measure(line + char) > width) { lines.push(line); line = ''; }
      line += char;
    }
  }
  if (line) lines.push(line);
  return lines;
}
/** @param {{label:string,color:string}[]} entries @param {(text:string)=>number} measure @param {number} width */
export function layoutLegend(entries, measure, width) {
  const items = []; let x = 0, y = 0, row = 0;
  for (const entry of entries) {
    const lines = wrapLines(entry.label, measure, width);
    const w = Math.min(width, Math.max(...lines.map(measure), 0)), h = Math.max(20, lines.length * 18);
    if (x && x + w > width) { x = 0; y += row + 6; row = 0; }
    items.push({ ...entry, x, y, width: w, height: h, lines });
    x += w + 20; row = Math.max(row, h);
  }
  return { items, height: items.length ? y + row : 0 };
}
/** @param {CanvasRenderingContext2D} ctx @param {ReturnType<typeof layoutLegend>} layout @param {{x:number,y:number,font:string}} options */
export function drawLegend(ctx, layout, { x, y, font }) {
  ctx.save(); ctx.font = font.replace(/^400\s/, '600 '); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  for (const item of layout.items) {
    ctx.fillStyle = item.color;
    item.lines.forEach((line, i) => ctx.fillText(line, x + item.x, y + item.y + 14 + i * 18));
  }
  ctx.restore();
  return y + layout.height;
}

// Existing layer keys remain internal color sources; the complete label carries identity on screen.
/** @param {ParentNode} root */
export function paintLegend(root) {
  for (const label of /** @type {NodeListOf<HTMLElement>} */(root.querySelectorAll('.legend .label:has(.key)'))) {
    const key = label.querySelector('.key');
    if (!key) continue;
    const style = getComputedStyle(key);
    const color = style.backgroundColor === 'rgba(0, 0, 0, 0)' ? style.borderTopColor : style.backgroundColor;
    label.classList.add('series-label'); label.style.cssText = seriesStyle(color);
  }
}
export function initSeriesSurfaces() {
  const root = document.getElementById('chartHead');
  if (!root) return;
  const paint = () => paintLegend(root);
  const observer = new MutationObserver(paint);
  const observe = () => observer.observe(root, { childList: true, subtree: true });
  observe();
  addEventListener('pagehide', () => observer.disconnect());
  addEventListener('pageshow', e => { if (e.persisted) { observe(); paint(); } });
  addEventListener('tv:theme', paint); paint();
}
