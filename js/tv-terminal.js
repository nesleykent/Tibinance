/*
 * The TradingView terminal around a page's chart (markets.html, economy.html): the top toolbar (world search, chart
 * style, indicators, templates, replay, undo and redo), the drawing toolbar, the floating toolbar of a selected
 * drawing, the object tree, the bottom toolbar's clock and price-scale modes, and TradingView's hotkeys. It works
 * through the context the page connects (js/tv-bridge.js), so a page keeps its own data and state.
 */
import { cssToken as token, cssPixels } from './theme.js';
import { openDialog, updateListbox, menuKeyboard } from './tv-ui.js';
import { bridge, whenConnected } from './tv-bridge.js';
import { createDrawings, TOOLS, PALETTE } from './tv-drawings.js?v=20261014-tv';
import { createIndicators, INDICATORS } from './tv-indicators.js?v=20261014-tv';
import { newsList } from './tv-news.js?v=20261015-design';

const $ = id => document.getElementById(id);
const icon = (name, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} aria-hidden="true"><use href="css/tv-icons.svg#${name}"/></svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* this visit only */ } };
const mac = /Mac|iPhone|iPad/.test(navigator.platform);
const typing = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
const percent = new Intl.NumberFormat(undefined, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'exceptZero' });

const area = document.querySelector('.tv-terminal .chart-area');
let ctx = null;
const drawings = area && createDrawings({ area, onChange: drawingsChanged });
const indicators = createIndicators({ legend: $('indicatorLegend'), onChange: () => {} });

/* ------------------------------------------------------------------ popups */
// A menu under its button, as TradingView opens its dropdowns: Escape or a press outside closes it.
let openPopup = null;
function popup(button, html, { onClick, align = 'start', className = '' } = {}) {
  closePopup(false);
  const el = Object.assign(document.createElement('div'), { className: `tv-popup ${className}`, innerHTML: html });
  el.setAttribute('role', 'menu');
  el.style.position = 'fixed'; el.style.zIndex = token('--tv-layer-popup');
  document.body.append(el);
  const r = button.getBoundingClientRect(), w = el.offsetWidth;
  el.style.top = `${r.bottom + cssPixels('--tv-size-4')}px`;
  el.style.left = `${Math.max(8, Math.min(align === 'end' ? r.right - w : r.left, innerWidth - w - 8))}px`;
  button.setAttribute('aria-expanded', 'true');
  el.addEventListener('click', e => { const item = e.target.closest('[data-value]'); if (item) { onClick?.(item.dataset.value, item, e); } });
  const outside = e => { if (!el.contains(e.target) && !button.contains(e.target)) closePopup(false); };
  document.addEventListener('pointerdown', outside, true);
  openPopup = { el, button, outside };
  menuKeyboard(el, closePopup);
  return el;
}
function closePopup(focusButton = true) {
  if (!openPopup) return;
  document.removeEventListener('pointerdown', openPopup.outside, true);
  openPopup.button.setAttribute('aria-expanded', 'false');
  const button = openPopup.button;
  openPopup.el.remove();
  openPopup = null;
  if (focusButton && button.isConnected) button.focus({ preventScroll: true });
}

/* ------------------------------------------------------------- chart style */
const STYLES = [['line', 'Line', 'line'], ['markers', 'Line with markers', 'line-markers'], ['step', 'Step line', 'step']];
const styleKey = () => `tibinance.tv.style.${ctx?.page}`;
function setStyle(style, { save = true } = {}) {
  const s = STYLES.find(x => x[0] === style) ?? STYLES[1];
  ctx?.setStyle?.(s[0]);
  const b = $('tvStyle');
  if (b) { b.innerHTML = icon(s[2]); b.title = `Chart style: ${s[1]}`; b.dataset.style = s[0]; }
  if (save) write(styleKey(), s[0]);
}
$('tvStyle')?.addEventListener('click', e => {
  const current = e.currentTarget.dataset.style ?? 'markers';
  popup(e.currentTarget, STYLES.map(([id, name, ic]) => `<button type="button" role="menuitemradio" aria-checked="${id === current}" data-value="${id}">${icon(ic)}<span>${name}</span></button>`).join(''),
    { onClick: v => { setStyle(v); closePopup(); } });
});

/* -------------------------------------------------------------- indicators */
let indicatorDialog = null;
function showIndicators() {
  if (!indicatorDialog) {
    indicatorDialog = Object.assign(document.createElement('dialog'), { className: 'tv-dialog tv-search tv-indicators' });
    indicatorDialog.setAttribute('aria-label', 'Indicators');
    indicatorDialog.innerHTML = `<div class="tv-dialog-head"><h2>Indicators</h2><button type="button" class="tv-btn tv-icon tv-dialog-close" aria-label="Close" data-close>${icon('close')}</button></div>
      <label class="tv-dialog-search">${icon('search')}<input type="search" placeholder="Search" aria-label="Search indicators"></label>
      <ul class="tv-results" role="listbox" aria-label="Indicators"></ul>`;
    document.body.append(indicatorDialog);
    const input = indicatorDialog.querySelector('input'), list = indicatorDialog.querySelector('ul');
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const shown = Object.entries(INDICATORS).filter(([, s]) => !q || s.name.toLowerCase().includes(q) || s.short.toLowerCase().includes(q));
      list.innerHTML = shown.map(([id, s], i) => `<li role="option" data-id="${id}" class="${i ? '' : 'active'}"><span class="tv-r-name">${esc(s.name)}</span><span class="tv-r-meta">${esc(s.short)}</span><span></span></li>`).join('')
        + (!shown.length ? '<li class="tv-empty" role="status">No indicator matches.</li>' : '')
        + (indicators.list().length ? `<li class="tv-r-shown" aria-disabled="true"><span class="tv-r-desc">On the chart: ${indicators.list().map(i => esc(i.label)).join(', ')}</span><span></span><span class="tv-r-meta"><button type="button" class="tv-btn" data-clear>Remove all</button></span></li>` : '');
      updateListbox(input, list);
    };
    input.addEventListener('input', draw);
    input.addEventListener('keydown', e => {
      const items = [...list.querySelectorAll('li[data-id]')], at = items.findIndex(li => li.classList.contains('active'));
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault(); items[at]?.classList.remove('active');
        items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.classList.add('active');
        updateListbox(input, list);
      }
      if (e.key === 'Enter' && items[at]) { indicators.add(items[at].dataset.id); draw(); }
    });
    list.addEventListener('click', e => {
      if (e.target.closest('[data-clear]')) { indicators.removeAll(); draw(); return; }
      const li = e.target.closest('li[data-id]'); if (li) { indicators.add(li.dataset.id); draw(); }
    });
    indicatorDialog.draw = draw;
  }
  indicatorDialog.querySelector('input').value = '';
  indicatorDialog.draw();
  openDialog(indicatorDialog, { opener: $('tvIndicators') });
}
$('tvIndicators')?.addEventListener('click', showIndicators);

// Templates: the indicators on the chart, saved under a name and applied again in one press.
$('tvTemplates')?.addEventListener('click', e => {
  const button = e.currentTarget, names = Object.keys(indicators.templates());
  const el = popup(button, `<div class="tv-item" style="cursor:default;color:var(--tv-text-2);font-size:12px;min-height:28px">INDICATOR TEMPLATES</div>`
    + (names.length ? names.map(n => `<button type="button" role="menuitem" data-value="apply:${esc(n)}"><span>${esc(n)}</span><span class="tv-hint" data-value="delete:${esc(n)}" title="Delete template">×</span></button>`).join('')
      : '<div class="tv-item" style="cursor:default;color:var(--tv-text-2)">No templates yet</div>')
    + `<hr><form class="tv-item" style="gap:6px;cursor:default"><input class="tv-input" style="height:30px;flex:1;min-width:0" placeholder="Template name" aria-label="Template name" required><button type="submit" class="tv-btn" ${indicators.list().length ? '' : 'disabled'}>Save</button></form>`,
    { onClick: (v, item, ev) => {
      ev.stopPropagation();
      const [action, name] = [v.slice(0, v.indexOf(':')), v.slice(v.indexOf(':') + 1)];
      if (action === 'delete') { indicators.deleteTemplate(name); closePopup(); return; }
      indicators.applyTemplate(name); closePopup();
    } });
  el.querySelector('form').addEventListener('submit', ev => { ev.preventDefault(); indicators.saveTemplate(ev.target.querySelector('input').value.trim()); closePopup(); });
});

/* ------------------------------------------------------------ world search */
let searchDialog = null;
function showSearch(prefill = '') {
  if (!ctx?.worlds) return;
  if (!searchDialog) {
    searchDialog = Object.assign(document.createElement('dialog'), { className: 'tv-dialog tv-search' });
    searchDialog.setAttribute('aria-label', 'World search');
    searchDialog.innerHTML = `<div class="tv-dialog-head"><h2>World search</h2><button type="button" class="tv-btn tv-icon tv-dialog-close" aria-label="Close" data-close>${icon('close')}</button></div>
      <label class="tv-dialog-search">${icon('search')}<input type="search" placeholder="World, type or location" aria-label="Search worlds" autocomplete="off"></label>
      <div class="tv-dialog-tabs" role="group" aria-label="Show"><button type="button" data-tab="all" aria-pressed="true">All</button><button type="button" data-tab="active" aria-pressed="false">Active</button><button type="button" data-tab="retired" aria-pressed="false">Retired</button></div>
      <ul class="tv-results" role="listbox" aria-label="Worlds"></ul>`;
    document.body.append(searchDialog);
    const input = searchDialog.querySelector('input'), list = searchDialog.querySelector('ul');
    let tab = 'all';
    const draw = () => {
      const q = input.value.trim().toLowerCase();
      const rows = ctx.worlds().filter(w => (tab === 'all' || (tab === 'retired') === !!w.retired) && (!q || `${w.world} ${w.meta ?? ''}`.toLowerCase().includes(q)))
        .sort((a, b) => (q && b.world.toLowerCase().startsWith(q)) - (q && a.world.toLowerCase().startsWith(q)) || a.world.localeCompare(b.world));
      list.innerHTML = rows.slice(0, 200).map((w, i) => `<li role="option" data-world="${esc(w.world)}" class="${i ? '' : 'active'}" aria-selected="${!i}">
        <span><span class="tv-r-name">${esc(w.world)}</span>${w.retired ? ' <span class="tv-chip">Retired</span>' : ''}<br><span class="tv-r-desc">${esc(w.meta ?? '')}</span></span>
        <span class="tv-r-last">${w.last == null ? '' : esc(w.lastText ?? ctx.format(w.last))}</span>
        <span class="tv-r-meta ${w.ratio > 0 ? 'up' : w.ratio < 0 ? 'down' : ''}">${w.ratio == null ? '' : percent.format(w.ratio)}</span></li>`).join('')
        || '<li class="tv-empty" role="status">'+icon('search')+'<span>No world matches.</span></li>';
      updateListbox(input, list);
    };
    const move = d => {
      const items = [...list.querySelectorAll('li[data-world]')], at = items.findIndex(li => li.classList.contains('active'));
      items[at]?.classList.remove('active'); items[at]?.setAttribute('aria-selected', 'false');
      const next = items[Math.max(0, Math.min(items.length - 1, at + d))];
      next?.classList.add('active'); next?.setAttribute('aria-selected', 'true'); next?.scrollIntoView({ block: 'nearest' });
      updateListbox(input, list);
    };
    const pick = li => { if (!li) return; searchDialog.close(); ctx.open(li.dataset.world); };
    input.addEventListener('input', draw);
    input.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      if (e.key === 'Enter') { e.preventDefault(); pick(list.querySelector('li.active')); }
    });
    list.addEventListener('click', e => pick(e.target.closest('li[data-world]')));
    searchDialog.querySelector('.tv-dialog-tabs').addEventListener('click', e => {
      const b = e.target.closest('[data-tab]'); if (!b) return;
      tab = b.dataset.tab;
      searchDialog.querySelectorAll('[data-tab]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      draw(); input.focus();
    });
    searchDialog.draw = draw;
  }
  const input = searchDialog.querySelector('input');
  input.value = prefill;
  searchDialog.draw();
  openDialog(searchDialog, { opener: $('tvSymbol'), focus: input });
}
$('tvSymbol')?.addEventListener('click', () => showSearch());

/* ------------------------------------------------------------------ replay */
// Bar replay: the chart as of a chosen day, then forward one bar at a time or playing. The future stays hidden.
const replay = { day: null, timer: null, speed: 1, picking: false };
const replayBar = $('replayBar');
// TradingView's autoplay speeds and their delays (its autoplayDelayList).
const SPEEDS = [[0.5, 2000], [1, 1000], [3, 300], [5, 200], [7, 143], [10, 100]];
function replayTimes() { return ctx?.times?.() ?? []; }
function showReplayBar() {
  if (!replayBar) return;
  replayBar.hidden = !(replay.day || replay.picking);
  replayBar.innerHTML = replay.picking
    ? `<output>Click the chart to start</output><button type="button" class="tv-btn tv-icon" data-r="exit" aria-label="Exit replay" title="Exit replay">${icon('close')}</button>`
    : `<button type="button" class="tv-btn tv-icon" data-r="pick" aria-label="Select bar" title="Select bar">${icon('replay')}</button>
       <button type="button" class="tv-btn tv-icon" data-r="play" aria-label="${replay.timer ? 'Pause' : 'Play'}" title="${replay.timer ? 'Pause' : 'Play'}">${replay.timer
         ? '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M10 8v12M18 8v12" stroke-width="2"/></svg>'
         : '<svg viewBox="0 0 28 28" aria-hidden="true"><path d="M10 8l10 6-10 6z" fill="currentColor"/></svg>'}</button>
       <button type="button" class="tv-btn tv-icon" data-r="step" aria-label="Forward" title="Forward (Shift+→)"><svg viewBox="0 0 28 28" aria-hidden="true"><path d="M8 8l8 6-8 6zM19 8v12" fill="currentColor" stroke="currentColor"/></svg></button>
       <button type="button" class="tv-btn" data-r="speed" title="Speed">${replay.speed}x</button>
       <output>${esc(replay.day)}</output>
       <button type="button" class="tv-btn tv-icon" data-r="exit" aria-label="Exit replay" title="Exit replay">${icon('close')}</button>`;
  $('tvReplay')?.setAttribute('aria-pressed', String(!!(replay.day || replay.picking)));
}
function replayTo(day) {
  replay.day = day;
  ctx?.replay?.(day);
  drawings?.redraw();
  indicators.refresh();
  showReplayBar();
}
function replayStep() {
  const times = replayTimes(), i = times.indexOf(replay.day);
  if (i === -1 || i >= times.length - 1) { stopPlaying(); return false; }
  replayTo(times[i + 1]);
  return true;
}
function stopPlaying() { clearInterval(replay.timer); replay.timer = null; showReplayBar(); }
function exitReplay() {
  stopPlaying(); replay.day = null; replay.picking = false;
  area?.classList.remove('is-drawing');
  ctx?.replay?.(null); drawings?.redraw(); indicators.refresh(); showReplayBar();
}
replayBar?.addEventListener('click', e => {
  const action = e.target.closest('[data-r]')?.dataset.r;
  if (action === 'exit') exitReplay();
  if (action === 'pick') { stopPlaying(); replay.picking = true; area?.classList.add('is-drawing'); showReplayBar(); }
  if (action === 'step') { stopPlaying(); replayStep(); }
  if (action === 'play') {
    if (replay.timer) stopPlaying();
    else { replay.timer = setInterval(() => replayStep(), SPEEDS.find(s => s[0] === replay.speed)[1]); showReplayBar(); }
  }
  if (action === 'speed') {
    const i = SPEEDS.findIndex(s => s[0] === replay.speed); replay.speed = SPEEDS[(i + 1) % SPEEDS.length][0];
    if (replay.timer) { stopPlaying(); replay.timer = setInterval(() => replayStep(), SPEEDS.find(s => s[0] === replay.speed)[1]); }
    showReplayBar();
  }
});
area?.addEventListener('pointerdown', e => {
  if (!replay.picking || !ctx) return;
  const r = area.getBoundingClientRect(), x = e.clientX - r.left;
  if (x > ctx.chart.timeScale().width()) return;
  e.preventDefault(); e.stopPropagation();
  const t = ctx.chart.timeScale().coordinateToTime(x);
  const day = typeof t === 'string' ? t : t && typeof t === 'object' ? `${t.year}-${String(t.month).padStart(2, '0')}-${String(t.day).padStart(2, '0')}` : null;
  replay.picking = false; area.classList.remove('is-drawing');
  if (day) replayTo(replayTimes().filter(d => d <= day).at(-1) ?? day); else showReplayBar();
}, true);
$('tvReplay')?.addEventListener('click', () => {
  if (replay.day || replay.picking) { exitReplay(); return; }
  replay.picking = true; area?.classList.add('is-drawing'); showReplayBar();
});

/* ---------------------------------------------------------------- drawings */
function drawingsChanged(reason) {
  if (!drawings) return;
  document.querySelectorAll('#drawbar [data-tool]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.tool === drawings.tool)));
  const f = drawings.flags;
  $('drawMagnet')?.setAttribute('aria-pressed', String(f.magnet));
  $('drawLock')?.setAttribute('aria-pressed', String(f.lock));
  $('drawHide')?.setAttribute('aria-pressed', String(f.hide));
  if ($('tvUndo')) $('tvUndo').disabled = !drawings.canUndo();
  if ($('tvRedo')) $('tvRedo').disabled = !drawings.canRedo();
  if (reason !== 'tool') drawObjectTree();
  showFloat();
}
document.getElementById('drawbar')?.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || !drawings) return;
  if (b.dataset.tool) drawings.setTool(b.dataset.tool === drawings.tool && b.dataset.tool !== 'cursor' ? 'cursor' : b.dataset.tool);
  if (b.id === 'drawMagnet') drawings.setFlag('magnet', !drawings.flags.magnet);
  if (b.id === 'drawLock') drawings.setFlag('lock', !drawings.flags.lock);
  if (b.id === 'drawHide') drawings.setFlag('hide', !drawings.flags.hide);
  if (b.id === 'drawRemove') drawings.removeAll();
});
// News, as TradingView's widget bar lists a symbol's: loaded the first time the panel opens (or opens remembered).
const news = $('newsList') && newsList($('newsList'));
$('newsToggle')?.addEventListener('click', () => news?.load());
if ($('newsPanel')?.classList.contains('is-open')) news?.load();
new MutationObserver(() => { if ($('newsPanel')?.classList.contains('is-open')) news?.load(); }).observe($('newsPanel') ?? document.createElement('i'), { attributes: true, attributeFilter: ['class'] });
$('tvUndo')?.addEventListener('click', () => drawings?.undo());
// At full screen the header is out of view: the rail's own button leaves it, as the header's would.
$('tvExitFull')?.addEventListener('click', () => $('expand')?.click());
$('tvRedo')?.addEventListener('click', () => drawings?.redo());

// The selected drawing's own toolbar: colour, width, line style, clone, lock, remove.
const float = area && Object.assign(document.createElement('div'), { className: 'tv-float', hidden: true });
if (float) { float.setAttribute('role', 'toolbar'); float.setAttribute('aria-label', 'Drawing'); area.append(float); }
const STYLE_NAMES = ['Solid', 'Dotted', 'Dashed'];
function showFloat() {
  if (!float) return;
  const d = drawings.current;
  float.hidden = !d || drawings.flags.hide;
  if (!d) return;
  const dash = ['', '1 3', '5 4'][d.style ?? 0];
  float.innerHTML = `<button type="button" class="tv-btn tv-icon" data-f="color" aria-label="Colour" title="Colour"><span class="tv-swatch" style="background:${esc(d.color)}"></span></button>
    <button type="button" class="tv-btn" data-f="width" title="Line width">${d.width}px</button>
    <button type="button" class="tv-btn tv-icon" data-f="style" aria-label="Line style: ${STYLE_NAMES[d.style ?? 0]}" title="Line style: ${STYLE_NAMES[d.style ?? 0]}"><svg viewBox="0 0 28 28" aria-hidden="true"><path d="M5 14h18" stroke-width="2" stroke-dasharray="${dash}"/></svg></button>
    <span class="tv-divider" aria-hidden="true"></span>
    ${d.type === 'text' ? `<button type="button" class="tv-btn" data-f="size" title="Font size">${d.size ?? 14}</button>` : ''}
    <button type="button" class="tv-btn tv-icon" data-f="clone" aria-label="Clone" title="Clone">${icon('plus')}</button>
    <button type="button" class="tv-btn tv-icon" data-f="lock" aria-pressed="${!!d.locked}" aria-label="Lock" title="${d.locked ? 'Unlock' : 'Lock'}">${icon('lock')}</button>
    <button type="button" class="tv-btn tv-icon" data-f="remove" aria-label="Remove" title="Remove (Delete)">${icon('trash')}</button>`;
  float.style.top = '8px';
  float.style.right = `${(ctx?.chart.priceScale('right').width() ?? 60) + 16}px`;
}
float?.addEventListener('pointerdown', e => e.stopPropagation());
float?.addEventListener('click', e => {
  const action = e.target.closest('[data-f]')?.dataset.f, d = drawings.current;
  if (!action || !d) return;
  if (action === 'color') {
    popup(e.target.closest('button'), `<div class="tv-colors" role="radiogroup" aria-label="Colour">${PALETTE.map(c =>
      `<button type="button" role="radio" aria-checked="${c.toLowerCase() === d.color.toLowerCase()}" data-value="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div>`,
    { onClick: c => { drawings.update(d.id, { color: c }); closePopup(); } });
    return;
  }
  if (action === 'width') drawings.update(d.id, { width: d.width % 4 + 1 });
  if (action === 'style') drawings.update(d.id, { style: ((d.style ?? 0) + 1) % 3 });
  if (action === 'size') drawings.update(d.id, { size: [10, 12, 14, 16, 20, 24, 28][([10, 12, 14, 16, 20, 24, 28].indexOf(d.size ?? 14) + 1) % 7] });
  if (action === 'clone') drawings.clone(d.id);
  if (action === 'lock') drawings.update(d.id, { locked: !d.locked });
  if (action === 'remove') drawings.remove(d.id);
});

// The object tree: every drawing on this symbol, the selected one marked; each can be hidden, locked or removed.
function drawObjectTree() {
  const list = $('drawingsList');
  if (!list || !drawings) return;
  const items = drawings.list();
  $('drawingsEmpty').hidden = items.length > 0;
  const ICON = { trend: 'trend', ray: 'ray', hline: 'hline', hray: 'hray', vline: 'vline', crossline: 'crossline', channel: 'channel', fib: 'fib', rect: 'rect', measure: 'measure', text: 'text', arrowup: 'arrowup' };
  list.innerHTML = [...items].reverse().map(d => `<li data-id="${d.id}" aria-selected="${d.id === drawings.selected}">
    <svg class="tv-obj-icon" aria-hidden="true" style="color:${esc(d.color)}"><use href="css/tv-icons.svg#${ICON[d.type]}"/></svg>
    <span class="tv-obj-name">${esc(d.name)}</span>
    <button type="button" class="tv-btn tv-icon" data-o="hide" aria-pressed="${d.hidden}" aria-label="${d.hidden ? 'Show' : 'Hide'}" title="${d.hidden ? 'Show' : 'Hide'}">${icon('eye')}</button>
    <button type="button" class="tv-btn tv-icon" data-o="lock" aria-pressed="${d.locked}" aria-label="${d.locked ? 'Unlock' : 'Lock'}" title="${d.locked ? 'Unlock' : 'Lock'}">${icon('lock')}</button>
    <button type="button" class="tv-btn tv-icon" data-o="remove" aria-label="Remove" title="Remove">${icon('trash')}</button></li>`).join('');
}
$('drawingsList')?.addEventListener('click', e => {
  const li = e.target.closest('li[data-id]'); if (!li) return;
  const action = e.target.closest('[data-o]')?.dataset.o, d = drawings.list().find(x => x.id === li.dataset.id);
  if (action === 'hide') drawings.update(d.id, { hidden: !d.hidden });
  else if (action === 'lock') drawings.update(d.id, { locked: !d.locked });
  else if (action === 'remove') drawings.remove(d.id);
  else drawings.select(d.id);
});

/* ------------------------------------------------------------- price scale */
// TradingView's modes: percent and logarithmic exclude each other; auto fits the visible values; invert flips.
let scale = { mode: 'normal', invert: false };
// The main series' scale: the right one, or the page's own (Economy's gold is on the left).
const mainScale = () => ctx.chart.priceScale(ctx.priceScaleId ?? 'right');
function applyScale() {
  if (!ctx) return;
  const L = window.LightweightCharts, mode = { log: L.PriceScaleMode.Logarithmic, percent: L.PriceScaleMode.Percentage }[scale.mode] ?? L.PriceScaleMode.Normal;
  mainScale().applyOptions({ mode, invertScale: scale.invert });
  showScale();
  drawings?.redraw();
}
function showScale() {
  if (!ctx) return;
  // The page may set a mode of its own (Economy's accumulated gold is logarithmic): the buttons read the chart's.
  const L = window.LightweightCharts, options = mainScale().options(), auto = options.autoScale;
  scale.mode = options.mode === L.PriceScaleMode.Logarithmic ? 'log' : options.mode === L.PriceScaleMode.Percentage ? 'percent' : 'normal';
  scale.invert = !!options.invertScale;
  document.querySelectorAll('.tv-scale [data-scale]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.scale === 'auto' ? auto : b.dataset.scale === scale.mode)));
}
document.querySelector('.tv-scale')?.addEventListener('click', e => {
  const b = e.target.closest('[data-scale]'); if (!b || !ctx) return;
  // Auto, as TradingView's: on fits the visible values; pressed again, the scale stays where it is.
  if (b.dataset.scale === 'auto') mainScale().applyOptions({ autoScale: !mainScale().options().autoScale });
  else scale.mode = scale.mode === b.dataset.scale ? 'normal' : b.dataset.scale;
  applyScale();
});
// Dragging or wheeling the price scale turns auto off, a double click on it back on: the button follows.
for (const type of ['pointerup', 'dblclick', 'wheel']) area?.addEventListener(type, () => requestAnimationFrame(showScale), { passive: true });

/* ------------------------------------------------------------------- clock */
// The server's clock: Tibia's server day runs on Central European time; the token's candles on UTC.
let clockTimer = null;
function startClock() {
  clearInterval(clockTimer);
  const el = $('tvClock'); if (!el) return;
  const zone = ctx?.page === 'token' ? 'UTC' : 'Europe/Berlin';
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'short' });
  const tick = () => {
    const parts = f.formatToParts(new Date()), get = t => parts.find(p => p.type === t)?.value;
    el.textContent = `${get('hour')}:${get('minute')}:${get('second')} (${zone === 'UTC' ? 'UTC' : get('timeZoneName').replace('GMT+1', 'CET').replace('GMT+2', 'CEST')})`;
  };
  el.title = zone === 'UTC' ? 'UTC: the token candles close at midnight' : 'Server time: a server day runs from 10:00 to 10:00 CET/CEST';
  tick(); clockTimer = setInterval(tick, 1000);
}

/* ----------------------------------------------------------------- hotkeys */
// TradingView's: Alt (Option) with a letter picks a drawing tool or a scale mode, Alt+R resets the chart; Mod+K and any
// letter open the search; Mod+Z and Shift+Mod+Z undo and redo; Delete removes the selected drawing; Escape cancels.
const TOOL_KEYS = { KeyT: 'trend', KeyH: 'hline', KeyJ: 'hray', KeyV: 'vline', KeyC: 'crossline', KeyF: 'fib' };
document.addEventListener('keydown', e => {
  if (!ctx || document.querySelector('dialog[open]') || drawings?.editing) return;
  const mod = mac ? e.metaKey : e.ctrlKey;
  if (mod && e.code === 'KeyK') { e.preventDefault(); showSearch(); return; }
  if (typing(document.activeElement)) return;
  if (mod && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? drawings?.redo() : drawings?.undo(); return; }
  if (mod && e.code === 'KeyY') { e.preventDefault(); drawings?.redo(); return; }
  if (e.altKey && !mod) {
    if (e.code === 'KeyR' && e.shiftKey) { e.preventDefault(); drawings?.setTool('rect'); return; }
    if (e.code === 'KeyR') { e.preventDefault(); scale = { mode: 'normal', invert: false }; applyScale(); ctx.reset?.(); return; }
    if (e.code === 'KeyL') { e.preventDefault(); scale.mode = scale.mode === 'log' ? 'normal' : 'log'; applyScale(); return; }
    if (e.code === 'KeyP') { e.preventDefault(); scale.mode = scale.mode === 'percent' ? 'normal' : 'percent'; applyScale(); return; }
    if (e.code === 'KeyI') { e.preventDefault(); scale.invert = !scale.invert; applyScale(); return; }
    if (TOOL_KEYS[e.code]) { e.preventDefault(); drawings?.setTool(TOOL_KEYS[e.code]); return; }
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && drawings?.selected) { e.preventDefault(); drawings.remove(); return; }
  if (e.key === 'Escape') {
    if (openPopup) { closePopup(); return; }
    if (replay.picking) { exitReplay(); return; }
    drawings?.cancel();
    return;
  }
  if (replay.day && e.shiftKey && e.key === 'ArrowRight') { e.preventDefault(); stopPlaying(); replayStep(); return; }
  // A letter typed over the chart starts a world search with it, as TradingView starts a symbol search.
  if (!mod && !e.altKey && /^[a-z]$/i.test(e.key) && ctx.worlds && !document.activeElement?.closest?.('.dock-panel,.screener')) { e.preventDefault(); showSearch(e.key); }
});

/* --------------------------------------------------------------- the chart */
function viewChanged() {
  if (!ctx) return;
  const name = $('tvSymbolName'); if (name) name.textContent = ctx.symbol?.() ?? '';
  if (replay.day || replay.picking) exitReplay();
  drawings?.refresh();
  indicators.refresh();
  showScale();
  drawingsChanged('load');
}
whenConnected(context => {
  ctx = context;
  if (!ctx.worlds) { const b = $('tvSymbol'); if (b) { b.disabled = true; b.title = ctx.symbol?.() ?? ''; } }
  if (!ctx.screener) $('tvCompare')?.setAttribute('hidden', '');
  else $('tvCompare')?.addEventListener('click', () => ctx.screener());
  if (!ctx.replay) $('tvReplay')?.setAttribute('hidden', '');
  drawings?.attach(ctx);
  indicators.attach(ctx);
  setStyle(read(styleKey(), 'markers'), { save: false });
  startClock();
  viewChanged();
  bridge.addEventListener('view', viewChanged);
  ctx.chart.timeScale().subscribeVisibleLogicalRangeChange(() => showFloat());
});
addEventListener('tv:theme', () => { ctx?.retheme?.(); drawings?.redraw(); });

// Page lifetime: release timers and temporary outside-click listeners; resume the clock on a cached restore.
addEventListener('pagehide', () => { closePopup(false); stopPlaying(); clearInterval(clockTimer); });
addEventListener('pageshow', e => { if (e.persisted && ctx) startClock(); });
