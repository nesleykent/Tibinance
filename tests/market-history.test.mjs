import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {serverDay,addDays,validBook,plausibleCaptureSpread,fromTibiaMarket,fromCapture,mergeDaily,mergeObservations} from '../js/market-history.js';
import {buildMarketHistory,formatJson,staleFiles} from '../tools/build_market_history.mjs';

const at = iso => Date.parse(iso);
// A complete TibiaMarket row (Antica, 2026-09-06), as item_history returns it.
const full = {id:22118,time:1788657386.2663367,is_full_data:true,buy_offer:41103,sell_offer:41900,
  month_average_sell:41373,month_average_buy:40432,month_sold:13336,month_bought:20512,active_traders:21,
  month_highest_sell:56000,month_lowest_buy:1,month_lowest_sell:39390,month_highest_buy:41900,buy_offers:58,sell_offers:21,
  day_average_sell:40966,day_average_buy:40097,day_sold:521,day_bought:1099,day_highest_sell:41499,day_lowest_sell:40295,
  day_highest_buy:40700,day_lowest_buy:1,total_immediate_profit:0,total_immediate_profit_info:''};
const MONTH = ['month_average_sell','month_average_buy','month_sold','month_bought','month_highest_sell','month_lowest_buy','month_lowest_sell','month_highest_buy'];
const DAY = ['day_average_sell','day_average_buy','day_sold','day_bought','day_highest_sell','day_lowest_sell','day_highest_buy','day_lowest_buy'];
const without = (row, keys) => ({...row, ...Object.fromEntries(keys.map(k => [k,-1]))});

test('server days open at the 10:00 Berlin save in CET and CEST', () => {
  assert.equal(serverDay(at('2026-01-15T08:59:59.999Z')), '2026-01-14');
  assert.equal(serverDay(at('2026-01-15T09:00:00Z')), '2026-01-15');
  assert.equal(serverDay(at('2026-07-15T07:59:59.999Z')), '2026-07-14');
  assert.equal(serverDay(at('2026-07-15T08:00:00Z')), '2026-07-15');
  // 2025-10-26: clocks go back at 03:00, so that save is at 09:00 UTC.
  assert.equal(serverDay(at('2025-10-26T08:30:00Z')), '2025-10-25');
  assert.equal(serverDay(at('2025-10-26T09:00:00Z')), '2025-10-26');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
});

test('a complete TibiaMarket row maps to Tibinance fields and reports the previous server day', () => {
  const {observation, daily, excluded} = fromTibiaMarket(full);
  assert.deepEqual(excluded, []);
  assert.deepEqual(observation, {capturedAtUtc:'2026-09-06T01:16:26.266Z', serverDay:'2026-09-05', sell:41900, buy:41103,
    statistics30d:{buy:{transactions:20512,highestPrice:41900,averagePrice:40432,lowestPrice:1},
      sell:{transactions:13336,highestPrice:56000,averagePrice:41373,lowestPrice:39390}}});
  assert.deepEqual(daily, {serverDay:'2026-09-04',
    sell:{transactions:521,highestPrice:41499,averagePrice:40966,lowestPrice:40295},
    buy:{transactions:1099,highestPrice:40700,averagePrice:40097,lowestPrice:1}});
  for (const k of ['active_traders','sell_offers','buy_offers','total_immediate_profit','is_full_data','id']) {
    assert.ok(!JSON.stringify(observation).includes(k));
  }
});

test('the -1 sentinel is absence, never a value', () => {
  const early = without({...full, is_full_data:false}, MONTH.filter(k => !['month_sold','month_bought'].includes(k)));
  assert.deepEqual(fromTibiaMarket(early).excluded, ['incompleteStatistics30d']);
  assert.equal(fromTibiaMarket(early).observation.statistics30d, undefined);
  const noBook = without(full, ['sell_offer','buy_offer',...MONTH]);
  const r = fromTibiaMarket(noBook);
  assert.equal(r.observation, null);
  assert.deepEqual(r.excluded, ['missingBestOffers','missingStatistics30d']);
  assert.equal(r.daily.serverDay, '2026-09-04');
  const nothing = fromTibiaMarket(without(noBook, DAY));
  assert.equal(nothing.observation, null);
  assert.equal(nothing.daily, null);
  assert.ok(nothing.excluded.includes('missingDailyStatistics'));
});

test('every book must be uncrossed with positive prices; the 80% floor is a screenshot heuristic', () => {
  // Universal: any source.
  assert.ok(validBook(41900, 41103));
  assert.ok(validBook(21688, 15018), 'a wide spread is still a valid book');
  assert.ok(!validBook(41900, 41900), 'crossed');
  assert.ok(!validBook(41900, -1), 'one side missing');
  assert.ok(!validBook(26880, 0), 'no Buy price');
  assert.ok(!validBook(41900.5, 41000), 'not a whole gold amount');
  // Screenshot captures only.
  assert.ok(plausibleCaptureSpread(41900, 41103));
  assert.ok(!plausibleCaptureSpread(1200000, 41235), 'a misread Sell price');
  assert.ok(!plausibleCaptureSpread(30000, 22501), 'Buy below 80% of Sell');
  const crossed = fromTibiaMarket({...full, buy_offer:42000});
  assert.deepEqual(crossed.excluded, ['invalidBestOffers']);
  assert.ok(crossed.observation.statistics30d, 'valid Statistics survive an invalid book');
  const zero = fromTibiaMarket({...full, day_sold:0, day_average_sell:0, day_lowest_sell:0});
  assert.deepEqual(zero.excluded, ['invalidDailySell'], 'zero transactions with a nonzero highest price');
  assert.equal(zero.daily.sell, undefined);
  assert.equal(zero.daily.buy.transactions, 1099);
  const quiet = fromTibiaMarket({...full, day_sold:0, day_average_sell:0, day_lowest_sell:0, day_highest_sell:0});
  assert.deepEqual(quiet.daily.sell, {transactions:0,highestPrice:0,averagePrice:0,lowestPrice:0});
});

test('captures keep their measured fields and nothing identifying', () => {
  const capture = {world:'Gentebra',type:'Optional PvP',battleye:'Yellow',sell:45279,sellVolume:57275,buy:43793,buyVolume:67475,
    capturedAt:'2024-10-10T21:23:56.092',hash:'h',viewType:'offers',processingVersion:6,goldSupply:2954360500,goldDemand:2613999500,
    sellTopAmount:30025,buyTopAmount:15675,captureDate:'2024-10-10',captureTimeZone:'America/Sao_Paulo',
    capturedAtUtc:'2024-10-11T00:23:56.092Z',offers:[{side:'sell',offerId:'x'}]};
  assert.deepEqual(fromCapture(capture).observation, {capturedAtUtc:'2024-10-11T00:23:56.092Z',serverDay:'2024-10-10',
    sell:45279,sellVolume:57275,sellTopAmount:30025,goldDemand:2613999500,buy:43793,buyVolume:67475,buyTopAmount:15675,goldSupply:2954360500});
  assert.deepEqual(fromCapture({...capture, sell:1200000}).excluded, ['implausibleCaptureSpread']);
  assert.deepEqual(fromCapture({...capture, buy:45279}).excluded, ['invalidBestOffers'], 'crossed');
  assert.deepEqual(fromCapture({...capture, capturedAtUtc:null}).excluded, ['unresolvedInstant']);
  const stats = {buy:{transactions:3651,highestPrice:46001,averagePrice:43744,lowestPrice:1},
    sell:{transactions:6386,highestPrice:47000,averagePrice:45283,lowestPrice:44000}};
  const statistics = {world:'Gentebra',viewType:'statistics',hash:'s',capturedAt:'2026-09-24T05:27:49.481',
    captureTimeZone:'America/Sao_Paulo',capturedAtUtc:'2026-09-24T08:27:49.481Z',statisticsReferenceDate:'2026-09-24',statistics30d:stats};
  assert.deepEqual(fromCapture(statistics).observation, {capturedAtUtc:'2026-09-24T08:27:49.481Z',serverDay:'2026-09-24',statistics30d:stats});
  assert.throws(() => fromCapture({...statistics, statisticsReferenceDate:'2026-09-23'}), /Reference date/);
});

test('merging never guesses: repeated days must agree and instants must be unique', () => {
  const a = {serverDay:'2026-01-02', sell:{transactions:1}}, b = {serverDay:'2026-01-02', sell:{transactions:2}};
  const c = {serverDay:'2026-01-01', sell:{transactions:3}};
  assert.deepEqual(mergeDaily([a, c, {...a}]), {daily:[c, a], conflicts:[]});
  assert.deepEqual(mergeDaily([a, b, {...a}, c]), {daily:[c], conflicts:['2026-01-02']});
  const x = {capturedAtUtc:'2026-01-02T00:00:00.000Z'}, y = {capturedAtUtc:'2026-01-01T00:00:00.000Z'};
  assert.deepEqual(mergeObservations([x, y]), [y, x]);
  assert.throws(() => mergeObservations([x, {...x}]), /Two observations/);
});

// A TibiaData world entry, as the world snapshot stores it.
const current = (name, extra = {}) => ({name, location:'Europe', pvp_type:'Open PvP', battleye_protected:true, battleye_date:'release', ...extra});
const registry = {active:[current('Antica', {battleye_date:'2017-08-29'})], retired:[]};

test('both sources merge in time order per world; inputs are checked', () => {
  const capture = {world:'Antica',type:'Open PvP',battleye:'Yellow',viewType:'offers',sell:41000,buy:40000,
    capturedAtUtc:'2026-09-21T12:00:00.000Z'};
  // The full row reports 2026-09-04; row i reports 2026-09-03 minus i days. Rows 0..28 complete
  // the 30-day window behind the full row's 30-day totals; row 29 falls outside it.
  const days = Array.from({length:30}, (_, i) => ({...full, time:full.time - (i + 1) * 86400, sell_offer:-1, buy_offer:-1,
    ...Object.fromEntries(MONTH.map(k => [k,-1])),
    day_sold:i === 28 ? 13336 - 521 - 444 * 28 : 444, day_bought:i === 28 ? 20512 - 1099 - 683 * 28 : 683}));
  const {index, worlds} = buildMarketHistory({captures:[capture], tibiaMarket:[{world:'Antica', rows:[full, ...days]}], registry, inputs:[]});
  const antica = worlds.get('Antica');
  assert.deepEqual(antica.observations.map(o => o.capturedAtUtc), ['2026-09-06T01:16:26.266Z','2026-09-21T12:00:00.000Z']);
  assert.equal(antica.dailyStatistics.length, 31);
  assert.deepEqual(index.dailyStatistics, {days:31, conflictingDaysDropped:0, checked30dTotals:1, matching30dTotals:1});
  assert.deepEqual(index.worlds[0].latestBestOffer, {capturedAtUtc:'2026-09-21T12:00:00.000Z',serverDay:'2026-09-21',sell:41000,buy:40000});
  assert.equal(index.worlds[0].type, 'Open PvP');
  assert.throws(() => buildMarketHistory({captures:[{...capture, world:'antica'}], tibiaMarket:[{world:'Antica', rows:[]}], registry, inputs:[]}), /spelled two ways/);
  assert.throws(() => buildMarketHistory({captures:[], tibiaMarket:[{world:'Antica', rows:[{...full, id:22721}]}], registry, inputs:[]}), /not Tibia Coin/);
  assert.equal(formatJson({a:[{b:1},{b:2}], c:{}}), '{\n  "a": [\n    {"b":1},\n    {"b":2}\n  ],\n  "c": {}\n}');
});

// Aethera, 2026-01-09, exactly as TibiaMarket.top returned it: a thin world (16 traders) whose
// best Buy Offer was 69% of its best Sell Offer. The spread is real and must survive.
const aethera = {"id":22118,"time":1767987802.7876985,"is_full_data":true,"buy_offer":15018,"sell_offer":21688,"month_average_sell":24820,
  "month_average_buy":20172,"month_sold":363,"month_bought":491,"active_traders":16,"month_highest_sell":37900,"month_lowest_buy":11111,
  "month_lowest_sell":17990,"month_highest_buy":30100,"buy_offers":16,"sell_offers":26,"day_average_sell":20660,"day_average_buy":15258,
  "day_sold":12,"day_bought":25,"day_highest_sell":21696,"day_lowest_sell":20050,"day_highest_buy":19500,"day_lowest_buy":15009,
  "total_immediate_profit":0,"total_immediate_profit_info":""};

test('a real wide TibiaMarket spread is kept; the same prices in a screenshot are set aside', async () => {
  assert.ok(aethera.buy_offer / aethera.sell_offer < 0.8);
  const {observation, excluded} = fromTibiaMarket(aethera);
  assert.deepEqual(excluded, []);
  assert.deepEqual([observation.capturedAtUtc, observation.serverDay, observation.sell, observation.buy], ['2026-01-09T19:43:22.788Z', '2026-01-09', 21688, 15018]);
  const capture = {world:'Aethera', viewType:'offers', sell:21688, buy:15018, capturedAtUtc:'2026-01-09T19:43:22.788Z'};
  assert.deepEqual(fromCapture(capture).excluded, ['implausibleCaptureSpread']);
  // And it reaches the published dataset.
  const file = JSON.parse(await readFile(new URL('../data/market-history/tibia-coin/worlds/aethera.json', import.meta.url), 'utf8'));
  const published = file.observations.find(o => o.capturedAtUtc === '2026-01-09T19:43:22.788Z');
  assert.deepEqual([published?.sell, published?.buy], [21688, 15018]);
});

// Antica, 2023-11-19, exactly as TibiaMarket.top returned it: a partial snapshot (is_full_data false)
// whose best Buy Offer of 1 gp contradicts its own 32 Buy Offers and 30-day average Buy trade of 39,262.
const anticaPartial = {"id":22118,"time":1700363788.8007727,"is_full_data":false,"buy_offer":1,"sell_offer":39285,"month_average_sell":40073,
  "month_average_buy":39262,"month_sold":7784,"month_bought":12398,"active_traders":8,"month_highest_sell":42288,"month_lowest_buy":1,
  "month_lowest_sell":37650,"month_highest_buy":41001,"buy_offers":32,"sell_offers":32,"day_average_sell":-1,"day_average_buy":-1,"day_sold":-1,
  "day_bought":-1,"day_highest_sell":-1,"day_lowest_sell":-1,"day_highest_buy":-1,"day_lowest_buy":-1,"total_immediate_profit":-1,"total_immediate_profit_info":""};
const anticaExclusion = {world:'Antica', time:1700363788.8007727, capturedAtUtc:'2023-11-19T03:16:28.801Z', sell:39285, buy:1, reason:'reviewed'};

test('a reviewed exclusion withholds one snapshot\'s best offers only; a real wide spread stays; stale entries fail', () => {
  const registry = {active:[current('Antica'), current('Aethera')], retired:[]};
  const tibiaMarket = [{world:'Antica', rows:[anticaPartial]}, {world:'Aethera', rows:[aethera]}];
  const build = (exclusions) => buildMarketHistory({captures:[], tibiaMarket, registry, inputs:[], exclusions});
  const {index, worlds} = build([anticaExclusion]);
  const [antica] = worlds.get('Antica').observations;
  assert.equal(antica.capturedAtUtc, '2023-11-19T03:16:28.801Z');
  assert.ok(!('sell' in antica) && !('buy' in antica), 'no best-offer pair is published');
  assert.equal(antica.statistics30d.buy.averagePrice, 39262, 'its 30-day Statistics remain');
  assert.deepEqual(index.worlds.find(w => w.world === 'Antica').bestOfferCloses, []);
  const [wide] = worlds.get('Aethera').observations;
  assert.deepEqual([wide.sell, wide.buy], [21688, 15018], 'the genuine wide spread is not an exclusion');
  assert.equal(index.conversion.tibiaMarket.notConverted.reviewedBestOfferExclusion, 1);
  // Without the entry the same snapshot would publish its pair: the exclusion, not a rule, withholds it.
  assert.deepEqual([build([]).worlds.get('Antica').observations[0].buy], [1]);
  assert.throws(() => build([{...anticaExclusion, buy:2}]), /no longer matches its source row/);
  assert.throws(() => build([anticaExclusion, {...anticaExclusion, time:1700363788.9}]), /matches no source row/);
});

test('published: the Aethera wide spread is plotted, the reviewed Antica snapshots are not, the raw rows are untouched', async () => {
  const read = async path => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), 'utf8'));
  const {exclusions} = await read('data/market-history/inputs/best-offer-exclusions.json');
  assert.equal(exclusions.length, 5);
  for (const x of exclusions) {
    assert.equal(x.world, 'Antica');
    assert.match(x.reason, /is_full_data: false/);
    assert.ok(Number.isFinite(x.time) && x.capturedAtUtc && Number.isSafeInteger(x.sell) && Number.isSafeInteger(x.buy));
  }
  const antica = await read('data/market-history/tibia-coin/worlds/antica.json');
  for (const x of exclusions) {
    const o = antica.observations.find(o => o.capturedAtUtc === x.capturedAtUtc);
    assert.ok(!o || !('sell' in o), `${x.capturedAtUtc} publishes no best offers`);
  }
  assert.ok(antica.observations.find(o => o.capturedAtUtc === anticaExclusion.capturedAtUtc).statistics30d, 'the 2023-11-19 snapshot keeps its 30-day Statistics');
  const aethera = await read('data/market-history/tibia-coin/worlds/aethera.json');
  assert.deepEqual(aethera.observations.filter(o => o.capturedAtUtc === '2026-01-09T19:43:22.788Z').map(o => [o.sell, o.buy]), [[21688, 15018]]);
  const raw = (await read('reports/tc-cycle/inputs/api/antica.json')).find(r => r.time === anticaPartial.time);
  assert.deepEqual(raw, anticaPartial, 'the frozen source row is unchanged');
});

test('every current world is listed; retired worlds keep separate histories; copies must agree', () => {
  const later = {...full, time:full.time + 86400, sell_offer:42000, buy_offer:41200};
  const ambra = {...full, time:Date.parse('2025-11-02T12:00:00Z') / 1000};
  const registry = {active:[current('Antica', {battleye_date:'2017-08-29'}), current('Jinxibra', {pvp_type:'Retro Open PvP', location:'South America'}),
      current('Sombra', {battleye_protected:false})],
    retired:[{world:'Ambra', offline:'2025-11-06', mergedInto:'Sombra', type:'Retro Open PvP', location:'Brazil', battleye:'Green'}]};
  // An older and a newer copy of Antica: the shared row collapses, the newer one adds a day.
  // The same snapshot stored twice 0.1 ms apart is one row too.
  const tibiaMarket = [{world:'Antica', rows:[full]}, {world:'Antica', rows:[full, later, {...later, time:later.time + 0.0001}]}, {world:'Ambra', rows:[ambra]}];
  const {index, worlds} = buildMarketHistory({captures:[], tibiaMarket, registry, inputs:[]});
  const of = name => index.worlds.find(w => w.world === name);
  assert.equal(index.conversion.tibiaMarket.rows, 3);
  assert.equal(index.conversion.tibiaMarket.duplicateRows, 2);
  assert.equal(worlds.get('Antica').observations.length, 2);
  assert.deepEqual([of('Antica').status, of('Antica').battleye, of('Antica').type], ['active', 'Yellow', 'Open PvP']);
  assert.deepEqual([of('Sombra').status, of('Sombra').battleye, of('Sombra').formedFrom], ['active', 'Off', ['Ambra']]);
  assert.deepEqual([of('Ambra').status, of('Ambra').offline, of('Ambra').mergedInto, of('Ambra').battleye], ['retired', '2025-11-06', 'Sombra', 'Green']);
  assert.equal(worlds.get('Sombra').observations.length, 0, 'a successor never absorbs its predecessor');
  assert.deepEqual([of('Jinxibra').observations, of('Jinxibra').bestOfferCloses, of('Jinxibra').latestBestOffer], [0, [], undefined]);
  assert.deepEqual(worlds.get('Jinxibra'), {asset:'tibia-coin', world:'Jinxibra', observations:[], dailyStatistics:[]});
  const build = changes => () => buildMarketHistory({captures:[], tibiaMarket, registry, inputs:[], ...changes});
  assert.throws(build({tibiaMarket:[...tibiaMarket, {world:'Antica', rows:[{...later, sell_offer:42001}]}]}), /two different rows/);
  assert.throws(build({tibiaMarket:[...tibiaMarket, {world:'Yonabra', rows:[later]}]}), /neither a current world nor a known retired one/);
  assert.throws(build({registry:{...registry, retired:[{...registry.retired[0], offline:'2025-11-01'}]}}), /data after it went offline/);
  assert.throws(build({registry:{...registry, retired:[{...registry.retired[0], mergedInto:'Nowhere'}]}}), /not a current world/);
});

test('the committed dataset is a current build of the committed inputs', async () => {
  assert.deepEqual(await staleFiles(), []);
});

test('every canonical Offers quote is in the history unchanged', async () => {
  const captures = JSON.parse(await readFile(new URL('../data/observations.json', import.meta.url), 'utf8'));
  const index = JSON.parse(await readFile(new URL('../data/market-history/tibia-coin/index.json', import.meta.url), 'utf8'));
  const files = new Map();
  for (const w of index.worlds) files.set(w.world, JSON.parse(await readFile(new URL(`../data/market-history/tibia-coin/${w.file}`, import.meta.url), 'utf8')));
  let found = 0;
  for (const c of captures) {
    const o = files.get(c.world).observations.find(x => x.capturedAtUtc === c.capturedAtUtc);
    if (c.viewType === 'statistics') { assert.deepEqual(o.statistics30d, c.statistics30d); found++; continue; }
    if (!validBook(c.sell, c.buy) || !plausibleCaptureSpread(c.sell, c.buy)) { assert.equal(o, undefined); continue; }
    assert.deepEqual([o.sell, o.buy, o.sellVolume, o.buyVolume, o.goldDemand, o.goldSupply], [c.sell, c.buy, c.sellVolume, c.buyVolume, c.goldDemand, c.goldSupply]);
    found++;
  }
  assert.equal(found, index.conversion.tibinance.observations);
  for (const data of files.values()) {
    for (const o of data.observations) assert.equal(o.serverDay, serverDay(Date.parse(o.capturedAtUtc)));
  }
});
