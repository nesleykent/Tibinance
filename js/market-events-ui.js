/*
 * Inspecting the chart's event markers (js/market-events-layer.js) by pointer, touch and keyboard. The layer draws the
 * markers into the chart; this lays a transparent button over each one, in a strip at the foot of the price pane, so
 * a marker can be hovered, tapped or focused. The strip is one tab stop (a toolbar): the arrow keys, Home and End move
 * between markers, Escape closes the details.
 *
 * Hovering, focusing or tapping a marker shows its events' days, titles and descriptions beside it and marks it
 * active on the chart, where its days span the pane.
 */
import { dateText, groupLabel } from './market-events.js';
import { esc } from './format.js';

const HEIGHT = 14, FOOT = 4;   // the marker's size and its gap above the pane's foot, as the layer draws them

export function eventMarks({ chart, part, strip, tip }) {
  const buttons = new Map();
  let groups = [], shown = null, pinned = false, chosen = null;   // chosen: the marker last focused

  // The strip lies over the markers, at the foot of the price pane; it spans the chart area (css/markets.css).
  function place() {
    strip.style.top = `${chart.paneSize(0).height - FOOT - HEIGHT}px`;
  }

  function render(next) {
    groups = next;
    place();
    const keys = new Set(groups.map(g => g.key));
    for (const [key, button] of buttons) if (!keys.has(key)) { button.remove(); buttons.delete(key); }
    groups.forEach((g, i) => {
      let button = buttons.get(g.key);
      if (!button) {
        button = Object.assign(document.createElement('button'), { type: 'button', className: 'event-mark' });
        button.dataset.key = g.key;
        buttons.set(g.key, button);
      }
      button.style.left = `${g.x - g.width / 2}px`;
      button.style.width = `${g.width}px`;
      button.setAttribute('aria-label', groupLabel(g.events));
      button.dataset.events = g.events.map(e => e.id).join(' ');
      // In marker order, so the arrows follow the time axis; moved only when out of place, so focus stays.
      if (strip.children[i] !== button) strip.insertBefore(button, strip.children[i] ?? null);
    });
    setCurrent(keys.has(chosen) ? chosen : groups[0]?.key ?? null);
    if (shown && !keys.has(shown)) hide();
    else if (shown) position(buttons.get(shown));
  }

  // The one marker in the tab order: the last one focused while it is in view, else the first.
  function setCurrent(key) {
    for (const [k, button] of buttons) button.tabIndex = k === key ? 0 : -1;
  }

  function show(key, { pin = false } = {}) {
    const g = groups.find(x => x.key === key), button = buttons.get(key);
    if (!g || !button) return;
    shown = key;
    pinned = pin;
    tip.innerHTML = g.events.map(e => `<div class="event-tip-item"><span class="event-tip-days">${esc(dateText(e))}</span>`
      + `<b class="event-tip-title"><i class="event-tip-mark" data-group="${esc(e.category.group)}">${esc(e.category.mark)}</i>${esc(e.title)}</b>`
      + `<span class="event-tip-text">${esc(e.description)}</span></div>`).join('');
    tip.hidden = false;
    position(button);
    part.setActive(key);
  }
  function hide() {
    shown = null;
    pinned = false;
    tip.hidden = true;
    part.setActive(null);
  }
  // Fixed to the viewport, above the marker, kept on screen.
  function position(button) {
    const anchor = button.getBoundingClientRect(), box = tip.getBoundingClientRect();
    if (anchor.bottom < 0 || anchor.top > innerHeight) { hide(); return; }
    tip.style.left = `${Math.min(Math.max(8, anchor.left + anchor.width / 2 - box.width / 2), innerWidth - box.width - 8)}px`;
    const above = anchor.top - box.height - 8;
    tip.style.top = `${Math.max(8, Math.min(above >= 8 ? above : anchor.bottom + 8, innerHeight - box.height - 8))}px`;
  }

  const keyOf = e => e.target.closest('.event-mark')?.dataset.key;
  strip.addEventListener('pointerover', e => { const key = keyOf(e); if (key && !pinned) show(key); });
  strip.addEventListener('pointerout', e => {
    const key = keyOf(e);
    if (key && key === shown && !pinned && document.activeElement !== buttons.get(key)) hide();
  });
  strip.addEventListener('focusin', e => { const key = keyOf(e); if (key) { chosen = key; setCurrent(key); show(key); } });
  strip.addEventListener('focusout', e => { if (!strip.contains(e.relatedTarget)) hide(); });
  // A tap or click keeps the details open until the next one or Escape.
  strip.addEventListener('click', e => {
    const key = keyOf(e);
    if (!key) return;
    shown === key && pinned ? hide() : show(key, { pin: true });
  });
  strip.addEventListener('keydown', e => {
    const at = groups.findIndex(g => g.key === keyOf(e));
    if (at === -1) return;
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: groups.length - 1 }[e.key];
    if (e.key === 'Escape') { if (shown) { e.stopPropagation(); hide(); } return; }
    if (to === undefined || !groups[to]) return;
    e.preventDefault();
    buttons.get(groups[to].key).focus();
  });
  document.addEventListener('pointerdown', e => { if (pinned && !strip.contains(e.target)) hide(); });
  new ResizeObserver(place).observe(strip.parentElement);
  addEventListener('scroll', () => shown && position(buttons.get(shown)), { passive: true });
  part.onLayout(render);
  return { hide, focusEvent(id) { const group = groups.find(g => g.events.some(e => e.id === id)); if (group) { chosen = group.key; setCurrent(chosen); show(chosen, { pin: true }); } } };
}
