// Compatibility command: all processing now goes through the Python website bridge.
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const [folder, baseline, output, _obsoleteRef, ...options] = process.argv.slice(2);
try {
  if (!folder || !baseline || !output || options.some(o => !o.startsWith('--utc-offset='))) throw new Error();
  const utcOffset = options.find(o => o.startsWith('--utc-offset='));
  const result = spawnSync(process.env.TIBINANCE_PYTHON ?? 'python3', [
    fileURLToPath(new URL('reprocess_market.py', import.meta.url)), folder,
    '--baseline', baseline, '--output', output, '--rebuild', ...(utcOffset ? [utcOffset] : [])
  ], { env: process.env, stdio: ['ignore', 'pipe', 'ignore'] });
  if (result.status !== 0) throw new Error();
  const captures = JSON.parse(await readFile(join(output, 'captures-extracted.json'), 'utf8'));
  await writeFile(join(output, 'observations-legacy-expanded.json'), JSON.stringify(captures, null, 2) + '\n');
  console.log(JSON.stringify({ canonicalPipeline: true, captures: captures.length }));
} catch {
  console.error('Legacy invocation unavailable. Use the canonical Python runner; native fallback and Git-ref readers are retired.');
  process.exitCode = 1;
}
