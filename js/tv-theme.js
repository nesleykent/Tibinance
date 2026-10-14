/*
 * The terminal's theme, set before first paint (a classic script in <head>): html[data-theme] is "light" or "dark",
 * as TradingView sets it. The viewer's choice is kept in this browser; until there is one, the system's preference
 * decides. Changing it fires "tv:theme" on window, so charts re-read the tokens (css/tv.css).
 */
(() => {
  const KEY = 'tibinance.theme';
  const root = document.documentElement;
  let saved = null;
  try { saved = localStorage.getItem(KEY); } catch { /* storage unavailable: the system decides */ }
  const system = () => matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const apply = theme => {
    root.dataset.theme = theme;
    document.querySelectorAll('#tvTheme').forEach(b => {
      b.setAttribute('aria-pressed', String(theme === 'dark'));
      b.setAttribute('aria-label', theme === 'dark' ? 'Light theme' : 'Dark theme');
      b.title = theme === 'dark' ? 'Light theme' : 'Dark theme';
    });
  };
  apply(saved === 'dark' || saved === 'light' ? saved : system());
  const set = theme => {
    apply(theme);
    try { localStorage.setItem(KEY, theme); } catch { /* this visit only */ }
    dispatchEvent(new CustomEvent('tv:theme', { detail: theme }));
  };
  window.tvTheme = { get: () => root.dataset.theme, set, toggle: () => set(root.dataset.theme === 'dark' ? 'light' : 'dark') };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    let chosen = null;
    try { chosen = localStorage.getItem(KEY); } catch { /* none */ }
    if (!chosen) { apply(system()); dispatchEvent(new CustomEvent('tv:theme', { detail: root.dataset.theme })); }
  });
  document.addEventListener('DOMContentLoaded', () => {
    apply(root.dataset.theme);
    document.getElementById('tvTheme')?.addEventListener('click', () => window.tvTheme.toggle());
  });
})();
