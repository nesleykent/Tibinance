import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {latestDailyStatistics,serverDay,addDays,bestOfferCloses} from '../js/market-history.js';
import {marketValues,statisticsAt,dayGrid} from '../js/market-series.js';
import {LAYERS} from '../js/market-chart.js';
const fields=['transactions','highestPrice','averagePrice','lowestPrice'];
const side={transactions:2,highestPrice:50000,averagePrice:45000,lowestPrice:40000};
test('daily selection uses reference period and timestamp, independently per side, never source precedence',()=>{
 const reports=[{serverDay:'2026-10-02',capturedAtUtc:'2026-10-03T12:00:00Z',source:'tibiamarket',buy:side,sell:side},
 {serverDay:'2026-10-02',capturedAtUtc:'2026-10-03T13:00:00Z',source:'screenshot',buy:{...side,transactions:3}}];
 const result=latestDailyStatistics(reports)[0];
 assert.equal(result.buy.transactions,3);assert.equal(result.sell.transactions,2);
 assert.equal(result.provenance.buy.source,'screenshot');assert.equal(result.provenance.sell.source,'tibiamarket');
 assert.deepEqual(latestDailyStatistics([...reports].reverse()),[result]);
 assert.deepEqual(latestDailyStatistics(reports.map(r=>({...r,buy:r.buy?{...r.buy,tcVolume:999999}:undefined}))),[result]);
 assert.equal(latestDailyStatistics([{...reports[0],capturedAtUtc:'2026-10-03T14:00:00+02:00'},reports[1]])[0].buy.transactions,3);
 assert.throws(()=>latestDailyStatistics([reports[0],{...reports[0],source:'screenshot',buy:{...side,transactions:3}}]),/Ambiguous/);
});
test('all world histories: chart bars, legend, averages and prices trace to canonical observations',async()=>{
 const dir=new URL('../data/market-history/tibia-coin/worlds/',import.meta.url);
 const index=JSON.parse(await readFile(new URL('../data/market-history/tibia-coin/index.json',import.meta.url)));
 const files=(await readdir(dir)).filter(f=>f.endsWith('.json'));
 assert.equal(files.length,index.worlds.length);assert.equal(files.length,116);
 const activity=LAYERS.find(l=>l.id==='activity'),average=LAYERS.find(l=>l.id==='daily-average'),price=LAYERS.find(l=>l.id==='best-offer');
 for(const file of files){
  const data=JSON.parse(await readFile(new URL(file,dir)));const view=marketValues(data);
  assert.deepEqual(view.daily,data.dailyStatistics,`${data.world}: generated projection differs from loader`);
  assert.equal(view.daily.length,new Set(data.dailyStatisticsObservations.map(d=>d.serverDay)).size);
  assert.deepEqual(view.closes,bestOfferCloses(data.observations));
  for(const o of data.observations)assert.equal(o.serverDay,serverDay(Date.parse(o.capturedAtUtc)));
  for(const r of data.dailyStatisticsObservations)assert.equal(r.serverDay,addDays(serverDay(Date.parse(r.capturedAtUtc)),-1));
  const days=[...view.daily.map(d=>d.serverDay),...view.closes.map(d=>d.serverDay)].sort();
  view.grid=days.length?dayGrid(days[0],days.at(-1)):[];
  for(const s of ['buy','sell']){
   let bars,averages,prices;
   const recorder=setter=>({applyOptions(){},setData(p){setter(p);}});
   activity.draw(recorder(p=>bars=p),view,s,{[s]:'#fff'});
   average.draw({solid:recorder(p=>averages=p),dotted:recorder(()=>{})},view,s);
   price.draw({solid:recorder(()=>{}),dotted:recorder(()=>{}),points:recorder(p=>prices=p)},view,s,{[s]:'#fff'});
   for(const bar of bars){
    const stats=statisticsAt(view,bar.time,s);
    assert.equal(bar.value,stats?.transactions,`${data.world}/${bar.time}/${s}: histogram/legend mismatch`);
    if(stats){
     const source=data.dailyStatisticsObservations.find(r=>r.serverDay===bar.time&&r.capturedAtUtc===view.dailyByDay.get(bar.time).provenance[s].capturedAtUtc&&r[s]);
     assert.ok(source);for(const k of fields)assert.equal(stats[k],source[s][k]);
     assert.ok(!('tcVolume' in stats));
    }
   }
   const expected=view.daily.filter(d=>d[s]?.transactions>0);
   assert.equal(averages.length,expected.length);
   for(let i=0;i<averages.length;i++)assert.equal(averages[i].value,expected[i][s].averagePrice);
   for(const p of prices){
    const candidates=data.observations.filter(o=>o.serverDay===p.time&&o.sell!==undefined);
    assert.equal(p.value,candidates.at(-1)[s]);
   }
  }
 }
});
test('Gentebra recent rolling Statistics remain visible source evidence without becoming daily values',async()=>{
 const data=JSON.parse(await readFile(new URL('../data/market-history/tibia-coin/worlds/gentebra.json',import.meta.url)));
 const view=marketValues(data),day='2026-10-03';
 assert.equal(view.closes.find(c=>c.serverDay===day).sell,46794);
 assert.ok(data.observations.some(o=>o.serverDay===day&&o.statistics30d?.sell.transactions===6137));
 assert.equal(statisticsAt(view,day,'sell'),undefined);
});
