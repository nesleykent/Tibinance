import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {toRecord} from '../js/store.js';
import {analyse} from '../js/validation.js';
import {INGESTION_VERSION,STAGES} from '../js/ingestion.js';

const script=fileURLToPath(new URL('../tools/validate_rebuild.mjs',import.meta.url));
const clock=['2026-10-02T00:36:37.0999999999','2026-10-02T00:36:37.1','2026-10-02T00:36:37.1000000001'];
const hash=value=>createHash('sha256').update(value).digest('hex');
const json=(path,value)=>writeFile(path,JSON.stringify(value)+'\n');

async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'tibinance-rebuild-test-')),archive=join(root,'archive'),output=join(root,'output');
 await mkdir(archive);await mkdir(output);
 const contents=['offers','statistics','review'],hashes=contents.map(hash);
 for(let i=0;i<3;i++)await writeFile(join(archive,`2026-10-02_003637${clock[i].split('.')[1]}_Synthetic Name_Hotkey.png`),contents[i]);
 // Duplicate bytes at a later capture clock must still appear in the stream.
 await writeFile(join(archive,'2026-10-02_010000_Another Synthetic Name_Hotkey.png'),contents[0]);
 await writeFile(join(archive,'2026-10-02_010001_Synthetic Name_SkillUp.png'),'filename excluded');
 const captureTimeZone='America/Sao_Paulo';
 const base={world:'Antica',type:'Open PvP',battleye:'Yellow',processingVersion:INGESTION_VERSION,captureTimeZone};
 const rows={sell:[{side:'sell',rowIndex:0,amount:25,price:50000,total:1250000,endsAt:'2026-10-20T12:00:00'}],
  buy:[{side:'buy',rowIndex:0,amount:50,price:49000,total:2450000,endsAt:'2026-10-21T12:00:00'}]};
 const derived=analyse({world:{world:'Antica'},capturedAt:clock[0],rows});
 const offers=toRecord({...base,...derived,hash:hashes[0],capturedAt:clock[0],viewType:'offers',offers:[...rows.sell,...rows.buy]});
 // Finalization runs the matcher again, which drops transient validation flags.
 for(const r of offers.offers)delete r.bad;
 const statistics=toRecord({...base,hash:hashes[1],capturedAt:clock[1],viewType:'statistics',statistics30d:{
  buy:{transactions:4,highestPrice:49985,averagePrice:44155,lowestPrice:1,tcVolume:100},
  sell:{transactions:8,highestPrice:49998,averagePrice:45942,lowestPrice:44000,tcVolume:200}}});
 const anonymousOffers=offers.offers.map(({offerId,matchAmbiguous,bad,...r})=>r);
 const evidence=c=>({hash:c.hash,world:c.world,capturedAt:c.capturedAt,status:'ready',processingVersion:INGESTION_VERSION,
  viewType:c.viewType,stages:Object.fromEntries(STAGES.filter(s=>s!==(c.viewType==='offers'?'statistics':'extraction')).map(s=>[s,true])),
  attemptedStages:STAGES.filter(s=>s!==(c.viewType==='offers'?'statistics':'extraction')),
  statistics30d:c.statistics30d??null,offers:c.viewType==='offers'?anonymousOffers:[],itemVerification:{status:'tibia_coins'},issues:[],
  capture:c.viewType==='offers'?{...c,offers:anonymousOffers}:c,
  context:{hash:c.hash,capturedAt:c.capturedAt,captureTimeZone,world:c.world,type:c.type,battleye:c.battleye}});
 const audit=[evidence(offers),evidence(statistics),{hash:hashes[2],world:null,capturedAt:clock[2],status:'needs_review',
  processingVersion:INGESTION_VERSION,viewType:'offers',stages:{filename:true,deduplication:true,market:true,item:true,view:true,metadata:true,world:false},
  attemptedStages:STAGES.slice(0,7),statistics30d:null,offers:[],itemVerification:{status:'tibia_coins'},
  issues:[{field:'world',reason:'World resolution failed'}]}];
 const order=hashes.map((h,i)=>({hash:h,capturedAt:clock[i]})).concat({hash:hashes[0],capturedAt:'2026-10-02T01:00:00'});
 await json(join(output,'observations-enriched.json'),[offers,statistics]);
 await json(join(output,'source-baseline.json'),[{hash:offers.hash,world:offers.world,type:offers.type,battleye:offers.battleye}]);
 await json(join(output,'backfill-results.json'),audit);
 await json(join(output,'processing-order.json'),order);
 await json(join(output,'inventory.json'),{totalFilesScanned:5,filenameEligible:4,duplicateScreenshots:1,unresolvedFilenameTimes:0,captureTimeZone});
 return {root,archive,output};
}

test('raw reconciliation accepts interleaved views, full fractions, duplicates and reports every review',async()=>{
 const f=await fixture();try{
  const checked=spawnSync(process.execPath,[script,f.output,f.archive],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr);
  const report=JSON.parse(await readFile(join(f.output,'validation.json')));
  assert.equal(report.eligibleScreenshots,4);assert.equal(report.duplicates,1);
  assert.equal(report.capturesAccepted,2);assert.equal(report.offerRows,2);assert.equal(report.statisticsRecords,1);
  const review=JSON.parse(await readFile(join(f.output,'review-and-rejections.json')));
  assert.equal(review.length,1);assert.match(review[0].reasons[0],/World resolution failed/);
  assert.equal(JSON.stringify([report,review]).includes('Synthetic Name'),false);
 }finally{await rm(f.root,{recursive:true,force:true});}
});

test('validation blocks order loss, missing raw files, private metadata, volume tampering and expiry drift',async()=>{
 for(const change of [
  {file:'processing-order.json',mutate:a=>[a[1],a[0],...a.slice(2)]},
  {file:'processing-order.json',mutate:a=>a.slice(0,-1)},
  {file:'observations-enriched.json',mutate:a=>(a[0].filename='private.png',a)},
  {file:'backfill-results.json',mutate:a=>(a[0].capture.localPath='/private/source',a)},
  {file:'observations-enriched.json',mutate:a=>(a[1].statistics30d.buy.tcVolume=4,a)},
  {file:'observations-enriched.json',mutate:a=>(a[0].offers[0].endsAtUtc='2026-10-20T12:00:00.000Z',a)},
  {file:'observations-enriched.json',mutate:a=>(a[0].captureTimeZone='Europe/Berlin',a)},
  {file:'source-baseline.json',mutate:a=>(a[0].world='Secura',a)}
 ]){
  const f=await fixture();try{
   const path=join(f.output,change.file),value=JSON.parse(await readFile(path));await json(path,change.mutate(value));
   const checked=spawnSync(process.execPath,[script,f.output,f.archive],{encoding:'utf8'});
   assert.notEqual(checked.status,0,`${change.file} tampering should fail`);
  }finally{await rm(f.root,{recursive:true,force:true});}
 }
});

test('numerically valid OCR reviews report row coverage without inventing a price error',async()=>{
 const f=await fixture();try{
  const path=join(f.output,'backfill-results.json'),audit=JSON.parse(await readFile(path));
  audit[2]={...audit[2],world:'Antica',offers:audit[0].offers,
   issues:[{field:'row',reason:'Validation requires review'}]};await json(path,audit);
  const checked=spawnSync(process.execPath,[script,f.output,f.archive],{encoding:'utf8'});
  assert.equal(checked.status,0,checked.stderr);
  const review=JSON.parse(await readFile(join(f.output,'review-and-rejections.json')));
  assert.deepEqual(review[0].reasons,['Shared OCR could not confirm complete coverage of the visible offer rows']);
 }finally{await rm(f.root,{recursive:true,force:true});}
});
