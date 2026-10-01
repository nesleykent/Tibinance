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
    assert.equal(before[0].offers[0].offerId,before[1].offers[0].offerId);
    assert.equal(before[0].sellVolume,first.sellVolume);
    assert.deepEqual(before[2],unresolved);
    run();
    assert.deepEqual(JSON.parse(await readFile(outputPath,'utf8')),before);
    assert.match(await readFile(join(directory,'offer-observations.csv'),'utf8'),/offerId/);
    await writeFile(join(directory,'captures-extracted.json'),JSON.stringify([first]));
    await writeFile(join(directory,'backfill-results.json'),JSON.stringify([{hash:first.hash,itemVerification:{status:'unconfirmed'}}]));
    run();
    const blocked=JSON.parse(await readFile(outputPath,'utf8'));
    assert.equal(blocked[0].offers,undefined,'Unverified item cannot inherit stale offers from prior output');
    const fresh={...first,hash:'verified-new'};
    await writeFile(outputPath,JSON.stringify([before[0]]));
    await writeFile(join(directory,'captures-extracted.json'),JSON.stringify([first,fresh]));
    await writeFile(join(directory,'backfill-results.json'),JSON.stringify([{hash:first.hash},{hash:fresh.hash,itemVerification:{status:'tibia_coins'}}]));
    run();
    const isolated=JSON.parse(await readFile(outputPath,'utf8'));
    assert.equal(isolated[0].offers,undefined,'Missing item verification blocks enriched baseline offers');
    assert.notEqual(isolated[1].offers[0].offerId,before[0].offers[0].offerId,'Blocked old item cannot supply a matching UUID');
  } finally { await rm(directory,{recursive:true,force:true}); }
});
