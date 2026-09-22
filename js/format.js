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
 * Accounting presentation: negatives in parentheses, zero/missing as a dash,
 * tabular figures so a column of these lines up. No unit is ever attached -
 * callers label the column or metric once, not every value in it.
 */
export const acct = n => {
  if (!Number.isFinite(n) || n === 0) return '<span class="dash">—</span>';
  return n < 0 ? `(${fmt(Math.abs(n))})` : fmt(n);
};
