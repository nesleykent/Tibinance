/*
 * The Markets dock (css/markets.css): at the terminal's right edge, a narrow rail of panel buttons, and beside the
 * chart the one panel the rail has open. A button opens its panel, or closes it when it is already open, which
 * leaves only the rail and gives the panel's width back to the chart. A tool to come is one more button
 * (data-dock-target, the panel's id) and one more panel (.dock-panel) in the markup; nothing here changes.
 *
 * The open panel, or none, is remembered in this browser. Until something is remembered, the default panel
 * (data-dock-default) opens where the chart keeps enough width beside it (`roomy`), and the rail starts closed
 * elsewhere. Narrow screens stack the default panel under the chart and hide the rail (css/markets.css).
 */
export function dock(root, { key, roomy, onChange }) {
  const buttons = [...root.querySelectorAll('[data-dock-target]')];
  const ids = buttons.map(b => b.dataset.dockTarget);
  const fallback = root.querySelector('.dock-panel[data-dock-default]')?.id ?? null;
  let open = null;

  function show(id, { remember = true } = {}) {
    open = ids.includes(id) ? id : null;
    root.dataset.open = open ?? '';
    for (const button of buttons) {
      const on = button.dataset.dockTarget === open, name = button.getAttribute('aria-label');
      button.setAttribute('aria-expanded', String(on));
      button.title = on ? `Hide ${name}` : name;
      document.getElementById(button.dataset.dockTarget).classList.toggle('is-open', on);
    }
    if (remember) try { localStorage.setItem(key, open ?? ''); } catch { /* storage unavailable: the choice lasts this visit */ }
  }

  for (const button of buttons) button.setAttribute('aria-controls', button.dataset.dockTarget);
  let saved = null;
  try { saved = localStorage.getItem(key); } catch { /* storage unavailable */ }
  // '' remembers a closed rail; a panel that no longer exists counts as nothing remembered.
  show(saved === '' || ids.includes(saved) ? saved : roomy() ? fallback : null, { remember: false });

  root.addEventListener('click', e => {
    const button = e.target.closest('[data-dock-target]');
    if (!button) return;
    const id = button.dataset.dockTarget === open ? null : button.dataset.dockTarget;
    // Told first, while the chart still has its old width.
    onChange?.(id);
    show(id);
  });
  return { get open() { return open; }, show };
}
