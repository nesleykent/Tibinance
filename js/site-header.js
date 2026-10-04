/*
 * The site header shared by Capture, Markets, Trade and Research (css/site-header.css).
 *
 * The left of the header is a trail, Tibinance / Section: Tibinance links home and the section's name opens the
 * menu of sections (on Capture, the home page, Tibinance is the only crumb and opens it). The right of the header
 * is the section's own. The menu, and any control a section puts on the right, is one interaction: a button opens
 * a panel anchored under it, aligned with the button's start or end edge and kept inside the viewport. Escape, a
 * click outside or focus moving out of the panel closes it. The panel is a popover; browsers without the Popover
 * API toggle the same panel in place.
 *
 * A link menu is markup in the page: a button marked data-site-menu (its value "end" aligns the panel with the
 * button's end edge) whose popovertarget is a list of links, the current one marked aria-current. This module
 * wires every one on load. searchPicker() builds the other kind, a searchable list of choices, for a page script.
 */

const GAP = 6, EDGE = 8;
const POPOVER = 'popover' in HTMLElement.prototype;
const CHEVRON = '<svg class="site-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3"/></svg>';

// Under the button, at its start or end edge. Only the panel's edges are set, so it never has to be measured first.
function place(button, panel, align) {
  const r = button.getBoundingClientRect(), width = document.documentElement.clientWidth, top = r.bottom + GAP;
  panel.style.top = `${top}px`;
  panel.style.maxHeight = `${Math.max(0, innerHeight - top - EDGE)}px`;
  if (align === 'end') {
    const right = Math.max(EDGE, width - r.right);
    Object.assign(panel.style, {left: 'auto', right: `${right}px`, maxWidth: `${width - right - EDGE}px`});
  } else {
    const left = Math.max(EDGE, r.left);
    Object.assign(panel.style, {right: 'auto', left: `${left}px`, maxWidth: `${width - left - EDGE}px`});
  }
}

// Ties a panel to its button. onOpen prepares the panel before it shows, onShown follows once it is on screen.
// Returns close(focusButton).
function anchor(button, panel, {align = 'start', onOpen, onShown} = {}) {
  const follow = () => place(button, panel, align);
  const isOpen = () => button.getAttribute('aria-expanded') === 'true';
  // While open, the panel follows its button through scrolling and resizing.
  const expand = open => {
    button.setAttribute('aria-expanded', String(open));
    if (open) { onOpen?.(); follow(); addEventListener('resize', follow); addEventListener('scroll', follow, true); }
    else { removeEventListener('resize', follow); removeEventListener('scroll', follow, true); }
  };
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-controls', panel.id);
  let close;
  if (POPOVER) {
    button.setAttribute('popovertarget', panel.id);
    panel.setAttribute('popover', '');
    panel.addEventListener('beforetoggle', e => expand(e.newState === 'open'));
    panel.addEventListener('toggle', e => { if (e.newState === 'open') onShown?.(); });
    close = focusButton => { if (panel.matches(':popover-open')) panel.hidePopover(); if (focusButton) button.focus(); };
  } else {
    button.removeAttribute('popovertarget');
    panel.removeAttribute('popover');
    panel.hidden = true;
    close = focusButton => { if (!panel.hidden) { panel.hidden = true; expand(false); } if (focusButton) button.focus(); };
    button.addEventListener('click', () => { if (panel.hidden) { panel.hidden = false; expand(true); onShown?.(); } else close(false); });
    document.addEventListener('pointerdown', e => { if (isOpen() && !panel.contains(e.target) && !button.contains(e.target)) close(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) close(false); });
  }
  // Escape from inside the panel returns to its button, in every engine.
  panel.addEventListener('keydown', e => { if (e.key === 'Escape' && isOpen()) { e.preventDefault(); e.stopPropagation(); close(true); } });
  // Tabbing past either end of the panel leaves it, and closes it.
  panel.addEventListener('focusout', e => {
    if (e.relatedTarget && !panel.contains(e.relatedTarget) && e.relatedTarget !== button) close(false);
  });
  return close;
}

// A list of links: Tab or the arrow keys move through them; the arrows on the closed button open it at the current link.
export function linkMenu(button, panel, align = 'start') {
  const links = () => [...panel.querySelectorAll('a[href]')];
  anchor(button, panel, {align});
  panel.addEventListener('keydown', e => {
    const list = links(), at = list.indexOf(document.activeElement);
    const next = {ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: list.length - 1}[e.key];
    if (next === undefined || at < 0) return;
    e.preventDefault();
    list[(next + list.length) % list.length].focus();
  });
  button.addEventListener('keydown', e => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    if (button.getAttribute('aria-expanded') !== 'true') button.click();
    (panel.querySelector('[aria-current]') || links()[0])?.focus();
  });
}

const fold = s => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));

/*
 * A searchable picker, appended to `host`: a quiet button that shows the choice and opens a search field over the
 * list of `options` ([{value, label}]). The field is a combobox: typing filters the list, the arrow keys move
 * through it, Enter or a click picks. `name` names the list, and the button with its choice ("World: Antica"), in
 * place of a visible label. Returns {set(value)} to show a choice made elsewhere.
 */
export function searchPicker(host, {id, name, options, value, onPick, align = 'end', search = 'Search', empty = 'No match.'}) {
  host.insertAdjacentHTML('beforeend', `
    <button type="button" class="site-control"><span class="site-control-value"></span>${CHEVRON}</button>
    <div id="${id}" class="site-panel site-picker">
      <input type="search" class="site-search" autofocus role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls="${id}-list"
             aria-label="${esc(search)}" placeholder="${esc(search)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go">
      <ul id="${id}-list" class="site-options" role="listbox" aria-label="${esc(name)}">${options.map((o, i) =>
        `<li id="${id}-${i}" role="option" data-value="${esc(o.value)}">${esc(o.label)}</li>`).join('')}</ul>
      <p class="site-empty" role="status"></p>
    </div>`);
  const panel = host.lastElementChild, button = panel.previousElementSibling, list = panel.querySelector('ul');
  const input = panel.querySelector('input'), items = [...list.children], status = panel.querySelector('.site-empty');
  const keys = options.map(o => fold(o.label));
  let current = value, active = null;

  const shown = () => items.filter(li => !li.hidden);
  const reveal = () => active?.scrollIntoView({block: 'nearest'});
  function activate(li) {
    active?.classList.remove('active');
    active = li || null;
    if (active) { active.classList.add('active'); input.setAttribute('aria-activedescendant', active.id); reveal(); }
    else input.removeAttribute('aria-activedescendant');
  }
  function filter() {
    const q = fold(input.value.trim());
    items.forEach((li, i) => { li.hidden = !keys[i].includes(q); });
    const matches = shown();
    status.textContent = matches.length ? '' : empty;
    activate(matches.find(li => li.dataset.value === current) || matches[0]);
  }
  function set(next) {
    current = next;
    const chosen = options.find(o => o.value === next) || options[0];
    button.querySelector('.site-control-value').textContent = chosen.label;
    button.setAttribute('aria-label', `${name}: ${chosen.label}`);
    items.forEach(li => li.setAttribute('aria-selected', String(li.dataset.value === current)));
  }
  // Each opening starts from the whole list, at the current choice. The field takes focus as the panel shows
  // (autofocus, in a popover; focus() where the panel is toggled in place).
  const close = anchor(button, panel, {align, onOpen() { input.value = ''; filter(); input.focus(); }, onShown: reveal});
  function pick(li) {
    close(true);
    if (li.dataset.value !== current) { set(li.dataset.value); onPick(current); }
  }
  input.addEventListener('input', filter);
  input.addEventListener('keydown', e => {
    const matches = shown(), at = matches.indexOf(active);
    const step = {ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10}[e.key];
    if (step) { e.preventDefault(); if (matches.length) activate(matches[Math.min(matches.length - 1, Math.max(0, at + step))]); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active) pick(active); }
  });
  // The field keeps focus while the list is clicked, so the list never closes under the pointer.
  list.addEventListener('mousedown', e => e.preventDefault());
  list.addEventListener('click', e => { const li = e.target.closest('[role="option"]'); if (li) pick(li); });
  list.addEventListener('pointermove', e => { const li = e.target.closest('[role="option"]'); if (li && li !== active) activate(li); });
  set(value);
  return {set};
}

document.querySelectorAll('[data-site-menu]').forEach(button => {
  const panel = document.getElementById(button.getAttribute('popovertarget') || button.getAttribute('aria-controls'));
  if (panel) linkMenu(button, panel, button.dataset.siteMenu || 'start');
});
