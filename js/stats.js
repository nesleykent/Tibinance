/*
 * Robust statistics for spotting opportunities in the observations.
 *
 * Mean and standard deviation are the wrong tools here. A handful of worlds,
 * one of which is the very outlier being looked for, drags the mean towards
 * itself and inflates the deviation - so the outlier partly hides itself and
 * ordinary worlds look stranger than they are. The median and the median
 * absolute deviation do not move when a few values are extreme, which is
 * exactly the property wanted when the extremes are the point.
 */

export const median = xs => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Median absolute deviation, scaled so it estimates σ for normal data. */
export const mad = (xs, med = median(xs)) =>
  1.4826 * median(xs.map(x => Math.abs(x - med)));

/**
 * Modified z-score (Iglewicz & Hoaglin). |z| > 3.5 is the conventional line
 * for "outlier"; 2 is worth a glance.
 *
 * When every value is identical MAD is 0 and the score is undefined rather
 * than infinite - identical values contain no outlier, whatever the formula
 * would like to say about dividing by zero.
 */
export function zScores(xs) {
  const med = median(xs);
  const d = mad(xs, med);
  if (!Number.isFinite(d) || d === 0) return xs.map(() => 0);
  return xs.map(x => (x - med) / d);
}

export const OUTLIER = 3.5;
export const NOTABLE = 2.0;

/** Quartiles by the same linear interpolation Excel and numpy use. */
export function quantile(xs, q) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function describe(xs) {
  const v = xs.filter(Number.isFinite);
  if (!v.length) return null;
  const med = median(v);
  return {
    n: v.length,
    min: Math.min(...v),
    q1: quantile(v, 0.25),
    median: med,
    q3: quantile(v, 0.75),
    max: Math.max(...v),
    mad: mad(v, med)
  };
}
