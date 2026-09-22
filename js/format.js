/*
 * Shared number/text presentation. Pure presentation logic - no state, no
 * settings. Digit grouping uses the browser's own locale (Intl with no
 * explicit locale argument). Every value in this app is a Tibia Coin market
 * figure - the unit is implicit in the app's single purpose, so nothing here
 * prints "gp", "TC" or "gp/TC": a plain, fully-grouped number is the value.
 */
const nf = new Intl.NumberFormat();
export const fmt = n => nf.format(n);

export const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* Spread is derived, never stored: exactly sell - buy. */
export const spread = r => r.sell - r.buy;

export const goldOf = rows => rows.reduce((t, r) => t + r.amount * r.price, 0);

/*
 * A quantity that may not exist yet (an optional field on an older row, a
 * legacy point with no volume data). Tabular figures line a column up;
 * nothing here changes how a real number - including zero or a negative one -
 * actually reads, since a value that exists should look like an ordinary
 * number, not an accounting convention. A dash stands only for absence.
 */
export const num = n =>
  Number.isFinite(n) ? fmt(n) : '<span class="dash" aria-label="not available">—</span>';
