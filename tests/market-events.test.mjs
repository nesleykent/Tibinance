import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {appliesTo,cluster,dateText,eventsFor,exportNotes,groupLabel,lifecycleSpan,validate,within} from '../js/market-events.js';
import {buildMarketEvents,expected,list,readInputs,OUTPUT} from '../tools/build_market_events.mjs';

const json = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const dataset = await json(OUTPUT);
const retired = (await json('data/market-history/inputs/retired-worlds.json')).worlds;
const current = (await json('data/market-history/inputs/worlds.json')).worlds.map(w => w.name);
const curated = await json('data/market-events/inputs/events.json');
const known = [...current, ...retired.map(w => w.world), ...curated.otherWorlds.map(w => w.world)];
const byId = new Map(dataset.events.map(e => [e.id, e]));

test('the committed event dataset is a fresh build of its inputs', async () => {
  assert.equal(await readFile(new URL(`../${OUTPUT}`, import.meta.url), 'utf8'), await expected());
  // Every input is named with its hash; the market history is not among them and never names events.
  assert.deepEqual(dataset.inputs.map(i => i.path), ['data/market-events/inputs/events.json', 'data/market-history/inputs/retired-worlds.json',
    'data/market-history/inputs/worlds.json', 'reports/tc-cycle/mergers.json', 'reports/tc-cycle/source-package/events_intervals.json',
    'reports/tc-cycle/source-package/extra_events.json']);
  for (const input of dataset.inputs) assert.match(input.sha256, /^[0-9a-f]{64}$/);
  const index = await readFile(new URL('../data/market-history/tibia-coin/index.json', import.meta.url), 'utf8');
  assert.doesNotMatch(index, /market-events|XP\/Skill|Rapid Respawn/);
});

test('the dataset is valid, ordered and uses every category of the model', () => {
  assert.deepEqual(validate(dataset, known), []);
  assert.deepEqual(dataset.categories.map(c => c.id),
    ['world-created', 'world-retired', 'world-merge', 'update', 'xp-skill', 'rapid-respawn', 'economy', 'store']);
  const used = new Set(dataset.events.map(e => e.category));
  // A retirement so far has always come with a merge, which the merge event records for every world in it.
  assert.deepEqual(dataset.categories.map(c => c.id).filter(id => !used.has(id)), ['world-retired']);
  assert.equal(new Set(dataset.events.map(e => e.id)).size, dataset.events.length);
  for (const e of dataset.events) assert.ok(e.worlds === 'all' || e.worlds.length >= 1);
});

test('every retired world is in exactly one completed merge, on its offline day, into its successor', () => {
  const merges = dataset.events.filter(e => e.category === 'world-merge' && e.merge.status === 'completed');
  assert.equal(merges.length, new Set(retired.map(w => w.mergedInto)).size);
  for (const w of retired) {
    const found = merges.filter(m => m.merge.from.includes(w.world));
    assert.equal(found.length, 1, w.world);
    assert.deepEqual([found[0].start, found[0].merge.into], [w.offline, w.mergedInto]);
    // The merge concerns the retired worlds and the successor, so it is plotted on each of their charts.
    assert.ok(found[0].worlds.includes(w.world) && found[0].worlds.includes(w.mergedInto));
  }
  assert.equal(byId.get('world-merge-2025-11-06-terribra').title, 'Jacabra and Obscubra merged into Terribra');
  // The successor is a current world; facts are never invented for a successor that does not exist yet.
  for (const m of merges) assert.ok(current.includes(m.merge.into), m.merge.into);
});

test('an announced merge is dated by its announcement and does not claim the merge happened', async () => {
  const mergers = await json('reports/tc-cycle/mergers.json');
  const announced = dataset.events.filter(e => e.merge?.status === 'announced');
  assert.equal(announced.length, mergers.length);
  const [deslumbra] = announced;
  assert.deepEqual([deslumbra.start, deslumbra.worlds, deslumbra.merge.into, deslumbra.merge.notBefore],
    ['2026-09-21', ['Etebra', 'Luzibra', 'Yubra'], 'Deslumbra', '2026-10-22']);
  assert.match(deslumbra.description, /no earlier than 2026-10-22; the date was not yet confirmed/);
});

test('recurring game events run from server save to server save: the last listed calendar day is not a server day', async () => {
  const intervals = await json('reports/tc-cycle/source-package/events_intervals.json');
  const kinds = curated.research.intervals.events;
  const source = intervals.filter(i => kinds[i.event]);
  const plotted = dataset.events.filter(e => e.source.file === curated.research.intervals.file);
  assert.equal(plotted.length, source.length);
  // The official schedule's XP/Skill Event of 2026-07-03 08:00 UTC to 2026-07-06 08:00 UTC covers three server days.
  const july = plotted.find(e => e.category === 'xp-skill' && e.start === '2026-07-03');
  assert.deepEqual([july.end, july.source.calendarDays], ['2026-07-05', ['2026-07-03', '2026-07-06']]);
  assert.equal(plotted.filter(e => e.category === 'rapid-respawn').length, source.filter(i => i.event === 'Rapid Respawn').length);
  for (const e of plotted) assert.equal(e.worlds, 'all');
});

test('facts found in prose keep their official source; dated research events keep their own', () => {
  for (const id of ['world-created-2025-05-21-luzibra-opened', 'world-created-2026-05-20-floribra-opened', 'world-created-2025-11-06-terribra-opened']) {
    assert.match(byId.get(id).source.url, /^https:\/\/www\.tibia\.com\/news\//, id);
  }
  const premium = byId.get('store-2025-07-29-premium-restriction-lifted');
  assert.deepEqual(premium.worlds, ['Kalimera', 'Luzibra', 'Sonera']);
  assert.match(premium.source.url, /id=8475/);
  for (const e of dataset.events.filter(e => e.category === 'update')) assert.equal(e.worlds, 'all');
  assert.equal(dataset.events.filter(e => e.title.startsWith('Summer Update') || e.title.startsWith('Winter Update')).length, 7);
});

test('the builder rejects what the model does not allow', async () => {
  const inputs = await readInputs();
  const build = change => () => buildMarketEvents(change(structuredClone(inputs)));
  assert.throws(build(i => { i.curated.events[0].worlds = ['Nowhere']; return i; }), /unknown world Nowhere/);
  assert.throws(build(i => { i.curated.events[0].category = 'rumour'; return i; }), /unknown category rumour/);
  assert.throws(build(i => { i.retired.worlds[0].mergedInto = 'Atlantis'; return i; }), /unknown successor Atlantis/);
  assert.throws(build(i => { i.dated.push({event: 'Something new', start: '2025-01-01', end: '2025-01-01'}); return i; }), /not classified/);
  assert.throws(build(i => { i.curated.events[0].description = `Opened ${String.fromCodePoint(0xb7)} new`; return i; }), /middle dot or a dash/);
});

test('validation covers dates, scope, merges and sources', () => {
  const categories = dataset.categories;
  const one = event => validate({categories, events: [{id: 'x', category: 'update', start: '2025-01-01', end: '2025-01-01', worlds: 'all',
    title: 'T', description: 'D', source: {file: 'f'}, ...event}]}, known);
  assert.deepEqual(one({}), []);
  assert.match(one({start: '2025-02-30', end: '2025-02-30'}).join(), /server days/);
  assert.match(one({end: '2024-12-31'}).join(), /ends before it starts/);
  assert.match(one({worlds: []}).join(), /'all' or a list/);
  assert.match(one({worlds: ['Antica', 'Antica']}).join(), /listed twice/);
  assert.match(one({source: {}}).join(), /a source/);
  assert.match(one({merge: {from: ['Antica'], into: 'Belobra', status: 'completed'}}).join(), /only a world merge/);
  const merge = m => one({category: 'world-merge', worlds: ['Antica', 'Belobra'], merge: m});
  assert.deepEqual(merge({from: ['Antica'], into: 'Belobra', status: 'completed'}), []);
  assert.match(merge({from: ['Antica'], into: 'Belobra', status: 'rumoured'}).join(), /completed or announced/);
  assert.match(merge({from: ['Celebra'], into: 'Belobra', status: 'completed'}).join(), /every world it joins/);
  assert.deepEqual(merge({from: ['Antica', 'Belobra'], into: 'Newbra', status: 'announced', notBefore: '2027-01-01'}), []);
  // The model holds a retirement without a merge, and an event for several worlds or all of them.
  assert.deepEqual(one({category: 'world-retired', worlds: ['Antica']}), []);
  assert.deepEqual(one({category: 'economy', worlds: ['Antica', 'Belobra', 'Celebra']}), []);
});

test('a world sees the global events and its own, never another world\'s', () => {
  const jacabra = eventsFor(dataset, 'Jacabra'), antica = eventsFor(dataset, 'Antica');
  assert.ok(jacabra.some(e => e.id === 'world-merge-2025-11-06-terribra'));
  assert.ok(!antica.some(e => e.id === 'world-merge-2025-11-06-terribra'));
  assert.ok(!antica.some(e => e.id === 'world-created-2025-05-21-luzibra-opened'));
  const global = dataset.events.filter(e => e.worlds === 'all').length;
  assert.equal(antica.length, global, 'Antica has no events of its own');
  assert.deepEqual(eventsFor(dataset, 'Terribra').filter(e => e.worlds !== 'all').map(e => e.id),
    ['world-created-2025-11-06-terribra-opened', 'world-merge-2025-11-06-terribra']);
  assert.ok(appliesTo({worlds: 'all'}, 'Anywhere') && !appliesTo({worlds: ['Antica']}, 'Belobra'));
  assert.equal(jacabra[0].category.label, dataset.categories.find(c => c.id === jacabra[0].category.id).label, 'categories are resolved');
  assert.deepEqual(eventsFor(null, 'Antica'), [], 'without a dataset there are no events');
});

test('a world\'s own lifecycle bounds its axis within the history, an announcement does not', () => {
  assert.deepEqual(lifecycleSpan(eventsFor(dataset, 'Jacabra'), 'Jacabra', '2023-01-10'), {first: '2025-11-06', last: '2025-11-06'});
  assert.deepEqual(lifecycleSpan(eventsFor(dataset, 'Luzibra'), 'Luzibra', '2023-01-10'), {first: '2025-05-21', last: '2025-05-21'});
  assert.equal(lifecycleSpan(eventsFor(dataset, 'Antica'), 'Antica', '2023-01-10'), null);
  assert.equal(lifecycleSpan(eventsFor(dataset, 'Luzibra'), 'Luzibra', '2025-06-01'), null, 'nothing before the history begins');
  const opened = [{id: 'o', category: {lifecycle: true}, worlds: ['Antica'], start: '1997-01-07', end: '1997-01-07'}];
  assert.equal(lifecycleSpan(opened, 'Antica', '2023-01-10'), null);
});

test('events outside a chart\'s days are left out, and those across its edge are clipped', () => {
  const e = (id, start, end) => ({id, start, end});
  assert.deepEqual(within([e('a', '2025-01-01', '2025-01-03'), e('b', '2025-02-01', '2025-02-01'), e('c', '2025-03-01', '2025-03-04')], '2025-01-02', '2025-03-02'),
    [e('a', '2025-01-02', '2025-01-03'), e('b', '2025-02-01', '2025-02-01'), e('c', '2025-03-01', '2025-03-02')]);
  assert.equal(dateText(e('x', '2026-07-03', '2026-07-05')), '2026-07-03 to 2026-07-05');
  assert.equal(dateText(e('x', '2026-07-13', '2026-07-13')), '2026-07-13');
});

test('markers that would overlap become one group at the earliest; distant ones stay apart', () => {
  const ev = id => ({id});
  const groups = cluster([{x: 10, width: 14, event: ev('a')}, {x: 18, width: 14, event: ev('b')}, {x: 24, width: 14, event: ev('c')}, {x: 60, width: 22, event: ev('d')}],
    {gap: 2, widthOf: events => events.length > 1 ? 14 : 22});
  assert.deepEqual(groups.map(g => [g.x, g.key]), [[10, 'a b c'], [60, 'd']]);
  // Kept whole inside the plot: moved in from an edge, and joined to a neighbour it would then touch.
  const edge = cluster([{x: -30, width: 14, event: ev('early')}, {x: 9, width: 14, event: ev('next')}, {x: 50, width: 14, event: ev('apart')}, {x: 99, width: 14, event: ev('last')}],
    {gap: 2, bounds: [0, 100], widthOf: events => 14 + 8 * (events.length - 1)});
  assert.deepEqual(edge.map(g => [g.x, g.key]), [[11, 'early next'], [50, 'apart'], [93, 'last']]);
  for (const g of edge) assert.ok(g.x - g.width / 2 >= 0 && g.x + g.width / 2 <= 100);
  edge.forEach((g, i) => i && assert.ok(g.x - g.width / 2 >= edge[i - 1].x + edge[i - 1].width / 2 + 2, 'no overlap'));
  // A group its own label widens past the edge is moved in, and joins the neighbour it then reaches.
  const wide = cluster([{x: 0, width: 14, event: ev('p')}, {x: 2, width: 14, event: ev('q')}, {x: 24, width: 14, event: ev('r')}],
    {gap: 2, bounds: [0, 100], widthOf: events => 14 + 12 * (events.length - 1)});
  assert.deepEqual(wide.map(g => g.key), ['p q r']);
  assert.equal(groupLabel([{start: '2026-06-05', end: '2026-06-07', title: 'Rapid Respawn', description: 'Monsters respawn at a faster rate.'}]),
    '2026-06-05 to 2026-06-07, Rapid Respawn: Monsters respawn at a faster rate.');
  assert.match(groupLabel(eventsFor(dataset, 'Terribra').filter(e => e.start === '2025-11-06')), /^2 events\. 2025-11-06, Terribra opened: .* 2025-11-06, Jacabra and Obscubra merged into Terribra: /);
});

test('an exported image explains its markers without listing every recurring one', () => {
  const events = eventsFor(dataset, 'Antica');
  const notes = exportNotes(events, {limit: 3});
  assert.deepEqual(notes.keys.map(k => [k.category.id, k.count]), [['update', 8], ['xp-skill', 27], ['rapid-respawn', 15], ['economy', 2]]);
  assert.deepEqual(notes.rows.map(e => e.title), ['Summer Update 2023', 'Winter Update 2023', 'Summer Update 2024']);
  assert.equal(notes.more, 7);
  assert.ok(notes.rows.every(e => !e.category.recurring));
});

test('names are listed as prose', () => {
  assert.equal(list(['A']), 'A');
  assert.equal(list(['A', 'B']), 'A and B');
  assert.equal(list(['A', 'B', 'C']), 'A, B and C');
});
