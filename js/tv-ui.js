import { cssPixels } from './theme.js';

/* Shared TradingView interaction primitives. Geometry lives in css/tv.css and css/tv-components.css.
 * Native dialogs keep modal semantics; keyboard focus is contained and returned to the opener. */
/** @type {WeakMap<HTMLDialogElement, HTMLElement|null>} */
const dialogs = new WeakMap();
let listId = 0;
/** @param {HTMLElement} el */
const visible = el => !el.hidden && !el.matches(':disabled,[aria-disabled="true"]') && el.getClientRects().length > 0;
/** @param {ParentNode} root */
const focusable = root => [.../** @type {NodeListOf<HTMLElement>} */(root.querySelectorAll('button,a[href],input,select,textarea,[tabindex]'))].filter(el => el.tabIndex >= 0 && visible(el));

/** @param {HTMLDialogElement} dialog @param {{opener?: HTMLElement|null, focus?: HTMLElement|null}} [options] */
export function openDialog(dialog, { opener = document.activeElement instanceof HTMLElement ? document.activeElement : null, focus = /** @type {HTMLElement|null} */(dialog.querySelector('input,[autofocus]')) } = {}) {
  if (!dialogs.has(dialog)) {
    dialogs.set(dialog, null);
    dialog.setAttribute('aria-modal', 'true');
    dialog.addEventListener('click', e => {
      const r = dialog.getBoundingClientRect();
      const backdrop = e.target === dialog && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom);
      if (backdrop || (e.target instanceof Element && e.target.closest('[data-close]'))) dialog.close();
    });
    dialog.addEventListener('keydown', e => {
      // Search inputs consume native Escape to clear text; the dialog consistently owns dismissal.
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); dialog.close(); restore(); return; }
      if (e.key !== 'Tab') return;
      const items = focusable(dialog), first = items[0], last = items.at(-1);
      if (!first) { e.preventDefault(); dialog.focus(); }
      else if (e.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) { e.preventDefault(); last?.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    });
    const restore = () => {
      if (dialog.open) return;
      dialog.querySelector('[role="combobox"]')?.setAttribute('aria-expanded', 'false');
      const target = dialogs.get(dialog);
      dialogs.set(dialog, null); // The queued close event must not restore focus a second time.
      if (target?.isConnected && !target.matches(':disabled')) target.focus({ preventScroll: true });
    };
    dialog.addEventListener('close', restore);
    dialog.addEventListener('cancel', e => { e.preventDefault(); dialog.close(); restore(); });
  }
  if (!dialog.open) { dialogs.set(dialog, opener); dialog.showModal(); }
  dialog.querySelector('[role="combobox"]')?.setAttribute('aria-expanded', 'true');
  (focus ?? focusable(dialog)[0] ?? dialog).focus({ preventScroll: true });
}

// The field owns list navigation; only actual options participate, so empty/status rows cannot be selected.
/** @param {HTMLInputElement} input @param {HTMLElement} list */
export function updateListbox(input, list) {
  list.id ||= `tv-options-${++listId}`;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-controls', list.id);
  input.setAttribute('aria-expanded', String(!!list.closest('dialog[open]')));
  const options = [...list.querySelectorAll('[role="option"]')];
  options.forEach((option, i) => { option.id = `${list.id}-${i}`; option.setAttribute('aria-selected', String(option.classList.contains('active'))); });
  const active = options.find(option => option.classList.contains('active'));
  if (active) input.setAttribute('aria-activedescendant', active.id);
  else input.removeAttribute('aria-activedescendant');
}

/** @param {HTMLElement} menu @param {(focusButton: boolean) => void} close */
export function menuKeyboard(menu, close) {
  const items = () => [.../** @type {NodeListOf<HTMLElement>} */(menu.querySelectorAll('button[role^="menuitem"],button[role="radio"]'))].filter(visible);
  menu.addEventListener('keydown', e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(true); return; }
    if (e.target instanceof Element && e.target.matches('input,textarea,select')) return;
    const all = items(), at = document.activeElement instanceof HTMLElement ? all.indexOf(document.activeElement) : -1;
    const next = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[e.key];
    if (next === undefined || !all.length) return;
    e.preventDefault(); e.stopPropagation(); all[(next + all.length) % all.length].focus();
  });
  menu.addEventListener('focusout', e => { if (e.relatedTarget instanceof Node && !menu.contains(e.relatedTarget)) close(false); });
  const initial = menu.querySelector('button[aria-checked="true"]:not(:disabled)') ?? items()[0] ?? menu.querySelector('input');
  if (initial instanceof HTMLElement) initial.focus({ preventScroll: true });
}


// Delegated tooltips cover static and dynamically created controls on every page.
export function initTooltips() {
  const tip = Object.assign(document.createElement('div'), { className: 'tv-tooltip', id: 'tv-control-tooltip', hidden: true });
  tip.setAttribute('role', 'tooltip'); document.body.append(tip);
  /** @type {HTMLElement|null} */
  let control = null;
  let title = '';
  const hide = () => {
    if (control) {
      if (!control.hasAttribute('title')) control.setAttribute('title', title);
      const ids = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(id => id && id !== tip.id);
      if (ids.length) control.setAttribute('aria-describedby', ids.join(' ')); else control.removeAttribute('aria-describedby');
    }
    control = null; tip.hidden = true;
  };
  /** @param {Element} target */
  const show = target => {
    const next = target.closest('button[title],a[title],input[title],summary[title]');
    if (!(next instanceof HTMLElement) || next === control || next.matches(':disabled') || !next.title.trim()) return;
    hide(); control = next; title = next.title; next.removeAttribute('title');
    tip.textContent = title; tip.hidden = false;
    next.setAttribute('aria-describedby', `${next.getAttribute('aria-describedby') ?? ''} ${tip.id}`.trim());
    const r = next.getBoundingClientRect(), size = tip.getBoundingClientRect(), edge = cssPixels('--tv-size-8'), gap = cssPixels('--tv-size-4');
    tip.style.left = `${Math.max(edge, Math.min(r.x + r.width / 2 - size.width / 2, innerWidth - size.width - edge))}px`;
    tip.style.top = `${Math.max(edge, r.bottom + size.height + gap > innerHeight ? r.top - size.height - gap : r.bottom + gap)}px`;
  };
  document.addEventListener('pointerover', e => { if (e.target instanceof Element) show(e.target); });
  document.addEventListener('focusin', e => { if (e.target instanceof Element) show(e.target); });
  document.addEventListener('pointerout', e => { if (control && !control.contains(e.relatedTarget instanceof Node ? e.relatedTarget : null)) hide(); });
  document.addEventListener('focusout', hide);
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('click', hide, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hide(); });
  addEventListener('scroll', hide, true); addEventListener('resize', hide); addEventListener('pagehide', hide);
}
