// Diagnostic only: never supplies daily chart values or modifies source data.
import {readFile, readdir, writeFile} from 'node:fs/promises';
import {addDays, latestDailyStatistics} from '../js/market-history.js';
const root = new URL('../data/market-history/tibia-coin/worlds/', import.meta.url);
const result = {formula: 'new interval activity = later rolling counter - earlier rolling counter + expired daily counters',
  assumptions: ['Each rolling reference D covers completed days D-30 through D-1.',
    'Counters for the shared portion of the two windows have not been revised.'],
  worlds: 0, candidateSidePairs: 0, calculableSideIntervals: 0, independentlyChecked: 0,
  mismatches: [], missingSingleDays: [], gentebraRecent: []};
for (const file of (await readdir(root)).filter(f => f.endsWith('.json')).sort()) {
  const data = JSON.parse(await readFile(new URL(file, root)));
  result.worlds++;
  const daily = new Map(latestDailyStatistics(data.dailyStatisticsObservations).map(d => [d.serverDay, d]));
  const latest = new Map();
  for (const o of data.observations.filter(o => o.statistics30d).sort((a,b) => Date.parse(a.capturedAtUtc)-Date.parse(b.capturedAtUtc))) latest.set(o.serverDay, o);
  const rows = [...latest.values()].sort((a,b) => a.serverDay.localeCompare(b.serverDay));
  for (let i=1; i<rows.length; i++) {
    const a=rows[i-1], b=rows[i], days=(Date.parse(b.serverDay)-Date.parse(a.serverDay))/864e5;
    if (days>30) continue;
    for (const side of ['buy','sell']) {
      result.candidateSidePairs++;
      let expired=0, observed=0, oldComplete=true, newComplete=true;
      for (let j=0; j<days; j++) {
        const old=daily.get(addDays(a.serverDay,j-30))?.[side]?.transactions;
        const current=daily.get(addDays(a.serverDay,j))?.[side]?.transactions;
        if (old===undefined) oldComplete=false; else expired+=old;
        if (current===undefined) newComplete=false; else observed+=current;
      }
      if (!oldComplete) continue;
      result.calculableSideIntervals++;
      const calculated=b.statistics30d[side].transactions-a.statistics30d[side].transactions+expired;
      const record={world:data.world,side,firstDay:a.serverDay,lastDay:addDays(b.serverDay,-1),days,
        earlier:{timestamp:a.capturedAtUtc,source:a.source,counter:a.statistics30d[side].transactions},
        later:{timestamp:b.capturedAtUtc,source:b.source,counter:b.statistics30d[side].transactions},
        expired,calculated,observed:newComplete?observed:null};
      if (newComplete) {
        result.independentlyChecked++;
        if (calculated!==observed) result.mismatches.push(record);
      } else if (days===1) result.missingSingleDays.push(record);
      if (data.world==='Gentebra' && b.serverDay>='2026-09-20') result.gentebraRecent.push(record);
    }
  }
}
const output=JSON.stringify(result,null,2)+'\n';
const target=new URL('../docs/rolling-activity-calculation.json',import.meta.url);
if (process.argv.includes('--write')) await writeFile(target,output);
if (process.argv.includes('--check') && await readFile(target,'utf8')!==output) throw new Error('Rolling calculation is stale');
console.log(output);
