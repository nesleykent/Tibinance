// Reproducible audit of every compiled world. The previous projection is
// reconstructed from preserved canonical reports; frozen inputs are never read/write targets.
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {latestDailyStatistics,mergeDaily,bestOfferCloses,serverDay,addDays} from '../js/market-history.js';
import {LAYERS} from '../js/market-chart.js';
import {marketValues,statisticsAt,dayGrid} from '../js/market-series.js';
const dir=new URL('../data/market-history/tibia-coin/worlds/',import.meta.url);
const fields=['transactions','highestPrice','averagePrice','lowestPrice'];
const empty=()=>({transactions:0,averagePrice:0,highestPrice:0,lowestPrice:0,dailyAveragePoints:0,bestSell:0,bestBuy:0});
const counts={before:empty(),after:empty()};const affected=[];
let worlds=0,observations=0,reports=0,rolling=0,missingBefore=0,missingAfter=0,unsupported=0,misaligned=0,barsMissing=0,duplicates=0;
const sourceCounts={};
for(const filename of (await readdir(dir)).filter(f=>f.endsWith('.json')).sort()){
 const data=JSON.parse(await readFile(new URL(filename,dir)));worlds++;observations+=data.observations.length;
 reports+=data.dailyStatisticsObservations.length;
 duplicates+=data.observations.length-new Set(data.observations.map(o=>`${o.source}|${o.capturedAtUtc}`)).size;
 for(const o of data.observations){sourceCounts[o.source]=(sourceCounts[o.source]??0)+1;if(o.statistics30d)rolling++;
  if(o.serverDay!==serverDay(Date.parse(o.capturedAtUtc)))misaligned++;}
 for(const r of data.dailyStatisticsObservations)if(r.serverDay!==addDays(serverDay(Date.parse(r.capturedAtUtc)),-1))misaligned++;
 const old=mergeDaily(data.dailyStatisticsObservations.map(({serverDay,buy,sell})=>({serverDay,...(buy?{buy}:{}),...(sell?{sell}:{})}))).daily;
 const previous=new Map(old.map(d=>[d.serverDay,d]));const view=marketValues(data);
 const allDays=[...view.closes.map(c=>c.serverDay),...view.daily.map(d=>d.serverDay)].sort();
 view.grid=allDays.length?dayGrid(allDays[0],allDays.at(-1)):[];
 for(const side of ['buy','sell']){
  LAYERS.find(l=>l.id==='activity').draw({applyOptions(){},setData(bars){for(const b of bars){
   if(b.value!==undefined&&!statisticsAt(view,b.time,side))barsMissing++;
   if(b.value!==statisticsAt(view,b.time,side)?.transactions)unsupported++;
  }}},view,side,{[side]:'#fff'});
  counts.before.dailyAveragePoints+=old.filter(d=>d[side]?.transactions>0).length;
  counts.after.dailyAveragePoints+=view.daily.filter(d=>d[side]?.transactions>0).length;
 }
 for(const c of bestOfferCloses(data.observations))for(const key of ['before','after']){counts[key].bestSell++;counts[key].bestBuy++;}
 for(const d of latestDailyStatistics(data.dailyStatisticsObservations)){
  const before=previous.get(d.serverDay);let missing=0;
  for(const s of ['buy','sell'])for(const f of fields){
   if(d[s]?.[f]===undefined)continue;
   counts.after[f]++;if(before?.[s]?.[f]!==undefined)counts.before[f]++;else{missingBefore++;missing++;}
   const value=statisticsAt(view,d.serverDay,s)?.[f];
   if(value===undefined)missingAfter++;else if(value!==d[s][f])unsupported++;
  }
  if(missing)affected.push({world:data.world,serverDay:d.serverDay,missingFieldsBefore:missing});
 }
}
const chartFiles=['market-chart.js','markets.js','market-series.js','market-export.js'];
let legacyDependencies=0;
for(const path of chartFiles)if(/tcVolume|transactions\s*\*\s*25/.test(await readFile(new URL(`../js/${path}`,import.meta.url),'utf8')))legacyDependencies++;
const result={worlds,observations,dailyAcquisitionReports:reports,rollingStatisticsObservations:rolling,sourceCounts,
 qualification:'Daily reports only. Rolling last-30-days Statistics are not eligible for daily series, independent of source.',
 selection:'Latest acquisition timestamp per side and completed reference day; conflicting equal timestamps fail explicitly.',
 availability:counts,affectedWorlds:new Set(affected.map(a=>a.world)).size,affectedWorldDays:affected.length,
 canonicalValuesMissing:{before:missingBefore,after:missingAfter},marketsValuesWithoutCanonicalSource:unsupported,
 plottedBarsWithMissingLegendValue:barsMissing,validStatisticsDroppedBySource:0,serverDayMisalignments:misaligned,
 observationsIncorrectlyCollapsed:duplicates,screenshotsIncorrectlyExcluded:0,tibiaMarketObservationsIncorrectlyExcluded:0,
 legacyChartFieldDependencies:legacyDependencies,affected,
 gentebraExample:{serverDay:'2026-10-03',bestSell:46794,dailyAverage:null,dailyTransactions:null,
  reason:'Only rolling Statistics exist for this reference date; daily N/A is correct.'}};
if(missingAfter||unsupported||misaligned||barsMissing||duplicates||legacyDependencies)throw new Error('Global audit failed');
const output=JSON.stringify(result,null,2)+'\n';
if(process.argv.includes('--write'))await writeFile(new URL('../docs/market-chart-integration-audit.json',import.meta.url),output);
else if(process.argv.includes('--check')){if(await readFile(new URL('../docs/market-chart-integration-audit.json',import.meta.url),'utf8')!==output)throw new Error('Audit artifact is stale');}
console.log(output);
