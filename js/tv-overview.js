/*
 * What the overview pages share (css/tv-overview.css): TradingView's market-summary chart (an area under a line, its
 * gradient fading to the page), a squarified heatmap, change pills, symbol logos, sortable tables, the floating
 * tooltip and the world search that opens a world in its terminal.
 */
import { cssToken as token, cssPixels } from './theme.js';
import { openDialog, updateListbox } from './tv-ui.js';

export const $ = id => document.getElementById(id);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = name => `<svg aria-hidden="true"><use href="css/tv-icons.svg#${name}"/></svg>`;
export const percent = new Intl.NumberFormat('en-US', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });
export const tone = v => (v > 0 ? 'up' : v < 0 ? 'down' : '');
export const pill = r => r == null || !Number.isFinite(r) ? '<span class="tv-pill">N/A</span>' : `<span class="tv-pill ${tone(r)}">${percent.format(r)}</span>`;
const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 2 });
export const short = v => (Number.isFinite(v) ? compact.format(v) : 'N/A');
export const whole = v => (Number.isFinite(v) ? Math.round(v).toLocaleString('en-US') : 'N/A');

// A logo for a name: its initial on one of TradingView's colours, the same for the same name.
const LOGO = ['#2962ff', '#089981', '#f23645', '#ff9800', '#9c27b0', '#00bcd4', '#e91e63', '#673ab7', '#4caf50', '#f57c00'];
export function logo(name, cls = '') {
  let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `<span class="tv-logo-chip ${cls}" style="--c:${LOGO[h % LOGO.length]}" aria-hidden="true">${esc(name[0] ?? '?')}</span>`;
}

/* ------------------------------------------------------------- the chart */
// The summary chart: one area series, TradingView's blue (or the series' own colour), no vertical grid, the crosshair
// in the page's tokens; re-themed with the page.
export function summaryChart(container, { format = short } = {}) {
  const L = window.LightweightCharts;
  if (!L) { container.textContent = 'Chart unavailable.'; return null; }
  const chart = L.createChart(container, {
    autoSize: true,
    layout: { background: { type: 'solid', color: 'transparent' }, textColor: token('--tv-text-2'), fontFamily: token('--tv-font'), fontSize: cssPixels('--tv-size-12'), attributionLogo: false },
    grid: { vertLines: { visible: false }, horzLines: { color: token('--tv-chart-grid') } },
    rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.1, bottom: 0.05 } },
    timeScale: { borderVisible: false, fixLeftEdge: true, fixRightEdge: true },
    crosshair: { vertLine: { color: token('--tv-crosshair'), labelBackgroundColor: token('--tv-crosshair-label') }, horzLine: { color: token('--tv-crosshair'), labelBackgroundColor: token('--tv-crosshair-label') } },
    handleScroll: false, handleScale: false,
    localization: { priceFormatter: format },
  });
  const area = chart.addSeries(L.AreaSeries, { lineWidth: 2, priceLineVisible: false, lastValueVisible: true, crosshairMarkerRadius: 4 });
  let color = token('--tv-brand');
  const paint = () => area.applyOptions({ lineColor: color, topColor: `${color}47`, bottomColor: `${color}00` });
  addEventListener('tv:theme', () => chart.applyOptions({ layout: { textColor: token('--tv-text-2') }, grid: { horzLines: { color: token('--tv-chart-grid') } },
    crosshair: { vertLine: { color: token('--tv-crosshair'), labelBackgroundColor: token('--tv-crosshair-label') }, horzLine: { color: token('--tv-crosshair'), labelBackgroundColor: token('--tv-crosshair-label') } } }));
  return {
    chart,
    set(data, { color: c = token('--tv-brand'), format: f } = {}) {
      color = c; paint();
      if (f) area.applyOptions({ priceFormat: { type: 'custom', formatter: f, minMove: 0.00001 } });
      area.setData(data);
      chart.timeScale().fitContent();
    },
    // A logarithmic scale, for accumulated figures.
    log(on) { chart.priceScale('right').applyOptions({ mode: on ? L.PriceScaleMode.Logarithmic : L.PriceScaleMode.Normal }); },
    show(from) {
      const data = area.data();
      if (!data.length) return;
      const first = from && from > data[0].time ? data.find(d => d.time >= from)?.time ?? data[0].time : data[0].time;
      chart.timeScale().setVisibleRange({ from: first, to: data.at(-1).time });
    },
  };
}

/* ----------------------------------------------------------- the heatmap */
// TradingView's heatmap colours, from a strong fall to a strong rise; `steps` are the change at each boundary.
const HEAT = ['#f23645', '#f7525f', '#f77c80', '#8c8c8c', '#42bda8', '#22ab94', '#089981'];
export function heatColor(r, steps) {
  if (r == null || !Number.isFinite(r)) return '#707070';
  const [a, b, c] = steps;
  return r <= -c ? HEAT[0] : r <= -b ? HEAT[1] : r <= -a ? HEAT[2] : r < a ? HEAT[3] : r < b ? HEAT[4] : r < c ? HEAT[5] : HEAT[6];
}
export const heatScale = steps => `<span style="background:${HEAT[0]}">${percent.format(-steps[2])}</span><span style="background:${HEAT[1]}">${percent.format(-steps[1])}</span>`
  + `<span style="background:${HEAT[2]}">${percent.format(-steps[0])}</span><span style="background:${HEAT[3]}">0%</span><span style="background:${HEAT[4]}">${percent.format(steps[0])}</span>`
  + `<span style="background:${HEAT[5]}">${percent.format(steps[1])}</span><span style="background:${HEAT[6]}">${percent.format(steps[2])}</span>`;

// Squarified treemap (Bruls, Huizing and van Wijk): rows along the shorter side, a tile joining a row while the
// row's worst aspect ratio improves.
export function squarify(items, width, height) {
  const total = items.reduce((a, i) => a + i.weight, 0);
  if (!total) return [];
  const scale = width * height / total;
  let rest = items.filter(i => i.weight > 0).sort((a, b) => b.weight - a.weight).map(i => ({ ...i, area: i.weight * scale }));
  let x = 0, y = 0, w = width, h = height;
  const out = [];
  const worst = (row, s) => {
    const sum = row.reduce((a, r) => a + r.area, 0), max = Math.max(...row.map(r => r.area)), min = Math.min(...row.map(r => r.area));
    return Math.max(s * s * max / (sum * sum), sum * sum / (s * s * min));
  };
  while (rest.length) {
    const s = Math.min(w, h);
    let row = [rest[0]], best = worst(row, s), i = 1;
    for (; i < rest.length; i++) { const next = [...row, rest[i]], ratio = worst(next, s); if (ratio > best) break; row = next; best = ratio; }
    const sum = row.reduce((a, r) => a + r.area, 0);
    if (w >= h) { const cw = sum / h; let cy = y; for (const r of row) { const ch = r.area / cw; out.push({ ...r, x, y: cy, w: cw, h: ch }); cy += ch; } x += cw; w -= cw; }
    else { const ch = sum / w; let cx = x; for (const r of row) { const cw = r.area / ch; out.push({ ...r, x: cx, y, w: cw, h: ch }); cx += cw; } y += ch; h -= ch; }
    rest = rest.slice(row.length);
  }
  return out;
}
// items: [{ name, weight, change, href, tip }]; drawn into `box`, again as it resizes.
export function heatmap(box, { steps }) {
  let items = [];
  const tip = floatingTip();
  function draw() {
    const { width, height } = box.getBoundingClientRect();
    box.innerHTML = squarify(items, width, height).map(t => {
      const big = t.w > 64 && t.h > 34, size = Math.max(11, Math.min(22, Math.sqrt(t.w * t.h) / 6));
      return `<a class="tv-tile${Number.isFinite(t.change) ? '' : ' is-empty'}" href="${esc(t.href)}" data-name="${esc(t.name)}" style="left:${t.x}px;top:${t.y}px;width:${t.w}px;height:${t.h}px;background:${heatColor(t.change, steps())};font-size:${size}px" aria-label="${esc(t.name)} ${t.change == null ? '' : percent.format(t.change)}">`
        + (t.w > 30 && t.h > 18 ? `<span>${esc(t.name)}</span>` : '') + (big ? `<span class="tv-tile-change">${t.change == null ? 'N/A' : percent.format(t.change)}</span>` : '') + '</a>';
    }).join('');
  }
  new ResizeObserver(() => requestAnimationFrame(draw)).observe(box);
  box.addEventListener('pointermove', e => {
    const name = e.target.closest('.tv-tile')?.dataset.name, item = items.find(i => i.name === name);
    item ? tip.show(e.clientX, e.clientY, item.tip) : tip.hide();
  });
  box.addEventListener('pointerleave', () => tip.hide());
  return { set(next) { items = next; draw(); } };
}

export function floatingTip() {
  const el = Object.assign(document.createElement('div'), { className: 'tv-tip-float', hidden: true });
  el.setAttribute('role', 'tooltip');
  document.body.append(el);
  return {
    show(x, y, html) {
      el.innerHTML = html; el.hidden = false;
      const r = el.getBoundingClientRect();
      el.style.left = `${Math.min(x + 14, innerWidth - r.width - 8)}px`;
      el.style.top = `${y + 16 + r.height > innerHeight ? y - r.height - 12 : y + 16}px`;
    },
    hide() { el.hidden = true; },
  };
}

/* --------------------------------------------------------------- tables */
// columns: [{ key, label, value(row) for sorting, cell(row) html, left?, dir? (first-click direction) }]
export function sortableTable(table, columns, { onOpen, initial }) {
  let rows = [], sort = initial ?? { key: columns[0].key, dir: 1 }, filter = '';
  table.innerHTML = `<thead><tr>${columns.map(c => `<th scope="col" class="${c.left ? 'tv-text-left' : ''}" data-key="${c.key}"><button type="button">${esc(c.label)}</button></th>`).join('')}</tr></thead><tbody></tbody>`;
  const body = table.tBodies[0];
  function draw() {
    const col = columns.find(c => c.key === sort.key), q = filter.trim().toLowerCase();
    const shown = rows.filter(r => !q || r.search.includes(q)).sort((a, b) => {
      const x = col.value(a), y = col.value(b);
      if (x == null || y == null) return (x == null) - (y == null);
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * sort.dir;
    });
    body.innerHTML = shown.map(r => `<tr data-key="${esc(r.key)}">${columns.map(c => `<td class="${c.left ? 'tv-text-left' : ''}">${c.cell(r)}</td>`).join('')}</tr>`).join('');
    for (const th of table.tHead.rows[0].cells) th.setAttribute('aria-sort', th.dataset.key === sort.key ? (sort.dir > 0 ? 'ascending' : 'descending') : 'none');
  }
  table.tHead.addEventListener('click', e => {
    const key = e.target.closest('th')?.dataset.key; if (!key) return;
    const col = columns.find(c => c.key === key);
    sort = { key, dir: sort.key === key ? -sort.dir : col.dir ?? (col.left ? 1 : -1) };
    draw();
  });
  body.addEventListener('click', e => { const tr = e.target.closest('tr[data-key]'); if (tr && !e.target.closest('a')) onOpen?.(tr.dataset.key); });
  return { set(next) { rows = next; draw(); }, filter(q) { filter = q; draw(); } };
}

/* ---------------------------------------------------------- world search */
// The header's search: a world by name, type or location, opened in its terminal.
export function worldSearch(button, items, hrefOf) {
  let dialog = null;
  function open(prefill = '') {
    if (!dialog) {
      dialog = Object.assign(document.createElement('dialog'), { className: 'tv-dialog tv-search' });
      dialog.setAttribute('aria-label', 'World search');
      dialog.innerHTML = `<div class="tv-dialog-head"><h2>World search</h2><button type="button" class="tv-btn tv-icon tv-dialog-close" aria-label="Close" data-close>${icon('close')}</button></div>
        <label class="tv-dialog-search">${icon('search')}<input type="search" placeholder="World, type or location" aria-label="Search worlds" autocomplete="off"></label>
        <ul class="tv-results" role="listbox" aria-label="Worlds"></ul>`;
      document.body.append(dialog);
      const input = dialog.querySelector('input'), list = dialog.querySelector('ul');
      const draw = () => {
        const q = input.value.trim().toLowerCase();
        list.innerHTML = items().filter(w => !q || `${w.name} ${w.meta}`.toLowerCase().includes(q))
          .sort((a, b) => (q && b.name.toLowerCase().startsWith(q)) - (q && a.name.toLowerCase().startsWith(q)) || a.name.localeCompare(b.name)).slice(0, 200)
          .map((w, i) => `<li role="option" class="${i ? '' : 'active'}" data-name="${esc(w.name)}"><span><span class="tv-r-name">${esc(w.name)}</span><br><span class="tv-r-desc">${esc(w.meta)}</span></span><span class="tv-r-last">${esc(w.value ?? '')}</span><span class="tv-r-meta ${tone(w.change)}">${w.change == null ? '' : percent.format(w.change)}</span></li>`).join('')
          || '<li class="tv-empty" role="status">'+icon('search')+'<span>No world matches.</span></li>';
        updateListbox(input, list);
      };
      const go = li => { if (li) location.assign(hrefOf(li.dataset.name)); };
      input.addEventListener('input', draw);
      input.addEventListener('keydown', e => {
        const all = [...list.querySelectorAll('li[data-name]')], at = all.findIndex(li => li.classList.contains('active'));
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); all[at]?.classList.remove('active'); const n = all[Math.max(0, Math.min(all.length - 1, at + (e.key === 'ArrowDown' ? 1 : -1)))]; n?.classList.add('active'); n?.scrollIntoView({ block: 'nearest' }); updateListbox(input, list); }
        if (e.key === 'Enter') { e.preventDefault(); go(list.querySelector('li.active')); }
      });
      list.addEventListener('click', e => go(e.target.closest('li[data-name]')));
      dialog.draw = draw;
    }
    const input = dialog.querySelector('input');
    input.value = prefill;
    dialog.draw();
    openDialog(dialog, { opener: button, focus: input });
  }
  button?.addEventListener('click', () => open());
  document.addEventListener('keydown', e => {
    if ((/Mac|iPhone|iPad/.test(navigator.platform) ? e.metaKey : e.ctrlKey) && e.code === 'KeyK') { e.preventDefault(); open(); }
  });
}

// Each section's chip scrolls to it; the page's chips mark the section in view.
export function sectionChips(nav) {
  const links = [...nav.querySelectorAll('a[href^="#"]')];
  const io = new IntersectionObserver(entries => {
    for (const e of entries) if (e.isIntersecting) links.forEach(a => a.setAttribute('aria-selected', String(a.getAttribute('href') === `#${e.target.id}`)));
  }, { rootMargin: '-40% 0px -55% 0px' });
  links.forEach(a => { const s = document.querySelector(a.getAttribute('href')); if (s) io.observe(s); });
}
