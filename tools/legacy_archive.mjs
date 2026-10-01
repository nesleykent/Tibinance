// Run the real main-branch OCR/analysis without modifying its checkout or data.
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFile, writeFile, rename, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
const [folder, baselinePath, output, ref='origin/main', ...options]=process.argv.slice(2);
if(!folder||!baselinePath||!output)throw Error('Usage: node tools/legacy_archive.mjs <folder> <baseline.json> <output> [main-ref] [--native-fallback] [--utc-offset=-03:00]');
if(options.some(o=>o!=='--native-fallback'&&!/^--utc-offset=[+-](?:0\d|1[0-3]):[0-5]\d$|^--utc-offset=[+-]14:00$/.test(o)))throw Error('Unknown or invalid option');
const fallbackOption=options.includes('--native-fallback')?'--native-fallback':null;
const utcOffset=options.find(o=>o.startsWith('--utc-offset='))?.split('=')[1]??null;
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.TIBINANCE_NODE_MODULES?`${process.env.TIBINANCE_NODE_MODULES}/playwright`:'playwright');
const gitFile=name=>execFileSync('git',['show',`${ref}:${name}`],{encoding:'utf8'});
const mainCommit=execFileSync('git',['rev-parse',ref],{encoding:'utf8'}).trim();
const app=gitFile('js/app.js');
const analysis=app.slice(app.indexOf('function analyse(state)'),app.indexOf('/* ------------------------------------------------------------------ cards */'));
if(!analysis.startsWith('function analyse(state)'))throw Error('Main analysis function could not be located');
const modules={'/ocr.js':gitFile('js/ocr.js'),'/filename.js':gitFile('js/filename.js'),'/tibiadata.js':gitFile('js/tibiadata.js'),
 '/format.js':gitFile('js/format.js'),'/analysis.js':`import {fmt,goldOf,spread} from '/format.js';\n${analysis}\nexport {analyse};`};
// Newer main revisions split OCR helpers into modules and validate expiry in
// analyse. Load those helpers from the same ref, while keeping old refs usable.
const needsExpiryHelper=analysis.includes('normalizeEndsAt(');
let expiryImport='';
if(needsExpiryHelper){
 modules['/offers.js']=gitFile('js/offers.js');
 modules['/market-item.js']=gitFile('js/market-item.js');
 modules['/analysis.js']="import {normalizeEndsAt} from '/offers.js';\n"+modules['/analysis.js'];
 expiryImport=`import {normalizeEndsAt} from 'data:text/javascript;base64,${Buffer.from(modules['/offers.js']).toString('base64')}';\n`;
}
const mainFilename=await import('data:text/javascript;base64,'+Buffer.from(modules['/filename.js']).toString('base64'));
const mainApi=await import('data:text/javascript;base64,'+Buffer.from(modules['/tibiadata.js']).toString('base64'));
const formatUrl='data:text/javascript;base64,'+Buffer.from(modules['/format.js']).toString('base64');
const mainAnalysis=await import('data:text/javascript;base64,'+Buffer.from(`${expiryImport}import {fmt,goldOf,spread} from '${formatUrl}';\n${analysis}\nexport {analyse};`).toString('base64'));
const worldLookups=new Map();
const base=JSON.parse(await readFile(baselinePath,'utf8'));
const existing=new Set(base.map(c=>c.hash));
await mkdir(output,{recursive:true});
const jsonPath=join(output,'legacy-results.json');
let results=[];
try{results=JSON.parse(await readFile(jsonPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
let nativeResults=[];
try{nativeResults=JSON.parse(await readFile(join(output,'backfill-results.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const nativeByHash=new Map(nativeResults.map(r=>[r.hash,r]));
const done=new Set(results.filter(r=>r.status==='ready'||r.status==='excluded_other_item').map(r=>r.hash));
function record(row){
 const index=results.findIndex(r=>r.hash===row.hash);
 if(index>=0){const previous=results[index];row.previousAttempts=[...(previous.previousAttempts??[]),{issues:previous.issues,status:previous.status,lookupAt:previous.lookupAt}];results[index]=row;}
 else results.push(row);
}
async function files(dir){const all=[];for(const e of await readdir(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())all.push(...await files(p));else if(/\.(png|jpe?g|webp|bmp|tiff?)$/i.test(e.name))all.push(p);}return all;}
const inputs=[];
for(const path of (await files(folder)).sort()){
 if(!/_Hotkey\.[^.]+$/i.test(path))continue;
 const buffer=await readFile(path);const hash=createHash('sha256').update(buffer).digest('hex');
 if(!existing.has(hash)&&!done.has(hash)){inputs.push({path,hash});done.add(hash);}
}
let browser;
let page,context;
async function newPage(){
 await browser?.close();browser=await chromium.launch({headless:true,...(process.env.TIBINANCE_CHROME?{executablePath:process.env.TIBINANCE_CHROME}:{})});
 context=await browser.newContext();page=await context.newPage();
 await page.route('http://legacy.test/**',r=>{const path=new URL(r.request().url()).pathname;
  return r.fulfill(path==='/'?{contentType:'text/html',body:'<script src="https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js"></script>'}:{contentType:'text/javascript',body:modules[path]??''});});
 await page.goto('http://legacy.test/');await page.waitForFunction(()=>!!window.Tesseract);
}
async function checkpoint(){
 await writeFile(jsonPath+'.tmp',JSON.stringify(results,null,2)+'\n');await rename(jsonPath+'.tmp',jsonPath);
 const byHash=new Map(base.map(c=>[c.hash,c]));
 for(const r of results)if(r.status==='ready'&&!byHash.has(r.hash))byHash.set(r.hash,r.capture);
 const captures=[...byHash.values()];
 await writeFile(join(output,'observations-legacy-expanded.json'),JSON.stringify(captures,null,2)+'\n');
 await writeFile(join(output,'legacy-context.json'),JSON.stringify({mainCommit,worldSource:'New worlds obtained by main character-world lookup at processing time; not independently proven historical worlds',lookupPolicy:'One live main lookup per explicit character name per batch run',utcOffset,captures:results.filter(r=>r.capture).map(r=>({hash:r.hash,world:r.capture.world,capturedAt:r.capture.capturedAt,lookupAt:r.lookupAt,filenameNormalized:r.filenameNormalized,ocrSource:r.ocrSource??'main'}))},null,2)+'\n');
 const fields=['hash','screenshot','world','capturedAt','side','row','field','reason','readText'];
 const csv=[fields,...results.flatMap(r=>(r.issues??[]).map(i=>{
  const record={...i,hash:r.hash,screenshot:r.sourceFiles?.join(' | ')??'',world:r.capture?.world??r.worldContext?.world,capturedAt:r.capturedAt??r.capture?.capturedAt,readText:i.readText??i.text};
  return fields.map(k=>record[k]??'');
 }))].map(row=>row.map(v=>`"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n')+'\n';
 await writeFile(join(output,'legacy-review.csv'),csv);
}
try{
 for(let index=0;index<inputs.length;index++){
  const input=inputs[index];
  // Character names must be corrected explicitly on disk: an underscore can
  // represent either a space or an apostrophe, with different world lookups.
  const name=input.path.split('/').at(-1);
  const normalized=name;
  const row={hash:input.hash,status:'needs_review',sourceFiles:[input.path],mainCommit,filenameNormalized:normalized!==name,lookupAt:new Date().toISOString(),issues:[]};
  try{
   const check=execFileSync(process.env.TIBINANCE_PYTHON??'python3',['-c',
    "import sys,tempfile,json;from pathlib import Path;sys.path.insert(0,'tools');from market_item import read_selected_item\nwith tempfile.TemporaryDirectory() as d:print(json.dumps(read_selected_item(Path(sys.argv[1]),d,Path(sys.argv[2]))))",input.path,process.env.TIBINANCE_VISION_BINARY??'/private/tmp/tibinance-vision-ocr'],{encoding:'utf8'});
   row.itemVerification=JSON.parse(check);
   if(row.itemVerification.status==='other_item'){
    row.status='excluded_other_item';row.issues.push({field:'selectedItem',reason:row.itemVerification.reason,text:row.itemVerification.text});
    record(row);await checkpoint();continue;
   }
   let fileContext,world;
   try{fileContext=mainFilename.parseFilename(normalized);}catch{
    row.issues.push({field:'captureContext',reason:'Main filename parser could not establish character and capture time'});
    record(row);await checkpoint();continue;
   }
   row.capturedAt=fileContext.capturedAt;
   try{
    let lookup=worldLookups.get(fileContext.character);
    if(!lookup){lookup={world:await mainApi.worldInfo(await mainApi.lookupWorld(fileContext.character)),at:new Date().toISOString()};worldLookups.set(fileContext.character,lookup);}
    world=lookup.world;row.lookupAt=lookup.at;
   }catch{
    row.issues.push({field:'world',reason:'Main character-world API lookup failed'});record(row);await checkpoint();continue;
   }
   row.worldContext=world;
   if(row.itemVerification.status!=='tibia_coins'){
    row.nativeAudit=nativeByHash.get(input.hash);
    row.issues=[...(row.nativeAudit?.issues??[]).filter(i=>i.field!=='world'&&i.field!=='selectedItem'),
      {field:'selectedItem',reason:row.itemVerification.reason,text:row.itemVerification.text}];
    record(row);await checkpoint();continue;
   }
   const prior=results.find(r=>r.hash===input.hash);
   let reading;
   if(fallbackOption==='--native-fallback'&&prior?.mainCommit===mainCommit&&(prior.rows||prior.issues.some(i=>i.field==='marketRows'))){
    const cached=prior.primaryAudit??prior;
    reading={capture:cached.capture,rows:cached.rows,issues:cached.issues,valid:cached.valid};
   }else{
   await newPage();
   const buffer=await readFile(input.path);
   reading=await page.evaluate(async ({encoded,name,world})=>{
    const {parseFilename}=await import('/filename.js');
    const {readMarket}=await import('/ocr.js');const {analyse}=await import('/analysis.js');
    let context;
    try{context=parseFilename(name);}catch{return{issues:[{field:'captureContext',reason:'Main filename parser could not establish character and capture time'}]};}
    const bytes=Uint8Array.from(atob(encoded),c=>c.charCodeAt(0));
    const bitmap=await createImageBitmap(new Blob([bytes]));
    let market;try{market=await readMarket(bitmap);}catch{return{capturedAt:context.capturedAt,issues:[{field:'marketRows',reason:'Main OCR could not recognize Market tables/rows'}]};}finally{bitmap.close();}
    const a=analyse({rows:market,world,ocrWarnings:market.warnings});
    const capture={...world,capturedAt:context.capturedAt};delete capture.battleyeSince;
    for(const k of ['sell','buy','sellVolume','buyVolume','goldDemand','goldSupply','sellTopAmount','buyTopAmount'])if(a[k]!==undefined)capture[k]=a[k];
    return{capture,rows:market,issues:a.warn.map(reason=>({field:'marketRows',reason})),valid:a.ok};
   },{encoded:buffer.toString('base64'),name:normalized,world});
   }
   Object.assign(row,reading);if(row.capture){Object.assign(row.capture,world,{capturedAt:fileContext.capturedAt,hash:input.hash});delete row.capture.battleyeSince;}
   row.ocrSource='main';
   if(fallbackOption==='--native-fallback'&&!row.valid&&row.itemVerification.status==='tibia_coins'){
    row.primaryAudit={capture:row.capture,rows:row.rows,issues:row.issues,valid:row.valid};
    const cachedNative=nativeByHash.get(input.hash);
    const reuseNative=cachedNative?.itemVerification?.status==='tibia_coins'&&Array.isArray(cachedNative.offers)&&cachedNative.engines?.length;
    const native=reuseNative?cachedNative:JSON.parse(execFileSync(process.env.TIBINANCE_PYTHON??'python3',['-c',
     "import sys,tempfile,json;from pathlib import Path;sys.path.insert(0,'tools');from native_market_ocr import read_market\nwith tempfile.TemporaryDirectory() as d:print(json.dumps(read_market(Path(sys.argv[1]),d,Path(sys.argv[2]))))",input.path,process.env.TIBINANCE_VISION_BINARY??'/private/tmp/tibinance-vision-ocr'],{encoding:'utf8'}));
    row.nativeCacheReused=Boolean(reuseNative);
    // The world is now supplied by the explicit main lookup; expiry has no
    // legacy column. All recognition and numeric-validation issues still block.
    const numericIssues=native.issues.filter(i=>i.field!=='endsAt'&&i.field!=='world');
    const rows=Object.fromEntries(['sell','buy'].map(side=>[side,native.offers.filter(r=>r.side===side)]));
    for(const side of ['sell','buy'])if(rows[side].length===1)numericIssues.push({side,field:'row',reason:'Single visible row requires manual confirmation of completeness'});
    const a=mainAnalysis.analyse({rows,world,ocrWarnings:numericIssues.map(i=>i.reason)});
    row.nativeAudit=native;row.rows=rows;row.issues=numericIssues;
    row.issues.push(...a.warn.filter(reason=>!numericIssues.some(i=>i.reason===reason)).map(reason=>({field:'marketRows',reason})));
    row.valid=a.ok;row.ocrSource='native-fallback';
    row.capture={...world,capturedAt:fileContext.capturedAt,hash:input.hash};delete row.capture.battleyeSince;
    for(const k of ['sell','buy','sellVolume','buyVolume','goldDemand','goldSupply','sellTopAmount','buyTopAmount'])if(a[k]!==undefined)row.capture[k]=a[k];
   }
   // The main reader supplies only legacy aggregates; selected-item proof remains required.
   if(row.itemVerification.status!=='tibia_coins')row.issues.push({field:'selectedItem',reason:row.itemVerification.reason,text:row.itemVerification.text});
   row.status=row.itemVerification.status==='other_item'?'excluded_other_item':row.valid&&row.itemVerification.status==='tibia_coins'?'ready':'needs_review';
  }catch{row.issues.push({field:'screenshot',reason:'Legacy processing failed; retained for review'});}
  record(row);await checkpoint();console.log(JSON.stringify({processed:index+1,total:inputs.length,ready:results.filter(r=>r.status==='ready').length,review:results.filter(r=>r.status==='needs_review').length}));
 }
 await checkpoint();
}finally{await browser?.close();}
