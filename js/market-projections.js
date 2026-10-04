/*
 * Market projections: the Research report's offer scenarios (reports/tc-cycle/analyze.py), as carried over by
 * tools/build_market_projections.mjs into data/market-projections/<asset>.json. Pure functions; no DOM, no chart.
 * Markets computes nothing here: it decides only whether a scenario can be placed on a world's chart, and how to say it.
 *
 * A scenario is, for one world and side, a weekly path of [week, central, low, high, condition]:
 *   central    the equal-weight ensemble (Constant, Seasonal 52 weeks, Harmonic) for the benchmark, applied to the
 *              world's own anchor quote by the benchmark's proportional change
 *   low, high  the heuristic stress band (observed error, model divergence and the world's premium instability);
 *              not a confidence interval
 *   condition  scenario, stale (conditional: the anchor is older than the cutoff), crossed (conditional: the central
 *              Buy Offer meets or passes the central Sell Offer), suspended (an announced merge: no value)
 *
 * The boundary: a scenario is placed only when its anchor is the world's last observed best offer on the chart (the
 * same server day and price, side by side). The path then starts on that very point, so the last observation is its
 * first value and nothing joins them but the projection itself. A newer observation than the Research's anchor makes
 * the scenario unavailable until the Research is rebuilt; it is never moved to a different anchor.
 */
import { addDays } from './market-history.js';

export const PROJECTIONS = asset => `data/market-projections/${asset}.json`;

export const CONDITIONS = {
  scenario: 'Offer scenario',
  stale: 'Conditional: stale quote',
  crossed: 'Conditional: crossed sides',
  suspended: 'Suspended: announced merge'
};

const DAY = 86400000;
const dayNumber = day => Date.parse(`${day}T00:00:00Z`) / DAY;

/*
 * What can be drawn for one world, by side: { sell, buy }, each either
 *   { available: true, anchor: {day, value}, points: [{day, central, low, high, condition}], end, suspendedFrom,
 *     horizonWeeks, confidence, limits: [text] }
 * or { available: false, reason }.
 * summary: the world's index entry; last: its last observed close ({serverDay, sell, buy}) or undefined.
 */
export function projectionFor(dataset, summary, last) {
  const none = reason => ({ sell: { available: false, reason }, buy: { available: false, reason } });
  if (!dataset) return none('Projections could not be loaded.');
  if (summary.status === 'retired') return none('A retired world has no projection.');
  const entry = dataset.worlds.find(w => w.world === summary.world);
  if (!entry) return none(`The Research projects the worlds it captures; ${summary.world} is not among them.`);
  if (!last) return none(`No market data for ${summary.world} yet.`);
  const out = {};
  for (const side of ['sell', 'buy']) {
    const anchor = { day: entry.anchor.serverDay, value: entry.anchor[side] };
    if (anchor.day !== last.serverDay || anchor.value !== last[side]) {
      out[side] = { available: false, reason: `The Research projection starts from the best offer of ${entry.anchor.serverDay ?? entry.anchor.researchDate}; `
        + `${summary.world} was observed later, on ${last.serverDay}, so it waits for the Research to be rebuilt.` };
      continue;
    }
    const rows = entry[side].map(([day, central, low, high, condition]) => ({ day, central, low, high, condition }));
    const points = rows.filter(r => r.condition !== 'suspended');
    const suspendedFrom = rows.find(r => r.condition === 'suspended')?.day ?? null;
    if (!points.length) { out[side] = { available: false, reason: `Suspended from ${suspendedFrom}: ${summary.world} is to be merged.` }; continue; }
    out[side] = {
      available: true, anchor, points, end: points.at(-1).day, suspendedFrom,
      horizonWeeks: dataset.method.horizonWeeks, confidence: entry.confidence, limits: limits(entry)
    };
  }
  return out;
}

// Why the Research rates a scenario's confidence as limited (analyze.py: a merger, a stale quote or fewer than ten
// transfer tests).
export function limits(entry) {
  return [entry.mergerDate && `announced merge, not before ${entry.mergerDate}`, entry.stale && 'stale quote',
    entry.testN < 10 && `${entry.testN} transfer ${entry.testN === 1 ? 'test' : 'tests'}, fewer than ten`].filter(Boolean);
}

// The projected week that holds a day: the first point on or after it, within one step. Weeks are labelled by their
// last day, as the Research labels them; days between two weeks take the week they end in, never an interpolation.
export function weekOf(projection, day) {
  if (!projection?.available || day <= projection.anchor.day) return null;
  const point = projection.points.find(p => p.day >= day);
  return point && dayNumber(point.day) - dayNumber(day) < 7 ? point : null;
}

// How many days after the anchor the chart shows: as many as the range shows before it, up to the scenario's end,
// so history and projection keep their proportion at any range. `history` is the range's length in days.
export function forwardDays(projection, history) {
  if (!projection?.available) return 0;
  return Math.min(Math.max(7, history), dayNumber(projection.end) - dayNumber(projection.anchor.day));
}
export const forwardEnd = (projection, history) => projection?.available ? addDays(projection.anchor.day, forwardDays(projection, history)) : null;

// Every day from the anchor to the scenario's end, so the chart's axis keeps time proportional beyond the history.
export function axisDays(projection) {
  if (!projection?.available) return [];
  const days = [];
  for (let day = addDays(projection.anchor.day, 1); day <= projection.end; day = addDays(day, 1)) days.push(day);
  return days;
}

const qualifier = p => [p.condition !== 'scenario' && CONDITIONS[p.condition]].filter(Boolean);
// The readout's words for one week, or for the scenario's end at rest.
export function pointText(point, fmt) {
  return { value: fmt(point.central), band: `${fmt(point.low)} to ${fmt(point.high)}`, notes: qualifier(point) };
}

/*
 * What an exported image says under the chart: what the dashed line and the band are, from which observation, and
 * their values on the last week the image shows (`through`, the image's last day), with the scenario's full extent.
 */
export function exportLines(projection, { fmt, world, side, through }) {
  if (!projection) return null;
  if (!projection.available) return { lines: [{ mark: 'none', text: `Projection unavailable for ${world}: ${projection.reason}` }] };
  const shown = projection.points.filter(p => !through || p.day <= through), last = shown.at(-1) ?? projection.points[0];
  const full = projection.points.at(-1);
  const conditions = [...new Set(shown.map(p => p.condition).filter(c => c !== 'scenario'))].map(c => CONDITIONS[c]);
  const extent = last.day === full.day ? `${projection.points.length} weeks to ${full.day}` : `shown to ${last.day} of ${projection.points.length} weeks to ${full.day}`;
  return { lines: [
    { mark: 'dashed', text: `Projection, Research offer scenario (C+S+H ensemble), weekly, ${extent}: starts at the ${side} of `
      + `${projection.anchor.day}, ${fmt(projection.anchor.value)}; central ${fmt(last.central)} on ${last.day}.` },
    { mark: 'band', text: `Heuristic stress band, not a confidence interval: ${fmt(last.low)} to ${fmt(last.high)} on ${last.day}.`
      + `${projection.confidence === 'limited' ? ` Limited confidence: ${projection.limits.join('; ')}.` : ''}`
      + `${conditions.length ? ` ${conditions.join('; ')}.` : ''}${projection.suspendedFrom ? ` Suspended from ${projection.suspendedFrom}.` : ''}` }
  ] };
}
