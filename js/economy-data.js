// The Economy page's arithmetic, kept apart from the page so it is tested: periods, sums with coverage, growth,
// creature contributions, hypothetical liquidation scenarios and the cross-world table.
//
// A world file (data/economy/gold/worlds/<dir>.json) holds daily arrays from `first`: directCoins, npcPotential,
// kills, killsValued, playerDeaths, grossStable and status (o observed, r recovered, m missing). Every value covers
// valued creatures only. A missing day is null and is never counted as zero; a period's sum says how many of its days
// had data, and growth is computed only between periods that both have every day.

const DAY = 86400000;
export const addDays = (iso, k) => new Date(Date.parse(`${iso}T00:00:00Z`) + k * DAY).toISOString().slice(0, 10);
export const dayIndex = (world, iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${world.first}T00:00:00Z`)) / DAY);
export const lastDay = world => addDays(world.first, world.status.length - 1);

// The period that holds a day, as [start, end] ISO dates: Day, Week (Monday to Sunday), Month, Quarter or Year.
export function periodOf(iso, unit) {
  const d = new Date(`${iso}T00:00:00Z`), y = d.getUTCFullYear(), m = d.getUTCMonth();
  const ymd = t => t.toISOString().slice(0, 10);
  if (unit === 'day') return [iso, iso];
  if (unit === 'week') { const start = addDays(iso, -((d.getUTCDay() + 6) % 7)); return [start, addDays(start, 6)]; }
  if (unit === 'month') return [ymd(new Date(Date.UTC(y, m, 1))), ymd(new Date(Date.UTC(y, m + 1, 0)))];
  if (unit === 'quarter') { const q = Math.floor(m / 3) * 3; return [ymd(new Date(Date.UTC(y, q, 1))), ymd(new Date(Date.UTC(y, q + 3, 0)))]; }
  if (unit === 'year') return [`${y}-01-01`, `${y}-12-31`];
  throw new Error(`unknown period ${unit}`);
}

export const previousPeriod = ([start], unit) => periodOf(addDays(start, -1), unit);

const FIELDS = ['directCoins', 'npcPotential', 'kills', 'killsValued', 'playerDeaths', 'grossStable'];

// Sums over [start, end] (clipped to the world's data), with the days that had data.
export function sumPeriod(world, [start, end]) {
  const from = Math.max(0, dayIndex(world, start)), to = Math.min(world.status.length - 1, dayIndex(world, end));
  const out = Object.fromEntries(FIELDS.map(f => [f, 0]));
  let observed = 0, recovered = 0, missing = 0, worldDays = 0, worldDaysCovered = 0;
  const span = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / DAY) + 1;
  for (let i = from; i <= to; i++) {
    worldDays += world.worldsExpected?.[i] ?? 0;
    worldDaysCovered += world.worldsCovered?.[i] ?? 0;
    const s = world.status[i];
    if (s === 'm') { missing++; continue; }
    s === 'r' ? recovered++ : observed++;
    for (const f of FIELDS) out[f] += world[f][i] ?? 0;
  }
  const covered = observed + recovered;
  const outside = span - (to >= from ? to - from + 1 : 0);
  if (!covered) for (const f of FIELDS) out[f] = null;
  return { start, end, days: span, covered, observed, recovered, missing, outsideData: outside, complete: covered === span,
    ...(world.worldsExpected ? { worldDays, worldDaysCovered } : {}),
    ...out, grossPotential: covered ? out.directCoins + out.npcPotential : null, killCoverage: out.kills ? out.killsValued / out.kills : null };
}

// Growth between two sums, only when both periods have every day; otherwise null with the reason.
export function growth(current, previous, field = 'grossPotential') {
  if (!current.complete || !previous.complete) return { value: null, reason: 'a period has missing days or falls outside the data' };
  if (!previous[field]) return { value: null, reason: 'nothing in the previous period' };
  return { value: current[field] / previous[field] - 1, reason: null };
}

// A series by period unit for charting: [{start, end, ...sums}] for every period overlapping the data.
export function series(world, unit, { from = world.first, to = lastDay(world) } = {}) {
  const out = [];
  let p = periodOf(from, unit);
  while (p[0] <= to) {
    out.push(sumPeriod(world, p));
    p = periodOf(addDays(p[1], 1), unit);
  }
  return out;
}

// Hypothetical NPC liquidation: gold plus a stated share of the NPC potential. An assumption, never an observation.
export const LIQUIDATION_SCENARIOS = [0, 0.25, 0.5, 0.75, 1];
export function withLiquidation(sum, rate) {
  if (!LIQUIDATION_SCENARIOS.includes(rate)) throw new Error('liquidation rate must be one of the labelled scenarios');
  if (sum.directCoins === null || sum.npcPotential === null) return null;
  return sum.directCoins + rate * sum.npcPotential;
}

// Creature contributions over a range of months: the monthly top lists summed. A creature outside a month's top 30
// counts in that month's "other"; the result says how much of the total the listed creatures cover.
export function contributions(file, [start, end], limit = 30) {
  const months = file.months.filter(m => `${m.month}-31` >= start && `${m.month}-01` <= end);
  const byCreature = new Map();
  let other = { kills: 0, directCoins: 0, npcPotential: 0 }, total = { kills: 0, directCoins: 0, npcPotential: 0 };
  for (const m of months) {
    for (const [page, kills, dc, np] of m.creatures) {
      const c = byCreature.get(page) ?? { page, kills: 0, directCoins: 0, npcPotential: 0, listedMonths: 0 };
      c.kills += kills; c.directCoins += dc; c.npcPotential += np;
      c.listedMonths++;
      byCreature.set(page, c);
    }
    other = { kills: other.kills + m.other.kills, directCoins: other.directCoins + m.other.directCoins, npcPotential: other.npcPotential + m.other.npcPotential };
    total = { kills: total.kills + m.killsValued, directCoins: total.directCoins + m.directCoins, npcPotential: total.npcPotential + m.npcPotential };
  }
  const gross = c => c.directCoins + c.npcPotential;
  const rows = [...byCreature.values()].sort((a, b) => gross(b) - gross(a))
    .map(c => ({ ...c, complete: c.listedMonths === months.length, grossPotential: gross(c), share: gross(total) ? gross(c) / gross(total) : null,
      coinsPerKill: c.kills ? c.directCoins / c.kills : null, npcPerKill: c.kills ? c.npcPotential / c.kills : null }));
  // Across several months the union can exceed 30. Keep every omitted contribution in the residual.
  for (const r of rows.slice(limit)) {
    other.kills += r.kills; other.directCoins += r.directCoins; other.npcPotential += r.npcPotential;
  }
  return { months: months.map(m => m.month), rows: rows.slice(0, limit), other, total: { ...total, grossPotential: gross(total) } };
}

// Exact calendar-month aggregates for comparisons; missing worlds remain explicit, with null totals.
export function monthlySums(months, [start, end]) {
  const rows = months.filter(m => m[0] >= start.slice(0, 7) && m[0] <= end.slice(0, 7));
  const total = rows.reduce((s, m) => s.map((v, i) => v + m[i + 1]), [0, 0, 0, 0, 0, 0]);
  const [directCoins, npcPotential, kills, killsValued, covered, inData] = total;
  const days = Math.round((Date.parse(end) - Date.parse(start)) / DAY) + 1;
  return { start, end, days, covered, complete: covered === days, outsideData: days - inData,
    directCoins: covered ? directCoins : null, npcPotential: covered ? npcPotential : null,
    grossPotential: covered ? directCoins + npcPotential : null, kills: covered ? kills : null,
    killsValued: covered ? killsValued : null, killCoverage: kills ? killsValued / kills : null };
}

export const median = values => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b), m = Math.floor(v.length / 2);
  return v.length ? (v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) : null;
};

// One price per world and server day. All uses the cross-world median on each observed day, then the median
// of those daily prices per interval: days have equal weight despite changes in the number of worlds sampled.
// A single-world input preserves that world's existing period median. Counts describe quotes, not trade volume.
export function sellOfferPeriods(worlds, interval) {
  const days = new Map();
  for (const w of worlds) for (const [day, sell] of w.bestOfferCloses ?? []) {
    if (!Number.isFinite(sell) || sell <= 0) continue;
    if (!days.has(day)) days.set(day, new Map());
    const quotes = days.get(day);
    if (quotes.has(w.world) && quotes.get(w.world) !== sell) throw new Error(`conflicting TC price: ${w.world} ${day}`);
    quotes.set(w.world, sell);
  }
  const periods = new Map();
  for (const [day, quotes] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    const start = periodOf(day, interval)[0];
    if (!periods.has(start)) periods.set(start, { daily: [], worlds: new Set(), worldDays: 0 });
    const p = periods.get(start);
    p.daily.push(median([...quotes.values()]));
    for (const world of quotes.keys()) p.worlds.add(world);
    p.worldDays += quotes.size;
  }
  return new Map([...periods].map(([start, p]) => [start,
    { sell: median(p.daily), n: p.daily.length, worlds: p.worlds.size, worldDays: p.worldDays }]));
}

// Market values keep their own observation count: a sampled median is never a full-period gold total.
export function chartPeriods(world, closes, unit) {
  const byPeriod = new Map();
  for (const [day, sell] of closes) {
    if (!Number.isFinite(sell)) continue;
    const key = periodOf(day, unit)[0];
    if (!byPeriod.has(key)) byPeriod.set(key, []);
    byPeriod.get(key).push(sell);
  }
  return series(world, unit).map(p => ({ ...p, sell: median(byPeriod.get(p.start) ?? []), priceDays: byPeriod.get(p.start)?.length ?? 0 }));
}

// Lightweight Charts joins across whitespace. Hide the outgoing segment before each missing period explicitly.
export function brokenLine(rows, value) {
  return rows.map((row, i) => {
    const v = value(row);
    return v === null || !Number.isFinite(v) ? { time: row.start }
      : { time: row.start, value: v, ...(i + 1 < rows.length && !Number.isFinite(value(rows[i + 1])) ? { color: 'rgba(0,0,0,0)' } : {}) };
  });
}

// One row per world for a period: its sums and the warnings that limit comparison with other worlds.
export function crossWorld(index, files, period) {
  return index.worlds.map(w => {
    const file = files.get(w.dir);
    const s = file ? sumPeriod(file, period) : null;
    const warnings = [];
    if (!s || s.covered === 0) warnings.push('no data in this period');
    else {
      if (!s.complete) warnings.push(`${s.covered} of ${s.days} days`);
      if (s.killCoverage !== null && s.killCoverage < 0.95) warnings.push(`kill coverage ${(100 * s.killCoverage).toFixed(1)}%`);
    }
    if (w.first > period[0]) warnings.push(`data from ${w.first}`);
    return { world: w.world, dir: w.dir, sum: s, warnings, comparable: Boolean(s && s.complete && s.killCoverage >= 0.95) };
  });
}

// ---- The Economy terminal (economy.html): one measure, as gold per day, at one interval -------------------------
// Every interval plots the same unit, gold per day: a day's total, or a week's or month's total over its days. So a
// weekly or monthly line is a smoothing of the daily one, never a different scale. A period counts only when every
// one of its days has data; an unfinished or gapped period has no rate (it is never a fall, and never zero).

export const MEASURES = {
  gross: { field: 'grossPotential', name: 'Gross potential', short: 'Gross' },
  coins: { field: 'directCoins', name: 'Direct gold', short: 'Gold' },
  npc: { field: 'npcPotential', name: 'NPC potential', short: 'NPC' },
};
export const INTERVALS = ['day', 'week', 'month'];
const RATE_FIELDS = ['grossPotential', 'directCoins', 'npcPotential', 'kills', 'killsValued', 'playerDeaths', 'grossStable'];

// Every period of the world at the interval, each with its rates per day (null unless complete).
export function ratePeriods(world, unit) {
  return series(world, unit).map(p => ({ ...p, rate: Object.fromEntries(RATE_FIELDS.map(f => [f, p.complete && p[f] !== null ? p[f] / p.days : null])) }));
}

// Running sums of the available daily evidence, clipped to the exact selected range. Missing days never
// contribute zero: a wholly missing bin is whitespace, and later subtotals carry their cumulative coverage.
export function accumulatedPeriods(world, periods, [from, to]) {
  const fields = ['directCoins', 'npcPotential', 'grossStable'];
  const total = Object.fromEntries(fields.map(f => [f, 0]));
  let covered = 0, days = 0;
  return periods.map(p => {
    const start = p.start < from ? from : p.start, end = p.end > to ? to : p.end;
    const sum = start <= end ? sumPeriod(world, [start, end]) : null;
    if (sum) {
      covered += sum.covered; days += sum.days;
      for (const f of fields) total[f] += sum[f] ?? 0;
    }
    const available = Boolean(sum?.covered);
    return { start: p.start, from, end, days, covered, complete: covered === days,
      ...Object.fromEntries(fields.map(f => [f, available ? total[f] : null])),
      grossPotential: available ? total.directCoins + total.npcPotential : null };
  });
}

const MONTHS_BACK = { '1M': 1, '3M': 3, '6M': 6, '1Y': 12 };
// The first day a range shows when it ends on `end` (calendar months, clamped to the shorter month); null for All.
// The same rule as Markets (js/market-series.js rangeStart).
export function rangeStartOf(end, range) {
  if (range === 'All') return null;
  const [y, m, d] = end.split('-').map(Number);
  if (range === 'YTD') return `${y}-01-01`;
  if (!MONTHS_BACK[range]) throw new Error(`unknown range ${range}`);
  const month = new Date(Date.UTC(y, m - 1 - MONTHS_BACK[range], 1));
  const last = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate();
  month.setUTCDate(Math.min(d, last));
  return month.toISOString().slice(0, 10);
}

// Change of the latest complete period's rate against the complete period holding the range's first day (or, when
// that one is incomplete, the latest complete one before it, else the first inside the range). Null without a base.
export function rangeChange(periods, field, range) {
  const done = periods.filter(p => p.rate[field] !== null);
  if (done.length < 2) return null;
  const last = done.at(-1), start = rangeStartOf(last.end, range);
  const base = start === null ? done[0] : (done.findLast(p => p.start <= start) ?? done.find(p => p.start >= start));
  if (!base || base === last || !base.rate[field]) return null;
  return { from: base, to: last, delta: last.rate[field] - base.rate[field], ratio: last.rate[field] / base.rate[field] - 1 };
}

// One watchlist row per world from the overview (data/economy/gold/overview.json, tools/build_economy_overview.mjs):
// the measure in gold per day over its latest complete period at the interval, and its change over the range, computed
// by the chart's own functions, so a world's row and its chart agree. Worlds whose data ended (retired or merged)
// appear only when a search names them, as on Markets; low kill coverage is stated, never hidden.
export function overviewRows(overview, interval, measure, range, filter = '') {
  const at = overview.ranges.indexOf(range) + 1, q = filter.trim().toLowerCase();
  return overview.worlds.filter(w => (q ? w.world.toLowerCase().includes(q) : !w.ended)).map(w => {
    const v = w[interval], m = v?.[measure];
    return { world: w.world, dir: w.dir, ended: w.ended ? w.last : null, last: v?.last ?? null, coverage: v?.coverage ?? null,
      value: m ? m[0] : null, change: m ? m[at] : null };
  });
}
