// Canvas and DOM consumers read the same CSS tokens; no duplicated palette or pixel defaults.
/** @param {string} name @returns {string} */
export const cssToken = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/** @param {string} name @returns {number} */
export function cssPixels(name) {
  const value = cssToken(name);
  if (!/^\d+(?:\.\d+)?px$/.test(value)) throw new Error(`Expected a pixel design token: ${name}`);
  return Number.parseFloat(value);
}
