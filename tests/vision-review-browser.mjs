// Real item-gate regressions found during the local Apple Vision review.
// Screenshots remain private; identify samples by public SHA, never filenames.
import {createRequire} from 'node:module';
import {readFile,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.TIBINANCE_NODE_MODULES?`${process.env.TIBINANCE_NODE_MODULES}/playwright`:'playwright');
const archive=process.env.TIBINANCE_REVIEW_ARCHIVE;
assert.ok(archive,'Set TIBINANCE_REVIEW_ARCHIVE to the local raw archive');
const samples=new Map([
 ['1db4f8f482e4f527e64696bbab0ec60eb9e3ac35c5bcec3253ba50b7449d12fd','tibia_coins'],
 ['f96f305967575683e0a812eb77d46148c8955d0c1e66bc23614a709b487c78b9','tibia_coins'],
 ['b50cf2924f73ecd82689986e8913460c933324722e1c7889ece1049b214a12a8','tibia_coins'],
 ['5d10e5460d4506a8993bd1c688694fb09bcb49a0fb9a8c41654b34cda1340541','other_item'],
 ['094d216ec510654e4ff6aad57e527cfee92687886ce1aa73689a6f77ecdbf11f','other_item'],
 ['114e0874937843b12c2418e0da63a933e5502908fa6efdb061e493ef01debfe8','other_item']
]);
const walk=async directory=>(await Promise.all((await readdir(directory,{withFileTypes:true})).map(e=>e.isDirectory()?walk(join(directory,e.name)):[join(directory,e.name)]))).flat();
const inputs=new Map();
for(const path of await walk(archive)){
 if(!/\.(png|jpe?g|webp)$/i.test(path))continue;
 const bytes=await readFile(path),hash=createHash('sha256').update(bytes).digest('hex');
 if(samples.has(hash))inputs.set(hash,bytes.toString('base64'));
}
assert.equal(inputs.size,samples.size,'Private regression sample missing');
const errors=[];
for(const [hash,expected] of samples){
 const browser=await chromium.launch({headless:true,...(process.env.TIBINANCE_CHROME?{executablePath:process.env.TIBINANCE_CHROME}:{channel:'chrome'})});
 try{
  const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.TIBINANCE_TEST_URL??'http://127.0.0.1:8765');
  const actual=await page.evaluate(async bytes=>{
   const {verifyMarket,verifyTibiaCoins}=await import('/js/ocr.js');
   const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(bytes),c=>c.charCodeAt(0))]));
   try{
    const context=await verifyMarket(bitmap);
    try{return(await verifyTibiaCoins(context)).status;}catch(error){return error.code;}
   }finally{bitmap.close();}
  },inputs.get(hash));
  assert.equal(actual,expected,`Item gate regression ${hash}`);
 }finally{await browser.close();}
}
assert.deepEqual(errors,[]);
console.log('PASS: three genuine Tibia Coins layouts recovered; three other selected items still rejected; clean browser runtime');
