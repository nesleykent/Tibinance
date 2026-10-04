// Builds the Markets projection dataset, data/market-projections/tibia-coin.json, from the Research report's own
// generated scenarios. Markets has no forecasting model of its own: reports/tc-cycle/analyze.py computes every number
// (results.json `worldForecast` and `worlds`), and this tool only carries them over, in a compact form, with the facts
// Markets needs to place them:
//
//   reports/tc-cycle/results.json         the per-world, per-side weekly scenarios and their anchors (Research)
//   reports/tc-cycle/market-update.json   the captures, to find the server day of a capture-dated anchor
//   data/market-history/tibia-coin/index.json   the Markets worlds and their latest best offers
//
//   node tools/build_market_projections.mjs          rebuild and write
//   node tools/build_market_projections.mjs --check  fail if the committed file differs
//
// Values are rounded to whole gold, as every Tibinance price is shown. The output is a pure function of the inputs.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { addDays, serverDay } from '../js/market-history.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const RESULTS = 'reports/tc-cycle/results.json';
const CAPTURES = 'reports/tc-cycle/market-update.json';
const INDEX = 'data/market-history/tibia-coin/index.json';
export const OUTPUT = 'data/market-projections/tibia-coin.json';

// The Research's own condition labels (results.json is written in Portuguese), as Markets codes.
export const STATUS = {
  'Cenário de ofertas': 'scenario',
  'Condicional: cotação defasada': 'stale',
  'Condicional: pontas cruzadas': 'crossed',
  'Suspenso: fusão anunciada': 'suspended'
};
const SIDE = { ask: 'sell', bid: 'buy' };
const round = v => v == null ? null : Math.round(v);

/*
 * The server day of a Research anchor. The Research dates an API quote by its server day, as Markets does, and a
 * capture by the calendar date it was taken on, in the capturer's own time zone; such a capture taken before the
 * 10:00 Berlin save belongs to the server day before. Returns null when no capture explains the date.
 */
function anchorDay(metric, captures) {
  if (metric.source !== 'Captura') return metric.date;
  const capture = captures.find(c => c.world === metric.world && c.capturedAt.slice(0, 10) === metric.date && c.sell === metric.ask && c.buy === metric.bid && c.capturedAtUtc);
  return capture ? serverDay(Date.parse(capture.capturedAtUtc)) : null;
}

export function buildMarketProjections({ results, captures, index, files }) {
  const markets = new Map(index.worlds.map(w => [w.world, w]));
  const rows = new Map();
  for (const row of results.worldForecast) rows.set(`${row.world} ${row.side}`, [...(rows.get(`${row.world} ${row.side}`) ?? []), row]);
  const weeks = [...new Set(results.forecast.map(f => f.date))].sort();
  if (weeks[0] !== addDays(results.asOf, 7)) throw new Error(`The first projected week is ${weeks[0]}, not a week after the cutoff ${results.asOf}`);
  weeks.forEach((d, i) => { if (i && d !== addDays(weeks[i - 1], 7)) throw new Error(`Projected weeks are not 7 days apart at ${d}`); });

  const worlds = results.worlds.map(metric => {
    const world = metric.world;
    if (!markets.has(world)) throw new Error(`${world} is projected by the Research but is not a Markets world`);
    const out = {
      world,
      confidence: metric.confidence === 'Moderada' ? 'moderate' : 'limited',
      testN: metric.testN,
      stale: metric.stale,
      mergerDate: metric.mergerDate ?? null,
      anchor: { researchDate: metric.date, serverDay: anchorDay(metric, captures), source: metric.source === 'Captura' ? 'capture' : 'history',
        sell: round(metric.ask), buy: round(metric.bid) }
    };
    for (const [key, side] of Object.entries(SIDE)) {
      const list = (rows.get(`${world} ${key}`) ?? []).sort((a, b) => a.date.localeCompare(b.date));
      if (list.map(r => r.date).join() !== weeks.join()) throw new Error(`${world} ${side}: the weeks differ from the benchmark's`);
      out[side] = list.map(r => {
        const status = STATUS[r.status];
        if (!status) throw new Error(`${world} ${side} ${r.date}: unknown condition ${r.status}`);
        if (r.anchorDate !== metric.date) throw new Error(`${world} ${side} ${r.date}: anchored on ${r.anchorDate}, not ${metric.date}`);
        if (status === 'suspended') {
          if (r.base != null) throw new Error(`${world} ${side} ${r.date}: a suspended week has a value`);
          return [r.date, null, null, null, status];
        }
        if (!(r.low <= r.base && r.base <= r.high)) throw new Error(`${world} ${side} ${r.date}: the band does not hold the central value`);
        return [r.date, round(r.base), round(r.low), round(r.high), status];
      });
    }
    return out;
  });
  return {
    format: 1,
    asset: 'tibia-coin',
    note: 'The Research report\'s offer scenarios (reports/tc-cycle/analyze.py), carried over for the Markets chart. Rows are [week, central, low, high, condition]; central is the equal-weight C+S+H ensemble for the benchmark, moved to each world\'s own anchor by the benchmark\'s proportional change; low and high bound the heuristic stress band, not a confidence interval. Built by tools/build_market_projections.mjs; nothing here is computed by Markets.',
    source: { ...files.find(f => f.path === RESULTS), asOf: results.asOf, benchmark: results.benchmark },
    inputs: files,
    method: { model: 'C+S+H', stepDays: 7, horizonWeeks: weeks.length, first: weeks[0], last: weeks.at(-1) },
    worlds
  };
}

export async function readInputs(root = ROOT) {
  const read = async path => {
    const bytes = await readFile(join(root, path));
    return { path, sha256: createHash('sha256').update(bytes).digest('hex'), value: JSON.parse(bytes) };
  };
  const parts = { results: await read(RESULTS), captures: await read(CAPTURES), index: await read(INDEX) };
  return { ...Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.value])),
    files: Object.values(parts).map(({ path, sha256 }) => ({ path, sha256 })) };
}

export const formatJson = dataset => `${JSON.stringify(dataset)}\n`;
export async function expected(root = ROOT) { return formatJson(buildMarketProjections(await readInputs(root))); }

async function main() {
  const content = await expected();
  const path = join(ROOT, OUTPUT);
  if (process.argv.includes('--check')) {
    const current = await readFile(path, 'utf8').catch(() => null);
    if (current !== content) {
      console.error(`${OUTPUT} is out of date. Run: node tools/build_market_projections.mjs`);
      process.exitCode = 1;
    } else console.log(`${OUTPUT} is current.`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  const dataset = JSON.parse(content);
  console.log(JSON.stringify({ file: OUTPUT, bytes: content.length, worlds: dataset.worlds.length, ...dataset.method }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
