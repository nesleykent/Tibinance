// Builds the Markets event dataset, data/market-events/events.json, from facts the repository already holds:
//
//   data/market-events/inputs/events.json            categories, how research events are classified, and the facts
//                                                     found only in prose (openings, Premium and transfer changes)
//   data/market-history/inputs/retired-worlds.json   each retired world's offline day and successor: the merges
//   data/market-history/inputs/worlds.json           the current worlds, to check every name
//   reports/tc-cycle/mergers.json                    announced merges
//   reports/tc-cycle/source-package/events_intervals.json   XP/Skill and Rapid Respawn events (TibiaMarket)
//   reports/tc-cycle/source-package/extra_events.json       updates and Tibia Token changes
//   reports/tc-cycle/inputs/eventschedule.json              official scheduled calendar and descriptions
//   data/market-events/inputs/api-history.json              complete returned TibiaMarket event observations
//
//   node tools/build_market_events.mjs          rebuild and write
//   node tools/build_market_events.mjs --check  fail if the committed file differs
//
// Events never enter the market history files, and the history never reads them. The output is a pure function of
// the inputs: no clock, no network, stable ordering. Each input's hash is recorded.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { addDays } from '../js/market-history.js';
import { order, validate } from '../js/market-events.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CURATED = 'data/market-events/inputs/events.json';
const RETIRED = 'data/market-history/inputs/retired-worlds.json';
const WORLD_SNAPSHOT = 'data/market-history/inputs/worlds.json';
export const OUTPUT = 'data/market-events/events.json';

const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// 'A', 'A and B', 'A, B and C'
export const list = names => names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;

/*
 * inputs: { curated, retired, worlds, mergers, intervals, dated, files: [{path, sha256}] } as parsed JSON.
 * Returns the dataset; throws when it is not valid.
 */
export function buildMarketEvents({ curated, retired, worlds, mergers, intervals, dated, calendar, history, files }) {
  const events = [];
  const add = (event, key) => events.push({ id: `${event.category}-${event.start}-${slug(key)}`, end: event.start, ...event });

  for (const fact of curated.events) add(fact, fact.title);

  // Completed merges: the retired worlds that went offline on the same day into the same successor.
  const groups = new Map();
  for (const w of retired.worlds) {
    const key = `${w.offline} ${w.mergedInto}`;
    groups.set(key, [...(groups.get(key) ?? []), w]);
  }
  for (const group of groups.values()) {
    const from = group.map(w => w.world).sort(), into = group[0].mergedInto, day = group[0].offline;
    add({ category: 'world-merge', start: day, worlds: [...from, into].sort(),
      title: `${list(from)} merged into ${into}`,
      description: `${list(from)} went offline at the server save and joined ${into}.`,
      merge: { from, into, status: 'completed' },
      source: { file: RETIRED, urls: group.map(w => w.source).sort() } }, into);
  }

  // Announced merges: the participants know their date at the announcement, not the merge itself.
  for (const m of mergers) {
    const from = [...m.participants].sort();
    add({ category: 'world-merge', start: m.announcedOn, worlds: from,
      title: `Merge announced: ${list(from)} into ${m.successor}`,
      description: m.confirmedDate ? `${list(from)} will join ${m.successor} on ${m.confirmedDate}.`
        : `${list(from)} will join ${m.successor}, no earlier than ${m.notBefore}; the date was not yet confirmed.`,
      merge: { from, into: m.successor, status: 'announced', ...(m.confirmedDate ? { notBefore: m.confirmedDate } : { notBefore: m.notBefore }) },
      source: { url: m.source, file: curated.research.mergers.file } }, `${m.successor}-announced`);
  }

  // Recurring game events, server save to server save: the last calendar day listed holds only the morning.
  const kinds = curated.research.intervals.events;
  for (const interval of intervals) {
    const kind = kinds[interval.event];
    if (!kind) throw new Error(`Unclassified calendar event: ${interval.event}`);
    const end = interval.end > interval.start ? addDays(interval.end, -1) : interval.start;
    add({ category: kind.category, start: interval.start, end, worlds: 'all', title: kind.title, description: kind.description,
      source: { file: curated.research.intervals.file, event: interval.event, calendarDays: [interval.start, interval.end] } }, kind.title);
  }

  // Official server-save timestamps settle scheduled boundaries, including partial historical dumps.
  const dayOf = seconds => new Date(seconds * 1000).toISOString().slice(0, 10);
  for (const item of calendar.eventlist) {
    const kind = kinds[item.name];
    if (!kind) throw new Error(`Unclassified calendar event: ${item.name}`);
    const start = dayOf(item.startdate), end = addDays(dayOf(item.enddate), -1);
    const existing = events.find(e => e.category === kind.category && e.start === start);
    const fact = { category: kind.category, start, end, worlds: 'all', title: kind.title,
      description: kind.description, source: { file: curated.calendar.file, url: curated.calendar.url,
        calendarDays: [start, dayOf(item.enddate)], lastUpdated: calendar.lastupdatetimestamp } };
    if (existing) Object.assign(existing, fact); // Keep its original stable ID.
    else add(fact, kind.title);
  }

  // Preserve every returned observation. Missing days do not imply an event continued.
  const observations = new Map();
  for (const entry of history) for (const raw of entry.events) {
    const name = raw.replace(/^\*\s*/, '').trim();
    if (!name || name === '-') continue;
    const kind = kinds[name];
    if (!kind) throw new Error(`Unclassified calendar event: ${name}`);
    const day = entry.date.slice(0, 10);
    // The final calendar date may contain only the hours before server save.
    if (events.some(e => e.category === kind.category && e.start <= day && (e.source.calendarDays?.[1] ?? e.end) >= day)) continue;
    if (!observations.has(name)) observations.set(name, new Set());
    observations.get(name).add(day);
  }
  for (const [name, dates] of observations) {
    const kind = kinds[name], runs = [];
    for (const day of [...dates].sort()) {
      const last = runs.at(-1);
      if (last && addDays(last.end, 1) === day) last.end = day;
      else runs.push({ start: day, end: day });
    }
    for (const run of runs) add({ ...run, category: kind.category, worlds: 'all', title: kind.title,
      description: `${kind.description} Recorded active on these dates; complete server-save boundaries are not available.`,
      source: { file: curated.history.file, url: curated.history.url, observed: true } }, kind.title);
  }

  // Dated events the research recorded with their own sources.
  const known = curated.research.dated.events;
  for (const fact of dated) {
    const kind = known[fact.event];
    if (!kind) throw new Error(`${curated.research.dated.file}: ${fact.event} is not classified in ${CURATED}`);
    const year = fact.start.slice(0, 4), fill = text => text.replaceAll('{year}', year);
    add({ category: kind.category, start: fact.start, end: fact.end, worlds: 'all', title: fill(kind.title), description: fill(kind.description),
      source: { file: curated.research.dated.file, note: fact.source, confidence: fact.confidence } }, fill(kind.title));
  }

  events.sort((a, b) => order(a, b, curated.categories));
  const dataset = {
    format: 1,
    note: 'Shared game calendar and market events for the calendar, agenda, details, chart markers and exports. Dates are server days, inclusive. Built by tools/build_market_events.mjs; source records provenance.',
    inputs: files,
    categories: curated.categories,
    events: events.map(({ id, category, start, end, worlds: scope, title, description, merge, source }) =>
      ({ id, category, start, end, worlds: scope, title, description, ...(merge ? { merge } : {}), source }))
  };
  const names = [...worlds.worlds.map(w => w.name), ...retired.worlds.map(w => w.world), ...curated.otherWorlds.map(w => w.world)];
  const errors = validate(dataset, names);
  if (errors.length) throw new Error(`The event dataset is not valid:\n${errors.join('\n')}`);
  return dataset;
}

export async function readInputs(root = ROOT) {
  const read = async path => {
    const bytes = await readFile(join(root, path));
    return { path, sha256: createHash('sha256').update(bytes).digest('hex'), value: JSON.parse(bytes) };
  };
  const curated = await read(CURATED);
  const research = curated.value.research;
  const parts = { curated, retired: await read(RETIRED), worlds: await read(WORLD_SNAPSHOT), mergers: await read(research.mergers.file),
    intervals: await read(research.intervals.file), dated: await read(research.dated.file),
    calendar: await read(curated.value.calendar.file), history: await read(curated.value.history.file) };
  return { ...Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.value])),
    files: Object.values(parts).map(({ path, sha256 }) => ({ path, sha256 })) };
}

export const formatJson = dataset => `${JSON.stringify(dataset, null, 1)}\n`;
export async function expected(root = ROOT) { return formatJson(buildMarketEvents(await readInputs(root))); }

async function main() {
  const content = await expected();
  const path = join(ROOT, OUTPUT);
  if (process.argv.includes('--check')) {
    const current = await readFile(path, 'utf8').catch(() => null);
    if (current !== content) {
      console.error(`${OUTPUT} is out of date. Run: node tools/build_market_events.mjs`);
      process.exitCode = 1;
    } else console.log(`${OUTPUT} is current.`);
    return;
  }
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  const dataset = JSON.parse(content), count = {};
  for (const e of dataset.events) count[e.category] = (count[e.category] ?? 0) + 1;
  console.log(JSON.stringify({ file: OUTPUT, events: dataset.events.length, byCategory: count }));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
