// One Statistics contract for ingestion, persistence, exports and report consumers.
export const STATISTICS_FIELDS = ['transactions', 'highestPrice', 'averagePrice', 'lowestPrice'];
export const STATISTICS_SIDES = ['buy', 'sell'];

export function statisticsIssues(value) {
  const issues = [];
  for (const side of STATISTICS_SIDES) {
    const row = value?.[side];
    const name = side === 'buy' ? 'Buy' : 'Sell';
    if (!row || STATISTICS_FIELDS.some(k => !Number.isSafeInteger(row[k]) || row[k] < 0)) {
      issues.push({ field: `statistics30d.${side}`, reason: `${name} Statistics: all four values must be nonnegative integers` });
      continue;
    }
    // No transactions is valid only with an explicit zero summary; absent values
    // never become zeros. With transactions, prices must be positive and ordered.
    if (!Number.isSafeInteger(row.transactions * 25) || (row.tcVolume !== undefined && row.tcVolume !== row.transactions * 25)) {
      issues.push({field:`statistics30d.${side}`, reason:`${name} Statistics: TC volume must equal transactions × 25`});
    }
    const prices = [row.lowestPrice, row.averagePrice, row.highestPrice];
    if (row.transactions === 0 ? prices.some(v => v !== 0)
      : prices.some(v => v <= 0) || row.lowestPrice > row.averagePrice || row.averagePrice > row.highestPrice) {
      issues.push({ field: `statistics30d.${side}`, reason: `${name} Statistics: inconsistent count or lowest / average / highest prices` });
    }
  }
  return issues;
}

export function cleanStatistics(value) {
  if (value == null) return null;
  return Object.fromEntries(STATISTICS_SIDES.map(side => [side,
    Object.fromEntries(STATISTICS_FIELDS.map(k => [k,
      Number.isSafeInteger(value?.[side]?.[k]) ? value[side][k] : null]))]));
}

export function validatedStatistics(value) {
  if (statisticsIssues(value).length) throw new Error('Invalid 30-day Statistics');
  const clean = cleanStatistics(value);
  if (statisticsIssues(clean).length) throw new Error('Invalid 30-day Statistics');
  return Object.fromEntries(STATISTICS_SIDES.map(side => [side,{...clean[side],tcVolume:clean[side].transactions*25}]));
}

// Labelled rows only. No digit repair or unlabelled-number inference. Duplicate
// fields invalidate that field even if the two OCR readings happen to agree.
export function parseStatisticsText(text) {
  const result = { buy: {}, sell: {} }, seen = new Set();
  let side = null, inBlock = false;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (/^Statistics\s*:?$/i.test(line)) { inBlock = true; side = null; continue; }
    if (!inBlock) continue;
    const label = /^(Buy|Sell) Offers\s*:?$/i.exec(line);
    if (label) { side = label[1].toLowerCase(); continue; }
    const field = /^(Number of Transactions|Highest Price|Average Price|Lowest Price)\s*:\s*(.*?)\s*$/i.exec(line);
    if (!side || !field) continue;
    const key = ({'number of transactions':'transactions','highest price':'highestPrice',
      'average price':'averagePrice','lowest price':'lowestPrice'})[field[1].toLowerCase()];
    const token = field[2].replace(/\s+gold\s*$/i, '').trim();
    const id = `${side}.${key}`;
    const valid = /^(?:0|[1-9]\d*|[1-9]\d{0,2}(?:,\d{3})+)$/.test(token);
    result[side][key] = !seen.has(id) && valid ? Number(token.replaceAll(',', '')) : null;
    seen.add(id);
  }
  return cleanStatistics(result);
}

export function statisticsCSVValues(capture) {
  return STATISTICS_SIDES.flatMap(side => [...STATISTICS_FIELDS,'tcVolume'].map(k => capture.statistics30d?.[side]?.[k] ?? ''));
}
export const STATISTICS_CSV_HEADERS = STATISTICS_SIDES.flatMap(side => [...STATISTICS_FIELDS,'tcVolume'].map(k =>
  `30d ${side} ${k}${k === 'transactions' ? ' (25-TC lots)' : k === 'tcVolume' ? ' (TC)' : ' (gp/TC)'}`));

const partsAt = (instant, timeZone) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  minute: '2-digit', second: '2-digit', hourCycle: 'h23'
}).formatToParts(instant).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
const clock = p => `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;

export function validTimeZone(zone) {
  if (typeof zone !== 'string' || !zone || zone.length > 100) return false;
  try { partsAt(0, zone); return true; } catch { return false; }
}

// Resolve the preserved filename clock in the ingestion environment's IANA zone.
// Sampling possible offsets around the local day finds both fall-back instants;
// gaps and ambiguous clocks return null instead of choosing an invented instant.
export function normalizeCapturedAt(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(value)) return null;
  const parsed = Date.parse(`${value}Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0,19) === value.slice(0,19) ? value : null;
}
export function captureInstant(capturedAt, timeZone) {
  if (!validTimeZone(timeZone) || !normalizeCapturedAt(capturedAt)) return null;
  const whole = capturedAt.slice(0,19);
  const fraction = Date.parse(`${capturedAt}Z`) - Date.parse(`${whole}Z`);
  const naive = Date.parse(`${whole}Z`);
  if (!Number.isFinite(naive) || new Date(naive).toISOString().slice(0,19) !== whole) return null;
  const offsets = new Set();
  for (let h = -48; h <= 48; h += 6) {
    const sample = naive + h * 3600000;
    offsets.add(Date.parse(`${clock(partsAt(sample, timeZone))}Z`) - sample);
  }
  const matches = [...offsets].map(offset => naive - offset)
    .filter(t => clock(partsAt(t, timeZone)) === whole);
  return matches.length === 1 ? matches[0] + fraction : null;
}
export function statisticsReferenceDate(capturedAt, captureTimeZone) {
  const instant = captureInstant(capturedAt, captureTimeZone);
  if (instant === null) return null;
  const date = capturedAt.slice(0,10), day = Date.parse(`${date}T00:00:00Z`);
  // Find the Berlin 10:00 save that falls on this LOCAL calendar date. Its
  // Berlin date may differ from the local date (for example in Pacific zones).
  const saves = [-1,0,1].map(offset => {
    const berlinDate = new Date(day + offset * 86400000).toISOString().slice(0,10);
    return captureInstant(`${berlinDate}T10:00:00`, 'Europe/Berlin');
  }).filter(save => clock(partsAt(save, captureTimeZone)).slice(0,10) === date);
  if (saves.length !== 1) return null;
  // This date belongs only to Statistics analysis, never to captures or offers.
  return instant >= saves[0] ? date : new Date(day - 86400000).toISOString().slice(0,10);
}

// Rolling counts are overlapping windows, not daily volume. Do not sum them.
export function statisticsObservations(captures, { bucket = 'reference' } = {}) {
  const rows = [], seen = new Set(), quotes = new Map();
  for (const c of [...captures].sort((a,b) => (a.capturedAtUtc ?? a.capturedAt).localeCompare(b.capturedAtUtc ?? b.capturedAt))) {
    if (seen.has(c.hash)) continue;
    seen.add(c.hash);
    if (c.capturedAtUtc && Number.isFinite(c.sell) && Number.isFinite(c.buy)) quotes.set(c.world,c);
    if (!c.statistics30d || statisticsIssues(c.statistics30d).length) continue;
    const referenceDate = statisticsReferenceDate(c.capturedAt, c.captureTimeZone);
    if (bucket !== 'capture' && !referenceDate) continue;
    for (const side of STATISTICS_SIDES) {
      const s = c.statistics30d[side];
      const quote = Number.isFinite(c[side]) ? c : c.capturedAtUtc ? quotes.get(c.world) : null;
      rows.push({world:c.world, hash:c.hash, capturedAt:c.capturedAt, captureDate:c.capturedAt.slice(0,10),
        capturedAtUtc:c.capturedAtUtc ?? null, statisticsReferenceDate:referenceDate, date:bucket === 'capture' ? c.capturedAt.slice(0,10) : referenceDate, side, ...s, tcVolume:s.transactions*25,
        rangePct:s.lowestPrice > 0 ? (s.highestPrice / s.lowestPrice - 1) * 100 : null,
        quoteCapturedAt:quote?.capturedAt ?? null, quoteVsAveragePct:s.averagePrice > 0 && Number.isFinite(quote?.[side]) ? (quote[side] / s.averagePrice - 1) * 100 : null});
    }
  }
  const latest = new Map();
  for (const r of rows) latest.set(JSON.stringify([r.world,r.side,r.date]), r);
  const prior = new Map();
  return [...latest.values()].sort((a,b) => a.date.localeCompare(b.date) || a.world.localeCompare(b.world) || a.side.localeCompare(b.side)).map(r => {
    const key = JSON.stringify([r.world,r.side]), p = prior.get(key); prior.set(key,r);
    return {...r, averageChangePct:p?.averagePrice > 0 ? (r.averagePrice / p.averagePrice - 1) * 100 : null};
  });
}
