// Independent raw-archive reconciliation using the actual shared contracts.
import assert from 'node:assert/strict';
import {readFile,readdir,writeFile} from 'node:fs/promises';
import {join,resolve,extname} from 'node:path';
import {createHash} from 'node:crypto';
import {acceptsScreenshotName,parseFilename,compareCaptureTimes} from '../js/filename.js';
import {toRecord,ALLOWED} from '../js/store.js';
import {INGESTION_VERSION,STAGES} from '../js/ingestion.js';
import {offerKey,normalizeEndsAt} from '../js/offers.js';
import {analyse} from '../js/validation.js';
import {cleanStatistics,captureInstant,statisticsReferenceDate,normalizeCapturedAt} from '../js/statistics.js';

const [directory,archive]=process.argv.slice(2);
assert.ok(directory && archive,'Usage: node tools/validate_rebuild.mjs <rebuild-directory> <raw-archive>');
const load=async name=>JSON.parse(await readFile(join(directory,name),'utf8'));
const walk=async p=>(await Promise.all((await readdir(p,{withFileTypes:true})).map(e=>e.isDirectory()?walk(join(p,e.name)):[join(p,e.name)]))).flat();
const files=await walk(archive), extensions=new Set(['.png','.jpg','.jpeg','.webp','.heic','.tif','.tiff']);
const images=files.filter(p=>extensions.has(extname(p).toLowerCase()));
const eligible=images.filter(p=>acceptsScreenshotName(p.split('/').at(-1)));
const source=[];
for(const p of eligible){
  let capturedAt=null;try{capturedAt=parseFilename(p.split('/').at(-1)).capturedAt;}catch{}
  source.push({hash:createHash('sha256').update(await readFile(p)).digest('hex'),capturedAt});
}
const captures=await load('observations-enriched.json'), audit=await load('backfill-results.json'), order=await load('processing-order.json'), inventory=await load('inventory.json');
let historicalWorlds=new Map();
try{historicalWorlds=new Map((await load('source-baseline.json')).map(c=>[c.hash,c]));}
catch(error){if(error.code!=='ENOENT')throw error;}
const fingerprint=rows=>{
 const counts=new Map();for(const r of rows){const key=JSON.stringify([r.hash,r.capturedAt]);counts.set(key,(counts.get(key)??0)+1);}
 return [...counts].sort(([a],[b])=>a.localeCompare(b));
};
assert.deepEqual(fingerprint(order),fingerprint(source),'Processing stream must cover every currently eligible raw file');
const validOrder=order.filter(r=>r.capturedAt!=null);
assert.ok(validOrder.every((r,i)=>!i || compareCaptureTimes(validOrder[i-1].capturedAt,r.capturedAt)<=0),'Processing order lost capture chronology/precision');
assert.ok(order.every(r=>Object.keys(r).sort().join(',')==='capturedAt,hash'),'Private processing-order metadata');
assert.equal(inventory.totalFilesScanned,files.length);assert.equal(inventory.filenameEligible,eligible.length);
assert.equal(inventory.unresolvedFilenameTimes,source.filter(r=>r.capturedAt===null).length);
assert.ok(!order.some((r,i)=>r.capturedAt!==null && order.slice(0,i).some(p=>p.capturedAt===null)),'Unresolved clocks must follow the chronological stream');
const unique=new Set(source.map(r=>r.hash));
assert.equal(inventory.duplicateScreenshots,eligible.length-unique.size);
assert.equal(audit.length,unique.size);assert.equal(new Set(audit.map(r=>r.hash)).size,audit.length);
assert.equal(new Set(captures.map(r=>r.hash)).size,captures.length);
const ready=audit.filter(r=>r.status==='ready');
assert.deepEqual(ready.map(r=>r.hash).sort(),captures.map(r=>r.hash).sort(),'Ready captures and canonical data disagree');
const firstClock=new Map();for(const r of order)if(!firstClock.has(r.hash))firstClock.set(r.hash,r.capturedAt);
const ids=new Map(),keyIDs=new Map(),collisionKeys=new Set(),rows=[];
let previous=null;
const offerFields=new Set(['side','rowIndex','amount','price','total','endsAt','endsAtUtc','offerId','matchAmbiguous','bad']);
for(const c of captures){
 assert.ok(Object.keys(c).every(k=>ALLOWED.includes(k)),'Unexpected capture metadata');
 assert.equal(c.processingVersion,INGESTION_VERSION);assert.match(c.hash,/^[a-f0-9]{64}$/);
 assert.equal(c.captureTimeZone,inventory.captureTimeZone,'Capture did not use the rebuild environment timezone');
 assert.match(c.world,/^[A-Za-z]{2,30}$/);assert.ok(['Off','Green','Yellow'].includes(c.battleye));
 assert.ok(['Open PvP','Optional PvP','Hardcore PvP','Retro Open PvP','Retro Hardcore PvP'].includes(c.type));
 assert.equal(c.capturedAt,firstClock.get(c.hash),'Capture clock is not the original full-precision filename clock');
 if(previous)assert.ok(compareCaptureTimes(previous,c.capturedAt)<=0);previous=c.capturedAt;
 const evidence=ready.find(r=>r.hash===c.hash);
 assert.equal(evidence.world,c.world);assert.equal(evidence.itemVerification.status,'tibia_coins');assert.equal(evidence.stages.validation,true);
 const historical=historicalWorlds.get(c.hash);
 if(historical)for(const k of ['world','type','battleye'])assert.equal(c[k],historical[k],'Trusted historical world identity changed');
 if(evidence.context)for(const k of ['world','type','battleye'])assert.equal(evidence.context[k],c[k]);
 const checked=toRecord(c);
 for(const k of Object.keys(c).filter(k=>k!=='offers'))assert.deepEqual(c[k],checked[k],`Shared schema mismatch: ${k}`);
 if(c.viewType==='statistics'){
  assert.equal(c.statisticsReferenceDate,statisticsReferenceDate(c.capturedAt,c.captureTimeZone));
  assert.equal(c.offers,undefined);assert.equal(c.sell,undefined);assert.equal(c.buy,undefined);
  assert.equal(evidence.stages.statistics,true);assert.equal(evidence.attemptedStages.includes('extraction'),false);
  continue;
 }
 assert.equal(c.statisticsReferenceDate,undefined);assert.equal(evidence.attemptedStages.includes('statistics'),false);
 assert.ok(evidence.stages.extraction);
 const used=new Set(),positions=new Set(),inCapture=new Map();
 for(let i=0;i<c.offers.length;i++){
  const r=c.offers[i];assert.ok(Object.keys(r).every(k=>offerFields.has(k)),'Unexpected offer metadata');
  assert.equal(normalizeEndsAt(r.endsAt),r.endsAt);
  const end=captureInstant(r.endsAt,c.captureTimeZone);assert.equal(r.endsAtUtc,end===null?null:new Date(end).toISOString());
  assert.match(r.offerId,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.ok(!used.has(r.offerId));used.add(r.offerId);
  assert.ok(!positions.has(`${r.side}:${r.rowIndex}`));positions.add(`${r.side}:${r.rowIndex}`);
  for(const k of offerFields)if(k!=='matchAmbiguous' && (k!=='bad' || k in r))assert.deepEqual(r[k],checked.offers[i][k]);
  const key=offerKey(c.world,r);assert.ok(!ids.has(r.offerId)||ids.get(r.offerId)===key,'UUID crosses historical identities');ids.set(r.offerId,key);
  if(!keyIDs.has(key))keyIDs.set(key,new Set());keyIDs.get(key).add(r.offerId);
  inCapture.set(key,(inCapture.get(key)??0)+1);rows.push({key,row:r});
 }
 for(const [key,n]of inCapture)if(n>1)collisionKeys.add(key);
 for(const side of ['buy','sell'])assert.deepEqual(c.offers.filter(r=>r.side===side).map(r=>r.rowIndex),c.offers.filter(r=>r.side===side).map((_,i)=>i));
}
for(const [key,group]of keyIDs)assert.ok(group.size===1 || collisionKeys.has(key),'Noncolliding offer received multiple UUIDs');
for(const {key,row}of rows)if(collisionKeys.has(key)||keyIDs.get(key).size>1)assert.equal(row.matchAmbiguous,true,'Historical ambiguity was not propagated');
const auditKeys=new Set(['hash','world','capturedAt','status','processingVersion','viewType','stages','attemptedStages','statistics30d','offers','itemVerification','issues','runtimeFault','capture','context']);
for(const r of audit){
 assert.ok(unique.has(r.hash));assert.ok(Object.keys(r).every(k=>auditKeys.has(k)),'Private audit metadata');
 assert.ok(['ready','needs_review','excluded_manual','excluded_market','excluded_other_item','unclassifiable'].includes(r.status));
 assert.ok(r.world===null || /^[A-Za-z]{2,30}$/.test(r.world));
 assert.ok(r.capturedAt===null || normalizeCapturedAt(r.capturedAt)===r.capturedAt);
 assert.ok(Object.keys(r.stages).every(k=>STAGES.includes(k)));assert.ok(r.attemptedStages.every(s=>STAGES.includes(s)));
 assert.deepEqual(Object.keys(r.itemVerification),['status']);
 for(const issue of r.issues)assert.ok(['World resolution failed','Validation requires review'].includes(issue.reason),'Raw diagnostic text');
 if(r.context)assert.ok(Object.keys(r.context).every(k=>['hash','capturedAt','captureTimeZone','world','type','battleye'].includes(k)));
 for(const o of r.offers){
  assert.ok(Object.keys(o).every(k=>['side','rowIndex','amount','price','total','endsAt','endsAtUtc'].includes(k)));
  assert.ok(o.endsAt==null || normalizeEndsAt(o.endsAt)===o.endsAt,'Raw/private OCR text in audit expiry');
 }
 if(r.capture){
  assert.equal(r.status,'ready');
  const accepted=captures.find(c=>c.hash===r.hash);
  for(const k of Object.keys(r.capture).filter(k=>k!=='offers'))assert.deepEqual(r.capture[k],accepted[k],`Audit/canonical mismatch: ${k}`);
  if(r.capture.offers)assert.deepEqual(r.capture.offers,r.offers);
 }
}
const failureReason=r=>{
 if(r.runtimeFault)return [`Runtime ${r.runtimeFault}; extraction incomplete at ${r.attemptedStages.at(-1)??'unknown'} stage`];
 if(r.status==='excluded_market')return ['Market Offers/Details layout could not be verified'];
 if(r.status==='excluded_other_item')return ['Highlighted Market item is not Tibia Coins'];
 if(r.status==='unclassifiable')return ['Tibia Coins could not be verified in the highlighted Items row'];
 if(r.issues.some(i=>i.field==='world'))return ['World resolution failed through the shared filename/API flow'];
 if(r.issues.some(i=>i.field==='capturedAt'))return ['The filename capture datetime is invalid'];
 if(r.issues.some(i=>i.field==='extraction'))return ['Individual-offer extraction failed'];
 if(r.issues.some(i=>i.field==='view'))return ['Market view type could not be identified'];
 if(r.issues.some(i=>i.field==='deduplication'))return ['SHA duplicate verification failed'];
 const a=analyse({capturedAt:r.capturedAt,captureTimeZone:inventory.captureTimeZone,viewType:r.viewType,
   world:r.world?{world:r.world}:null,statistics30d:cleanStatistics(r.statistics30d),
   rows:Object.fromEntries(['buy','sell'].map(side=>[side,r.offers.filter(o=>o.side===side)]))});
 // The shared extractor's blocking OCR warnings concern a lone row or gaps.
 // With otherwise valid values, the review is about coverage, not bad prices.
 if(!a.warn.length && r.viewType==='offers' && r.issues.some(i=>i.field==='row'))
  return ['Shared OCR could not confirm complete coverage of the visible offer rows'];
 return a.warn.length?a.warn:r.issues.map(i=>`${i.field}: ${i.reason}`).concat(r.issues.length?[]:['Shared pipeline could not validate this capture']);
};
const failures=audit.filter(r=>r.status!=='ready').map(r=>({hash:r.hash,capturedAt:firstClock.get(r.hash),world:r.world,viewType:r.viewType??null,status:r.status,reasons:failureReason(r)}));
const tally=key=>Object.fromEntries([...new Set(audit.map(r=>r[key]??'unidentified'))].map(v=>[v,audit.filter(r=>(r[key]??'unidentified')===v).length]));
const report={filesScanned:files.length,imageFiles:images.length,eligibleScreenshots:eligible.length,uniqueEligible:unique.size,duplicates:eligible.length-unique.size,
 statuses:tally('status'),views:tally('viewType'),capturesAccepted:captures.length,
 capturesRequiringReview:audit.filter(r=>r.status==='needs_review').length,runtimeFailures:audit.filter(r=>r.runtimeFault).length,
 offerExtractionsAttempted:audit.filter(r=>r.attemptedStages.includes('extraction')).length,
 statisticsExtractionsAttempted:audit.filter(r=>r.attemptedStages.includes('statistics')).length,
 offerCaptures:captures.filter(c=>c.viewType==='offers').length,
 statisticsCaptures:captures.filter(c=>c.viewType==='statistics').length,offerRows:rows.length,uniqueOffers:ids.size,
 statisticsRecords:captures.filter(c=>c.viewType==='statistics').length,statisticsSideRecords:captures.filter(c=>c.viewType==='statistics').length*2,
 filenameRejected:images.length-eligible.length,chronologicalRange:{oldest:validOrder[0]?.capturedAt,newest:validOrder.at(-1)?.capturedAt},
 captureTimeZone:inventory.captureTimeZone,checksPassed:['complete current raw archive','full-precision chronological processing','SHA duplicate reconciliation','shared schema and validation','world identity','separate Offers/Statistics gates','local/UTC capture and expiry','Statistics reference date and 25-TC volumes','offer identity/history/collision consistency','closed privacy whitelists']};
await writeFile(join(directory,'validation.json'),JSON.stringify(report,null,2)+'\n');
await writeFile(join(directory,'review-and-rejections.json'),JSON.stringify(failures,null,2)+'\n');
console.log(JSON.stringify(report));
