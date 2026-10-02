import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';

test('legacy command delegates to canonical pipeline without trusting stale exports',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'tibinance-legacy-test-'));
 try{
  const folder=join(directory,'images'),output=join(directory,'output'),runtime=join(directory,'modules');
  await Promise.all([mkdir(folder),mkdir(output),mkdir(join(runtime,'playwright'),{recursive:true})]);
  await writeFile(join(runtime,'playwright','index.js'),"exports.chromium={launch(){throw Error('No browser needed for empty archive')}};");
  const base=[{hash:'same',world:'Antica',capturedAt:'2026-10-01T12:00:00',sell:50000}];
  const prior=[{hash:'same',status:'ready',capture:{...base[0],world:'Other'}},
   {hash:'absent',status:'needs_review',issues:[{field:'amount',reason:'Unread'}]}];
  const baseline=join(directory,'baseline.json');
  await writeFile(baseline,JSON.stringify(base));
  await writeFile(join(output,'legacy-results.json'),JSON.stringify(prior));
  for(const ref of ['origin/main','HEAD']){
   execFileSync(process.execPath,['tools/legacy_archive.mjs',folder,baseline,output,ref],
    {env:{...process.env,TIBINANCE_NODE_MODULES:runtime}});
   assert.deepEqual(JSON.parse(await readFile(join(output,'legacy-results.json'),'utf8')),prior);
   assert.deepEqual(JSON.parse(await readFile(join(output,'observations-legacy-expanded.json'),'utf8')),[]);
   const summary=JSON.parse(await readFile(join(output,'summary.json'),'utf8'));
   assert.equal(summary.pipeline,'website JavaScript implementation');
   assert.deepEqual(summary.stageCounts.filename,{entered:0,passed:0});
  }
 }finally{await rm(directory,{recursive:true,force:true});}
});
