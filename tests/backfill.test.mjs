import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

test('batch finalization preserves snapshots and persistent UUIDs on repeated runs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'tibinance-finalize-'));
  try {
    const first = { hash: 'one', world: 'Ustebra', capturedAt: '2026-10-01T13:00:00',
      sell: 50000, sellVolume: 100, processingVersion: 1,
      offers: [{ side: 'sell', rowIndex: 0, amount: 100, price: 50000,
        total: 5000000, endsAt: '2026-10-31T01:28:54' }] };
    const later = { ...first, hash: 'two', capturedAt: '2026-10-01T14:00:00',
      offers: [{ ...first.offers[0], amount: 50, total: 2500000 }] };
    const unresolved = { hash: 'unread', world: 'Antica', capturedAt: '2026-10-01T13:00:00', sell: 123 };
    await writeFile(join(directory, 'captures-extracted.json'), JSON.stringify([first,later,unresolved]));
    const run = () => execFileSync(process.execPath, [resolve('tools/finalize_backfill.mjs'),directory]);
    run();
    const outputPath = join(directory, 'observations-enriched.json');
    const before = JSON.parse(await readFile(outputPath, 'utf8'));
    const get = hash => before.find(c => c.hash === hash);
    assert.equal(get('one').offers[0].offerId,get('two').offers[0].offerId);
    assert.equal(get('one').sellVolume,first.sellVolume);
    assert.deepEqual(get('unread'),unresolved);
    run();
    assert.deepEqual(JSON.parse(await readFile(outputPath,'utf8')),before);
    assert.match(await readFile(join(directory,'offer-observations.csv'),'utf8'),/offerId/);
    await writeFile(join(directory,'captures-extracted.json'),JSON.stringify([first]));
    await writeFile(join(directory,'backfill-results.json'),JSON.stringify([{hash:first.hash,itemVerification:{status:'unconfirmed'}}]));
    run();
    const blocked=JSON.parse(await readFile(outputPath,'utf8'));
    assert.equal(blocked[0].offers,undefined,'Unverified item cannot inherit stale offers from prior output');
    const fresh={...first,hash:'verified-new'};
    await writeFile(outputPath,JSON.stringify([get('one')]));
    await writeFile(join(directory,'captures-extracted.json'),JSON.stringify([first,fresh]));
    await writeFile(join(directory,'backfill-results.json'),JSON.stringify([{hash:first.hash},{hash:fresh.hash,itemVerification:{status:'tibia_coins'}}]));
    run();
    const isolated=JSON.parse(await readFile(outputPath,'utf8'));
    assert.equal(isolated[0].offers,undefined,'Missing item verification blocks enriched baseline offers');
    assert.notEqual(isolated[1].offers[0].offerId,get('one').offers[0].offerId,'Blocked old item cannot supply a matching UUID');
  } finally { await rm(directory,{recursive:true,force:true}); }
});

test('fresh rebuilds are chronological, deterministic and retain rediscovered identities', async () => {
  const directories = await Promise.all([0,1].map(() => mkdtemp(join(tmpdir(),'tibinance-deterministic-'))));
  try {
    const row = {side:'sell',rowIndex:0,amount:100,price:50000,total:5000000,endsAt:'2026-10-31T12:00:00'};
    const captures = [
      {hash:'early',world:'Antica',capturedAt:'2026-10-01T10:00:00',offers:[row],sourceFiles:['sensitive marker']},
      {hash:'middle',world:'Antica',capturedAt:'2026-10-01T11:00:00',offers:[]},
      {hash:'late',world:'Antica',capturedAt:'2026-10-01T12:00:00',offers:[{...row,amount:25,total:1250000}]},
    ];
    const outputs=[];
    for (const [i,directory] of directories.entries()) {
      await writeFile(join(directory,'captures-extracted.json'),JSON.stringify(i ? captures : [...captures].reverse()));
      execFileSync(process.execPath,[resolve('tools/finalize_backfill.mjs'),directory]);
      const output=await readFile(join(directory,'observations-enriched.json'),'utf8');
      assert.ok(!output.includes('sensitive marker'));
      outputs.push(output);
    }
    assert.equal(outputs[0],outputs[1]);
    const records=JSON.parse(outputs[0]);
    assert.deepEqual(records.map(c=>c.hash),['early','middle','late']);
    assert.equal(records[0].offers[0].offerId,records[2].offers[0].offerId);
  } finally { await Promise.all(directories.map(d=>rm(d,{recursive:true,force:true}))); }
});
