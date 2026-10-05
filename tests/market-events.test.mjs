import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile, readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {appliesTo,cluster,dateText,eventsFor,exportNotes,groupLabel,lifecycleSpan,validate,within,queryEvents,eventToday,addEventDays,mergerAnnouncements,lifecycleFacts,loadEvents,EVENTS} from '../js/events.js';
import {tokenView} from '../js/tibia-token.js';
const json = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
const dataset = await json('data/events/events.json');
const known = dataset.worlds;
const byId = new Map(dataset.events.map(e => [e.id,e]));

test('one canonical dataset preserves every historical ID and consolidates duplicate real definitions', async () => {
  const ids = await json('tests/fixtures/canonical-event-ids.json');
  const retained=dataset.events.map(e=>e.id);
  assert.ok(ids.every(id=>retained.includes(id)));
  assert.equal(new Set(retained).size,retained.length);
  assert.equal(new Set(ids).size,295);
  assert.equal(new Set(dataset.events.map(e=>`${e.type}|${e.start}`)).size,295);
  assert.deepEqual(validate(dataset),[]);
  assert.equal(dataset.categories.length,35);
  assert.equal(dataset.events.filter(e=>e.category==='update').length,8);
  assert.equal(dataset.events.filter(e=>e.assets.includes?.('tibia-token')).length,2);
  const july=byId.get('xp-skill-2026-07-03-xp-skill-event');
  assert.equal(july.end,'2026-07-05');
  assert.ok(july.provenance.some(p=>p.endsAt==='2026-07-06T08:00:00+00:00'));
  assert.ok(july.provenance.some(p=>p.file.endsWith('calendar.ics')));
  for(const source of dataset.migrationSources) assert.match(source.sha256,/^[a-f0-9]{64}$/);
});

test('research measurements retain canonical IDs and registry retirement facts are derived', async () => {
  const results=await json('reports/tc-cycle/results.json');
  assert.equal('calendar' in results,false);
  assert.ok(results.eventOccurrences.length>0);
  for(const row of results.eventOccurrences) {
    assert.ok(byId.has(row.eventId));assert.equal('date' in row,false);assert.equal('event' in row,false);
  }
  const legacy=await json('reports/tc-cycle/source-package/event_occurrences.json');
  const legacyRows=Object.values(legacy).flat();
  assert.equal(legacyRows.length,154);
  for(const row of legacyRows) assert.ok(byId.has(row.eventId));
  const retired=await json('data/market-history/inputs/retired-worlds.json');
  for(const world of retired.worlds ?? retired) {
    assert.equal('offline' in world,false);assert.equal('mergedInto' in world,false);
  }
  const merge=byId.get('world-merge-2025-11-06-terribra');
  assert.equal(merge.merge.announcedOn,'2025-10-06');
  assert.equal(merge.merge.confirmedOn,'2025-11-03');
  assert.ok(merge.references.some(url=>url.includes('id=8513')));
});

test('context never selects another collection; explicit filters query canonical metadata', async () => {
  const ids=dataset.events.map(e=>e.id);
  for(const world of [...dataset.worlds,'Anywhere','']) assert.deepEqual(eventsFor(dataset,world).map(e=>e.id),ids);
  const file=await json('data/market-history/tibia-token/history.json');
  assert.deepEqual(tokenView(file,dataset).events.map(e=>e.id),ids);
  const events=eventsFor(dataset);
  assert.equal(queryEvents(events,{category:'update'}).length,8);
  assert.ok(queryEvents(events,{world:'Antica'}).every(e=>appliesTo(e,'Antica')));
  assert.equal(queryEvents(events,{asset:'tibia-token'}).filter(e=>e.assets!=='all').length,2);
  assert.equal(queryEvents(events,{scope:'world'}).length,dataset.events.filter(e=>e.worlds!=='all').length);
  assert.deepEqual(eventsFor(null),[]);
  assert.deepEqual(events.map(e=>e.id),ids,'queries never mutate the collection');
});

test('the shared loader uses one canonical URL, validates once and shares the read across consumers', async () => {
  const original=globalThis.fetch;let reads=0;
  globalThis.fetch=async(url,options)=>{assert.equal(String(url),String(EVENTS));assert.equal(options.cache,'no-cache');reads++;return {ok:true,json:async()=>dataset}};
  try { const [a,b]=await Promise.all([loadEvents(),loadEvents()]);assert.strictEqual(a,b);assert.equal(reads,1); }
  finally {globalThis.fetch=original;}
});

test('Python research, lifecycle and merge consumers use the same shared JS boundary', () => {
  const value=JSON.parse(execFileSync(process.execPath,['tools/events.mjs','--json'],{encoding:'utf8'}));
  assert.deepEqual(value.events.map(e=>e.id),dataset.events.map(e=>e.id));
  assert.deepEqual(value.mergers,mergerAnnouncements(dataset));
  assert.deepEqual(value.lifecycle,lifecycleFacts(dataset));
  assert.deepEqual(value.lifecycle.births,{Luzibra:'2025-05-21',Terribra:'2025-11-06',Floribra:'2026-05-20'});
  assert.deepEqual(value.mergers[0].participants,['Etebra','Luzibra','Yubra']);
});

test('known consumers cannot reintroduce a private Events file or a context-dependent collection', async () => {
  const removed=['js/market-events.js','tools/build_market_events.mjs','data/market-events/events.json','data/market-events/inputs/events.json','reports/tc-cycle/mergers.json','reports/tc-cycle/inputs/eventschedule.json','reports/tc-cycle/inputs/calendar.ics','reports/tc-cycle/source-package/events_intervals.json','reports/tc-cycle/source-package/events_daily.json','reports/tc-cycle/source-package/extra_events.json','reports/tc-cycle/source-package/parse_events.py'];
  for(const path of removed) assert.equal(existsSync(new URL(`../${path}`,import.meta.url)),false,path);
  for(const file of ['js/markets.js','js/tibia-token-markets.js','reports/tc-cycle/report.js']) {
    const source=await readFile(new URL(`../${file}`,import.meta.url),'utf8');
    assert.match(source,/loadEvents/); assert.doesNotMatch(source,/fetch\(EVENTS\)|events\.events\.filter|R\.calendar/);
  }
  const token=await readFile(new URL('../js/tibia-token.js',import.meta.url),'utf8');
  assert.match(token,/eventsFor\(dataset\)/);assert.doesNotMatch(token,/eventsFor\([^)]*\)\.filter/);
  for(const file of ['js/market-events-layer.js','js/market-events-panel.js','js/market-events-ui.js','js/market-export.js']) {
    assert.match(await readFile(new URL(`../${file}`,import.meta.url),'utf8'),/from '.\/events.js'/);
  }
  const publicFiles=await readFile(new URL('../reports/tc-cycle/prepare_site.py',import.meta.url),'utf8');
  assert.match(publicFiles,/data\/events\/events.json/); assert.match(publicFiles,/js\/events.js/);
  const forbidden=/events_intervals\.json|events_daily\.json|extra_events\.json|eventschedule\.json|calendar\.ics|mergers\.json/;
  for(const dir of ['js','reports/tc-cycle','reports/tc-cycle/source-package']) for(const name of await readdir(new URL(`../${dir}/`,import.meta.url))) {
    if(!/\.(js|py)$/.test(name))continue;
    assert.doesNotMatch(await readFile(new URL(`../${dir}/${name}`,import.meta.url),'utf8'),forbidden,`${dir}/${name}`);
  }
});

test('validation covers dates, scope, merges and sources', () => {
  const categories = dataset.categories;
  const one = event => validate({categories, events: [{id: 'x', category: 'update', start: '2025-01-01', end: '2025-01-01', worlds: 'all',
    title: 'T', description: 'D', type:'update',assets:'all',entities:[],references:[],provenance:[{file:'f'}], ...event}]}, known);
  assert.deepEqual(one({}), []);
  assert.match(one({start: '2025-02-30', end: '2025-02-30'}).join(), /server days/);
  assert.match(one({end: '2024-12-31'}).join(), /ends before it starts/);
  assert.match(one({worlds: []}).join(), /'all' or a list/);
  assert.match(one({worlds: ['Antica', 'Antica']}).join(), /listed twice/);
  assert.match(one({provenance: [{}]}).join(), /provenance/);
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
  assert.match(groupLabel(eventsFor(dataset, 'Terribra').filter(e => e.start === '2025-11-06')), /^10 events\. 2025-11-06, Terribra opened: .* 2025-11-06, Jacabra and Obscubra merged into Terribra: /);
});


test('exports derive their keys and notes from the same canonical records', () => {
 const events=eventsFor(dataset), notes=exportNotes(events,{limit:1000});
 assert.deepEqual(notes.rows.map(e=>e.id),events.filter(e=>!e.category.recurring).map(e=>e.id));
 assert.equal(notes.more,0);
 assert.equal(notes.keys.reduce((n,k)=>n+k.count,0),events.length);
});

test('one shared server-day clock and explicit period/date filters respect boundaries', () => {
 assert.equal(eventToday(new Date('2026-07-03T07:59:59Z')),'2026-07-02');
 assert.equal(eventToday(new Date('2026-07-03T08:00:00Z')),'2026-07-03');
 assert.equal(eventToday(new Date('2026-01-03T08:59:59Z')),'2026-01-02');
 assert.equal(eventToday(new Date('2026-01-03T09:00:00Z')),'2026-01-03');
 assert.equal(addEventDays('2024-02-28',1),'2024-02-29');
 const events=eventsFor(dataset), today='2026-07-03';
 assert.ok(queryEvents(events,{period:'upcoming',today}).every(e=>e.end>=today));
 assert.ok(queryEvents(events,{period:'recent',today}).every(e=>e.end<today&&e.end>=addEventDays(today,-90)));
 const duplicate=structuredClone(dataset);duplicate.events.push({...duplicate.events[0],id:'another-id'});
 assert.match(validate(duplicate).join(),/duplicate real occurrence/);
});
