// Real screenshot regressions use local originals identified by hash. Original
// paths/names/images never enter output, fixtures, URLs, storage, or commits.
// TIBINANCE_SCREENSHOT_DIR must point to the local ignored archive.
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {join} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium,webkit}=require(process.env.TIBINANCE_NODE_MODULES?`${process.env.TIBINANCE_NODE_MODULES}/playwright`:'playwright');
const archive=process.env.TIBINANCE_SCREENSHOT_DIR;
assert.ok(archive,'Set TIBINANCE_SCREENSHOT_DIR to the private local screenshot archive');
const fixtures=JSON.parse(await readFile(process.env.TIBINANCE_OCR_FIXTURES??new URL('./fixtures/ocr-review.json',import.meta.url),'utf8'));
// Default coverage mixes the eleven reviewed originals with historical controls
// and repeats the first image after both views have used the same reader queue.
if(!process.env.TIBINANCE_OCR_FIXTURES) {
  fixtures.push(...JSON.parse(await readFile(new URL('./fixtures/ocr-controls.json',import.meta.url),'utf8')),fixtures[0]);
}
const wanted=new Set(fixtures.map(f=>f.hash)),sources=new Map();
const walk=async path=>{
  for(const entry of await readdir(path,{withFileTypes:true})) {
    const file=join(path,entry.name);
    if(entry.isDirectory())await walk(file);
    else if(/\.png$/i.test(entry.name)) {
      const bytes=await readFile(file).catch(()=>{throw Error('Local fixture bytes unavailable');});
      const hash=createHash('sha256').update(bytes).digest('hex');
      if(wanted.has(hash))sources.set(hash,bytes);
    }
  }
};
await walk(archive);assert.equal(sources.size,wanted.size,'Every anonymous fixture needs its original bytes');
const launch=()=>process.env.TIBINANCE_BROWSER==='webkit'?webkit.launch({headless:true}):
  chromium.launch({headless:true,...(process.env.TIBINANCE_CHROME?{executablePath:process.env.TIBINANCE_CHROME}:{channel:'chrome'})});
let browser=await launch();
try {
  let page;
  for(const [index,fixture] of fixtures.entries()) {
    if(index && process.env.TIBINANCE_ISOLATE_BROWSER) {
      await browser.close();browser=await launch();page=null;
    }
    if(!page) {
      page=await browser.newPage();
      await page.goto(process.env.TIBINANCE_TEST_URL??'http://127.0.0.1:8765');
      await page.waitForFunction(()=>Boolean(window.Tesseract),null,{timeout:60000});
    }
    const result=await page.evaluate(async({fixture,bytes})=>{
      const {ingestScreenshot}=await import('/js/ingestion.js');
      const data=Uint8Array.from(atob(bytes),c=>c.charCodeAt(0));
      const [date,time]=fixture.context.capturedAt.split('T');
      const name=`${date}_${time.replaceAll(':','').replace('.','')}_Synthetic Character_Hotkey.png`;
      const file=new File([data],name,{type:'image/png'});
      let checkpoint;
      const createWorker=window.Tesseract.createWorker, lifetimes=[];
      window.Tesseract.createWorker=async(...args)=>{
        const worker=await createWorker(...args), lifetime={terminated:false};
        lifetimes.push(lifetime);
        const terminate=worker.terminate.bind(worker);
        worker.terminate=async()=>{await terminate();lifetime.terminated=true;};
        return worker;
      };
      try {
        const result=await ingestScreenshot(file,{reprocess:true,getExisting:async()=>fixture.context,
          onContext:async value=>{checkpoint=value;}});
        return {result,checkpoint,lifetimes};
      } finally { window.Tesseract.createWorker=createWorker; }
    },{fixture,bytes:sources.get(fixture.hash).toString('base64')});
    const label=`${fixture.provenance?'Control':'Review'} case ${index+1}`;
    assert.equal(result.result.status,'ready',`${label}: ${JSON.stringify(result.result.issues)}`);
    assert.deepEqual(result.lifetimes,[{terminated:true}],`${label}: fresh OCR worker disposed before return`);
    for(const key of ['hash','world','type','battleye','capturedAt','captureTimeZone']) {
      assert.equal(result.checkpoint[key],fixture.context[key],`${label}: checkpoint ${key}`);
      assert.equal(result.result.capture[key],fixture.context[key],`${label}: capture ${key}`);
    }
    if(fixture.viewType==='statistics') {
      const actual=Object.fromEntries(['buy','sell'].map(side=>[side,Object.fromEntries(
        ['transactions','highestPrice','averagePrice','lowestPrice'].map(k=>[k,result.result.capture.statistics30d[side][k]]))]));
      assert.deepEqual(actual,fixture.statistics30d,`${label}: independent Statistics truth`);
    } else {
      const actual=result.result.capture.offers.map(row=>Object.fromEntries(
        ['side','rowIndex','amount','price','total','endsAt'].map(k=>[k,row[k]])));
      assert.deepEqual(actual,fixture.offers,`${label}: independent visible rows`);
    }
    assert.equal(JSON.stringify(result).includes('Synthetic Character'),false,`${label}: privacy`);
    console.log(`PASS ${label}: exact ${fixture.provenance??'independent original-image ground truth'}, canonical gates and retained world`);
  }
}finally{await browser.close();}
