import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseStatisticsText,validatedStatistics,statisticsIssues,statisticsReferenceDate,captureInstant,statisticsObservations} from '../js/statistics.js';
import {parseFilename,compareCaptureTimes} from '../js/filename.js';
import {ingestScreenshot,STAGES,INGESTION_VERSION} from '../js/ingestion.js';
import {toRecord} from '../js/store.js';

export const text = `Statistics:
Buy Offers:
Number of Transactions: 3396
Highest Price: 49,985 gold
Average Price: 44,155 gold
Lowest Price: 1 gold
Sell Offers:
Number of Transactions: 6082
Highest Price: 49,998 gold
Average Price: 45,942 gold
Lowest Price: 44,000 gold`;
const stats = () => validatedStatistics(parseStatisticsText(text));
const source = {name:'2026-10-02_003637332_Synthetic Name_Hotkey.png'};
function services(overrides={}) {
  return {sha256:async()=> 'a'.repeat(64),createBitmap:async()=>({close(){}}),
    verifyMarket:async()=>({viewType:'statistics'}),verifyTibiaCoins:async()=>{},
    lookupWorld:async()=> 'Antica',worldInfo:async()=>({world:'Antica',type:'Open PvP',battleye:'Yellow'}),
    extractMarketOffers:async()=>{throw Error('Details must not extract offers');},
    extractMarketStatistics:async()=>stats(),...overrides};
}
test('eight labelled fields retain raw Buy/Sell counters without deriving TC quantity',()=>{
  const s=stats();
  assert.deepEqual(s.buy,{transactions:3396,highestPrice:49985,averagePrice:44155,lowestPrice:1});
  assert.deepEqual(s.sell,{transactions:6082,highestPrice:49998,averagePrice:45942,lowestPrice:44000});
  const low=structuredClone(s); low.buy.averagePrice=low.sell.averagePrice+100;
  assert.deepEqual(statisticsIssues(low),[],'Historical side averages can cross');
});
test('verified Statistics panes retain labelled values when the cropped title is misread',()=>{
  const damaged = text.replace('Statistics:', 'SLatIstICcS:');
  assert.ok(statisticsIssues(parseStatisticsText(damaged)).length, 'Unverified text still requires its title');
  assert.deepEqual(validatedStatistics(parseStatisticsText(damaged,{verifiedBlock:true})),stats());
  assert.deepEqual(validatedStatistics(parseStatisticsText(text.split('\n').slice(1).join('\n'),{verifiedBlock:true})),stats());
  const unread=damaged.replace('3396','3O96');
  const partial=parseStatisticsText(unread,{verifiedBlock:true});
  assert.equal(partial.buy.transactions,null);
  assert.equal(partial.sell.transactions,6082);
  assert.match(statisticsIssues(partial)[0].reason,/extraction incomplete.*Number of Transactions/);
});
test('missing, partial, malformed, duplicate, inconsistent and unsafe readings require review',()=>{
  for(const t of ['',text.replace('Statistics:','Details:'),text.replace('Lowest Price: 1 gold',''),
    text.replace('49,985','49,98'),text.replace('3396','3O96'),text.replace('44,155','50,000'),
    text.replace('3396','-1'),text.replace('3396','9007199254740992'),text+'\nLowest Price: 44,000 gold']){
    assert.ok(statisticsIssues(parseStatisticsText(t)).length);
  }
  const s=stats(); s.buy.tcVolume=1;
  assert.deepEqual(validatedStatistics(s),stats(), 'legacy derived fields are ignored');
  const zero=structuredClone(s); zero.buy={transactions:0,highestPrice:0,averagePrice:0,lowestPrice:0};
  assert.equal(statisticsIssues(zero).length,0);
});
test('each side validates independently, without live crossed-book checks',()=>{
  const s=stats();s.buy.lowestPrice=60000;
  assert.deepEqual(statisticsIssues(s).map(i=>i.field),['statistics30d.buy']);
  s.sell.transactions=-1;
  assert.deepEqual(statisticsIssues(s).map(i=>i.field),['statistics30d.buy','statistics30d.sell']);
});
test('filename clock preserves fractional seconds and rejects invalid calendar dates',()=>{
  assert.equal(parseFilename(source.name).capturedAt,'2026-10-02T00:36:37.332');
  assert.throws(()=>parseFilename(source.name.replace('2026-10-02','2026-02-30')));
});
test('archive clocks sort below millisecond precision without lexical suffix shortcuts',()=>{
  const clocks=['2026-10-02T00:36:37.1','2026-10-02T00:36:37.0999999999',
    '2026-10-02T00:36:37.1000000001','2026-10-02T00:36:37'];
  assert.deepEqual([...clocks].sort(compareCaptureTimes),[clocks[3],clocks[1],clocks[0],clocks[2]]);
  assert.equal(compareCaptureTimes(clocks[0],clocks[0]+'0'),0);
});
test('local IANA timezone resolves exact capture instant and CET/CEST 10:00 dates',()=>{
  const cases=[['2026-01-02T05:59:59','2026-01-01'],['2026-01-02T06:00:00','2026-01-02'],
    ['2026-07-02T04:59:59','2026-07-01'],['2026-07-02T05:00:00','2026-07-02'],
    ['2026-03-29T04:59:59','2026-03-28'],['2026-03-29T05:00:00','2026-03-29'],
    ['2026-10-25T05:59:59','2026-10-24'],['2026-10-25T06:00:00','2026-10-25']];
  for(const [t,d] of cases) assert.equal(statisticsReferenceDate(t,'America/Sao_Paulo'),d,t);
  assert.equal(new Date(captureInstant('2026-10-02T00:36:37.332','America/Sao_Paulo')).toISOString(),'2026-10-02T03:36:37.332Z');
  assert.equal(statisticsReferenceDate('2026-10-02T00:36:37.332','America/Sao_Paulo'),'2026-10-01');
});
test('DST gaps and repeated local clocks are unresolved, never guessed',()=>{
  for(const t of ['2026-03-29T02:30:00','2026-10-25T02:30:00']) assert.equal(captureInstant(t,'Europe/Berlin'),null);
  assert.equal(captureInstant('2026-03-29T03:30:00','Europe/Berlin'),Date.parse('2026-03-29T01:30:00Z'));
  assert.equal(statisticsReferenceDate('2026-10-02T12:00:00',null),null);
});
test('Statistics reference is a local calendar anchor, including after Berlin midnight',()=>{
  for (const [local,zone,expected] of [
    ['2026-10-02T04:50:00','America/Sao_Paulo','2026-10-01'],
    ['2026-10-02T05:00:00','America/Sao_Paulo','2026-10-02'],
    ['2026-10-02T23:50:00','America/Sao_Paulo','2026-10-02'],
    ['2026-10-02T00:30:00','Pacific/Pago_Pago','2026-10-01'],
    ['2026-10-02T21:59:59','Pacific/Pago_Pago','2026-10-02'],
    ['2026-10-02T22:00:00','Pacific/Kiritimati','2026-10-02'],
    ['2026-10-02T21:59:59','Pacific/Kiritimati','2026-10-01']
  ]) assert.equal(statisticsReferenceDate(local,zone),expected,`${local} ${zone}`);
});
test('Offers capture and Ends At resolve in the same environment zone with no Statistics date',async()=>{
  const rows = {sell:[{amount:25,price:50000,total:1250000,endsAt:'2026-10-25T03:30:00'}],
    buy:[{amount:25,price:49000,total:1225000,endsAt:'2026-07-02T12:00:00'}]};
  const r=await ingestScreenshot(source,{captureTimeZone:'Europe/Berlin'},services({
    verifyMarket:async()=>({viewType:'offers'}),extractMarketOffers:async()=>rows}));
  assert.equal(r.status,'ready');
  const saved=toRecord(r.capture);
  assert.equal(saved.capturedAtUtc,'2026-10-01T22:36:37.332Z');
  assert.equal(saved.statisticsReferenceDate,undefined);
  assert.equal(saved.serverSaveDate,undefined);
  assert.equal(saved.offers[0].endsAt,'2026-10-25T03:30:00');
  assert.equal(saved.offers[0].endsAtUtc,'2026-10-25T02:30:00.000Z');
  assert.equal(saved.offers[1].endsAtUtc,'2026-07-02T10:00:00.000Z');
  rows.sell[0].endsAt='2026-10-25T02:30:00';
  const ambiguous=await ingestScreenshot(source,{captureTimeZone:'Europe/Berlin'},services({
    verifyMarket:async()=>({viewType:'offers'}),extractMarketOffers:async()=>rows}));
  assert.equal(ambiguous.capture.offers[0].endsAtUtc,null);
  assert.equal(ambiguous.capture.offers[0].endsAt,'2026-10-25T02:30:00');
});
test('Details ingestion skips offer gates and persists a private-data-free Statistics capture',async()=>{
  const r=await ingestScreenshot(source,{captureTimeZone:'America/Sao_Paulo'},services());
  assert.equal(r.status,'ready');
  assert.deepEqual(r.attemptedStages,STAGES.filter(s=>s!=='extraction'));
  const saved=toRecord({...r.capture,filename:'private',statistics30d:{...r.capture.statistics30d,private:'private'}});
  assert.equal(saved.capturedAtUtc,'2026-10-02T03:36:37.332Z');
  assert.equal(saved.statisticsReferenceDate,'2026-10-01');
  assert.equal(statisticsObservations([saved])[0].date,'2026-10-01','History uses Statistics reference date');
  assert.equal(statisticsObservations([saved],{bucket:'capture'})[0].date,'2026-10-02');
  assert.equal(saved.processingVersion,INGESTION_VERSION);
  assert.equal(saved.sell,undefined); assert.equal(saved.offers,undefined);
  assert.equal(JSON.stringify(saved).includes('private'),false);
});
test('missing and unreadable Details data stays editable review evidence, without fabricated statistics',async()=>{
  for(const value of [null,{buy:stats().buy},'throw']){
    const r=await ingestScreenshot(source,{},services({extractMarketStatistics:async()=>{if(value==='throw')throw Error('private OCR error');return value;}}));
    assert.equal(r.status,'needs_review'); assert.equal(r.capture,undefined);assert.equal(r.stages.statistics,false);
    assert.equal(r.attemptedStages.includes('validation'),false);
    assert.ok(r.issues.every(i=>/Statistics extraction incomplete/.test(i.reason)));
    assert.equal(r.analysis.warn.some(w=>/all four values|private OCR error/.test(w)),false);
    if(value?.buy)assert.equal(r.statistics30d.buy.transactions,3396);
  }
});
test('fully extracted but inconsistent Statistics reach value validation',async()=>{
  const value=stats();value.buy.averagePrice=value.buy.highestPrice+1;
  const r=await ingestScreenshot(source,{},services({extractMarketStatistics:async()=>value}));
  assert.equal(r.status,'needs_review');assert.equal(r.stages.statistics,true);
  assert.equal(r.stages.validation,false);
  assert.equal(r.issues.length,1);assert.match(r.issues[0].reason,/inconsistent/);
});
test('browser environment timezone is the default and existing context survives reprocessing',async()=>{
  const r=await ingestScreenshot(source,{},services());
  assert.equal(r.capture.captureTimeZone,Intl.DateTimeFormat().resolvedOptions().timeZone);
  const old={...r.capture,capturedAt:'2020-01-01T12:00:00',captureTimeZone:'Europe/Berlin'};
  const again=await ingestScreenshot(source,{reprocess:true,getExisting:async()=>old},services({lookupWorld:async()=>{throw Error();}}));
  assert.equal(again.capture.capturedAt,old.capturedAt); assert.equal(again.capture.captureTimeZone,old.captureTimeZone);
});
test('old Offers records import unchanged; rolling report samples do not sum overlapping windows',async()=>{
  const old={world:'Antica',type:'Open PvP',battleye:'Yellow',hash:'old',capturedAt:'2026-10-01T12:00:00',sell:50000,buy:49000,sellVolume:25,buyVolume:25};
  assert.equal(toRecord(old).statistics30d,undefined);
  const r=await ingestScreenshot(source,{captureTimeZone:'America/Sao_Paulo'},services());
  const c=r.capture;
  const later={...c,hash:'later',capturedAt:'2026-10-03T00:00:00',capturedAtUtc:'2026-10-03T03:00:00.000Z',statistics30d:stats()};
  later.statistics30d.buy.averagePrice=45000;
  const rows=statisticsObservations([later,c,old,c]);
  assert.equal(rows.length,4);assert.equal(rows[2].transactions,3396);assert.ok(!('tcVolume' in rows[2]));
  assert.ok(rows[2].averageChangePct>0);assert.equal(rows[2].quoteVsAveragePct,null);
  assert.equal(statisticsObservations([{...c,captureTimeZone:null}],{bucket:'reference'}).length,0);
});

test('Statistics quote comparisons use resolved context from the same world and never future quotes',async()=>{
  const {capture}=await ingestScreenshot(source,{captureTimeZone:'America/Sao_Paulo'},services());
  const book=(world,t,sell)=>({hash:world+t,world,capturedAt:t.slice(0,19),capturedAtUtc:t,sell,buy:sell-1000});
  const rows=statisticsObservations([book('Antica','2026-10-02T04:00:00.000Z',99000),capture,
    book('Antica','2026-10-02T03:00:00.000Z',47000),book('Secura','2026-10-02T03:30:00.000Z',80000)]);
  assert.equal(rows[1].quoteCapturedAt,'2026-10-02T03:00:00');
  assert.equal(rows[1].quoteVsAveragePct,(47000/45942-1)*100);
});
