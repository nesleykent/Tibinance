import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validatedStatistics, statisticsObservations, STATISTICS_CSV_HEADERS} from '../js/statistics.js';
import {analyse} from '../js/validation.js';
import {LAYERS} from '../js/market-chart.js';
import {fromCapture, fromTibiaMarket, mergeObservations} from '../js/market-history.js';
const side = {transactions:2,highestPrice:50000,averagePrice:45000,lowestPrice:40000};
test('both acquisition methods use identical canonical Statistics and retain independent provenance',()=>{
 const time=Date.parse('2026-10-04T02:15:10.710Z')/1000;
 const raw={time,sell_offer:-1,buy_offer:-1};
 for(const s of ['buy','sell']){
  Object.assign(raw,{[`month_${s==='buy'?'bought':'sold'}`]:side.transactions,
   [`month_highest_${s}`]:side.highestPrice,[`month_average_${s}`]:side.averagePrice,[`month_lowest_${s}`]:side.lowestPrice});
  for(const k of ['average','highest','lowest'])raw[`day_${k}_${s}`]=-1;
  raw[`day_${s==='buy'?'bought':'sold'}`]=-1;
 }
 const tracker=fromTibiaMarket(raw).observation;
 const screenshot=fromCapture({capturedAtUtc:tracker.capturedAtUtc,statisticsReferenceDate:tracker.serverDay,
  viewType:'statistics',statistics30d:{buy:side,sell:side}}).observation;
 assert.deepEqual(tracker.statistics30d,screenshot.statistics30d);
 assert.equal(tracker.sourceTimestamp,time);
 assert.deepEqual(mergeObservations([tracker,screenshot]).map(o=>o.source),['screenshot','tibiamarket']);
 assert.equal(mergeObservations([tracker,{...screenshot,statistics30d:{buy:{...side,averagePrice:45001},sell:side}}]).length,2);
});
test('legacy TC volume is ignored and raw counters survive normalization and rolling report exports',()=>{
 const legacy={buy:{...side,tcVolume:275},sell:{...side,transactions:10,tcVolume:250}};
 assert.deepEqual(validatedStatistics(legacy),{buy:side,sell:{...side,transactions:10}});
 const rows=statisticsObservations([{world:'Antica',hash:'a',capturedAt:'2026-10-04T00:00:00',capturedAtUtc:'2026-10-04T03:00:00Z',captureTimeZone:'America/Sao_Paulo',statistics30d:legacy}]);
 assert.deepEqual(rows.map(r=>r.transactions),[2,10]);
 assert.ok(rows.every(r=>!('tcVolume' in r)));
 assert.ok(STATISTICS_CSV_HEADERS.every(h=>!h.includes('lots')&&!h.includes('tcVolume')));
});
test('daily histogram uses raw counts and leaves rolling-only days empty',()=>{
 const activity=LAYERS.find(l=>l.keys('buy',{buy:'#fff'}).some(k=>k.mark==='bar'));
 let points;const series={applyOptions(){},setData(p){points=p;}};
 activity.draw(series,{grid:['2026-10-01','2026-10-02'],dailyByDay:new Map([['2026-10-01',{buy:side}]]),observations:[{serverDay:'2026-10-02',statistics30d:{buy:side,sell:side}}]},'buy',{buy:'#fff'});
 assert.deepEqual(points,[{time:'2026-10-01',value:2},{time:'2026-10-02'}]);
 assert.equal(activity.keys('buy',{buy:'#fff'})[0].label,'Transactions (count)');
});
test('captured depth sums actual TC Amount independently on each side',()=>{
 const offer=(amount,price)=>({amount,price,total:amount*price,endsAt:'2026-11-01T12:00:00'});
 const result=analyse({world:{world:'Antica'},capturedAt:'2026-10-04T12:00:00',rows:{sell:[offer(25,50000),offer(250,51000)],buy:[offer(80,49000)]}});
 assert.equal(result.ok,true);assert.equal(result.sellVolume,275);assert.equal(result.buyVolume,80);
 assert.equal(result.sellTopAmount,25);assert.equal(result.goldDemand,14000000);assert.equal(result.goldSupply,3920000);
});
test('published Statistics contain counters and prices, without a derived TC quantity',async()=>{
 const captures=JSON.parse(await readFile(new URL('../data/observations.json',import.meta.url)));
 for(const c of captures.filter(c=>c.statistics30d))for(const s of ['buy','sell'])assert.deepEqual(Object.keys(c.statistics30d[s]).sort(),['averagePrice','highestPrice','lowestPrice','transactions']);
 const antica=JSON.parse(await readFile(new URL('../data/market-history/tibia-coin/worlds/antica.json',import.meta.url)));
 for(const d of antica.dailyStatistics)for(const s of ['buy','sell'])if(d[s])assert.ok(!('tcVolume' in d[s]));
 const review=await readFile(new URL('../data/market-update-review.json',import.meta.url),'utf8');
 assert.doesNotMatch(review,/"tcVolume"/);
});

test('visible Statistics labels and captured depth cannot regress to TC-volume claims',async()=>{
 const app=await readFile(new URL('../js/app.js',import.meta.url),'utf8');
 const report=await readFile(new URL('../reports/tc-cycle/report.js',import.meta.url),'utf8');
 assert.doesNotMatch(app,/TC Volume|25-TC lots/);
 assert.doesNotMatch(report,/TC Volume|25-TC lots/);
 assert.match(app,/statistics30d: cleanStatistics\(c.statistics30d\)/);
 assert.match(app,/Captured Sell Depth/);assert.match(app,/Captured Buy Depth/);
 assert.doesNotMatch(report,/"Captured Amount \(TC\)": "Total Amount"/);
 assert.match(report,/"Sell Offers; Captured Amount \(TC\)": "Sell Offers: Captured Amount \(TC\)"/);
 assert.match(report,/"Buy Offers; Captured Amount \(TC\)": "Buy Offers: Captured Amount \(TC\)"/);
});
