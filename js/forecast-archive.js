// The forecast archive as the site reads it: lifecycle, what was public on a given date, forecasts of one target
// from different editions, and accuracy. Pure functions, no DOM; the Markets panel and the tests share them.
//
// Inputs are data/forecast-archive/index.json (one entry per archived forecast, with its lifecycle and publication
// evidence), the outputs objects it names (objects/<sha256>.json.gz) and evaluations.jsonl.
//
// "Published" always means there is evidence: a push to main (repository) or a successful Pages deployment that
// served it (website). An archived forecast without evidence is never shown as a public prediction. As-of views use
// website evidence; repository evidence stands in only where no deployment is recorded, and says so.

export const SCENARIOS = 'tc-world-scenarios';
export const LEDGER = 'research-ledger';

const DAY = 86400000;

// The Monday to Sunday week holding a date, labelled by its Sunday (the Research's target definition).
export function weekEnding(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  const toSunday = (7 - d.getUTCDay()) % 7;
  return new Date(d.getTime() + toSunday * DAY).toISOString().slice(0, 10);
}

// When a forecast became public, with the evidence used: website first, repository as a labelled fallback.
export function publishedAt(forecast, { fallback = true } = {}) {
  const web = forecast.evidence?.website;
  if (web?.at) return { at: web.at, level: 'website', basis: web.basis, fallback: false };
  const repo = forecast.evidence?.repository;
  if (fallback && repo?.at) return { at: repo.at, level: 'repository', basis: repo.basis, fallback: true };
  return null;
}

export function classify(forecast) {
  if (forecast.provenance === 'backtest') return 'backtest';
  if (forecast.state !== 'published') return 'archived-unpublished';
  return forecast.evidenceLevel === 'website' ? 'published-website' : 'published-repository';
}

export function lifecycleLabel(forecast) {
  const base = {
    'published-website': 'Published on the website',
    'published-repository': 'Published in the repository; no website deployment recorded',
    'archived-unpublished': forecast.state === 'publication-failed' ? 'Archived; its publication failed' : 'Archived; never published',
    backtest: 'Backtest; never published',
  }[classify(forecast)];
  return forecast.superseded ? `${base}; superseded by a later edition for the same cutoff` : base;
}

// Every edition of a product that was public at instant t (ISO string), newest publication first. The first is
// what Tibinance showed at t. Editions published after t, and archived-only ones, are never included.
export function publishedBy(index, t, { product = SCENARIOS, fallback = true } = {}) {
  return index.forecasts
    .filter(f => f.product === product && f.provenance === 'authentic')
    .map(f => ({ forecast: f, publication: publishedAt(f, { fallback }) }))
    .filter(x => x.publication && x.publication.at <= t)
    .sort((a, b) => (a.publication.at < b.publication.at ? 1 : a.publication.at > b.publication.at ? -1 : 0));
}

export const editionAsOf = (index, t, options) => publishedBy(index, t, options)[0] ?? null;

// A date picked in the interface means the end of that day in UTC: everything public during it.
export const endOfDay = iso => `${iso}T23:59:59Z`;

// One world and side of a scenario edition: [{target, week, base, low, high, status}] in target order.
export function scenarioSeries(outputs, world, side) {
  return outputs.worldPaths
    .filter(x => x.world === world && x.side === side)
    .map(x => ({ target: x.date, week: weekEnding(x.date), base: x.base, low: x.low, high: x.high, status: x.status }))
    .sort((a, b) => (a.target < b.target ? -1 : 1));
}

// The forecasts different editions made for the same target week, oldest edition first, with each one's horizon:
// how the prediction moved as information arrived. editions: [{forecast, publication, outputs}].
export function sameTarget(editions, world, side, week) {
  const out = [];
  for (const e of editions) {
    const series = scenarioSeries(e.outputs, world, side);
    const j = series.findIndex(p => p.week === week);
    if (j < 0 || series[j].base == null) continue;
    out.push({ edition: e.forecast.edition, contentHash: e.forecast.contentHash, publishedAt: e.publication?.at ?? null,
      level: e.publication?.level ?? null, horizon: j + 1, ...series[j] });
  }
  return out.sort((a, b) => ((a.publishedAt ?? '') < (b.publishedAt ?? '') ? -1 : 1));
}

// The evaluations in force: evaluations.jsonl text, parsed; a superseded evaluation is dropped from the view but
// stays in the file. Returns flat points with their forecast's classification and model version.
export function evaluationPoints(jsonl, index) {
  const current = new Map();
  for (const line of jsonl.split('\n')) {
    if (!line) continue;
    const r = JSON.parse(line);
    const key = `${r.forecast} ${r.weekEnding}`;
    if (r.type === 'evaluation') current.set(key, r);
    else if (r.type === 'evaluation-superseded') current.delete(key);
  }
  const forecasts = new Map(index.forecasts.map(f => [f.contentHash, f]));
  const points = [];
  for (const r of current.values()) {
    const f = forecasts.get(r.forecast);
    if (!f) continue;
    for (const item of r.items) {
      points.push({ ...item, weekEnding: r.weekEnding, forecast: f.contentHash, edition: f.edition, product: f.product,
        modelVersion: f.model.version, class: classify(f), observationCutoff: r.observation.cutoff });
    }
  }
  return points;
}

// Accuracy of a set of points. Percentage errors skip a zero actual instead of dividing by it; bias is the mean
// signed percentage error (positive: forecasts above the outcome); coverage counts only points with an interval.
export function metrics(points) {
  const n = points.length;
  if (!n) return { n: 0, mae: null, rmse: null, mape: null, smape: null, bias: null, coverage: null, intervals: 0 };
  const abs = points.map(p => Math.abs(p.actual - p.predicted));
  const pct = points.filter(p => p.actual).map(p => (100 * Math.abs(p.actual - p.predicted)) / Math.abs(p.actual));
  const smape = points.filter(p => Math.abs(p.actual) + Math.abs(p.predicted) > 0)
    .map(p => (200 * Math.abs(p.actual - p.predicted)) / (Math.abs(p.actual) + Math.abs(p.predicted)));
  const signed = points.filter(p => p.actual).map(p => 100 * (p.predicted / p.actual - 1));
  const withInterval = points.filter(p => p.inside === true || p.inside === false);
  const mean = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  return {
    n, mae: mean(abs), rmse: Math.sqrt(mean(abs.map(x => x * x))), mape: mean(pct), smape: mean(smape), bias: mean(signed),
    coverage: withInterval.length ? withInterval.filter(p => p.inside).length / withInterval.length : null, intervals: withInterval.length,
  };
}

// Metrics per group (horizon, world, model version, week...), in key order.
export function groupMetrics(points, key) {
  const groups = new Map();
  for (const p of points) {
    const k = key(p);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  return [...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, ps]) => ({ key: k, ...metrics(ps) }));
}

// Decompresses an archive object (gzip JSON) fetched as an ArrayBuffer.
export async function readObject(buffer) {
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}
