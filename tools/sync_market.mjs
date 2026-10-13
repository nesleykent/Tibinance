// The single market-data update path: every source, the same validation, reconciliation, evaluation and release.
//
//   node tools/sync_market.mjs                       rebuild, validate and evaluate from the inputs on disk
//   node tools/sync_market.mjs --fetch               first fetch new TibiaMarket history (tools/sync_tibiamarket.mjs)
//   node tools/sync_market.mjs ... --publish         commit the result to main (tools/forecasts/publish.py)
//   node tools/sync_market.mjs ... --release --approver "<who>" [--dispatch]
//                                                    then make it live with a data release (tools/release.mjs)
//
// The daily workflow runs it with --fetch --publish --release; a screenshot update (docs/project-guide.md) or a
// manual observation runs it without --fetch once its inputs are installed, so a manual update is validated,
// reconciled, evaluated and released the same way, immediately, without waiting for the schedule. Inputs are never
// overwritten by another source: TibiaMarket copies only grow (sync_tibiamarket.mjs refuses a copy that drops or
// changes a held row), captures come only from the screenshot procedure, and the Markets build keeps every
// observation with its source and timestamps under its existing precedence rules.
//
// Steps, each one stopping the run on failure (nothing is committed then; the last validated dataset stays):
// 1. --fetch: incremental TibiaMarket fetch.
// 2. Rebuild the Markets history and its audits (build_market_history, audit_rolling_activity, audit_market_chart).
// 3. Rebuild the Markets projections: the anchor rule depends on the latest observations, and the builder archives
//    the presentation before replacing the file.
// 4. Score archived forecasts whose target weeks closed (tools/forecasts/evaluate.py, needs the pinned pandas).
// 5. Validate the whole tree (tools/ci/validate_site.mjs).
// 6. --publish: one publication unit through publish.py (archive, chains, history, audits, status).
// 7. --release: a data release of the published commit.
import { spawnSync } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PYTHON = process.env.PYTHON ?? 'python3';
const STATUS = 'data/economy/sync-status.json';

function step(name, cmd, args) {
  const started = Date.now();
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: process.env });
  if (r.status !== 0) throw new Error(`${name} failed (exit ${r.status}); nothing was committed`);
  console.log(`ok ${name} (${Date.now() - started} ms)`);
}

async function recordStatus(source, fields) {
  const path = join(ROOT, STATUS);
  const current = JSON.parse(await readFile(path, 'utf8').catch(() => '{"format":1,"sources":{}}'));
  const previous = JSON.stringify(current.sources[source] ?? {});
  current.note = 'Last data change and source freshness per synchronised source, written only when something changes. A source that stopped updating is stale, not missing: its last update is kept.';
  current.sources[source] = { ...(current.sources[source] ?? {}), ...fields };
  if (JSON.stringify(current.sources[source]) === previous) return false;
  await mkdir(join(ROOT, 'data/economy'), { recursive: true });
  await writeFile(path, JSON.stringify(current, null, 1) + '\n');
  return true;
}

async function main() {
  const args = process.argv.slice(2);
  const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  if (args.includes('--fetch')) {
    const { sync } = await import('./sync_tibiamarket.mjs');
    const r = await sync();
    console.log(`TibiaMarket: ${r.checked} worlds checked, due ${r.due.join(', ') || 'none'}, updated ${r.updated.join(', ') || 'none'}, ${r.newRows} new rows, ${r.conflicts.length} conflicts`);
    await recordStatus('tibiamarket', {
      ...(r.updated.length ? { lastDataChange: new Date().toISOString(), lastUpdatedWorlds: r.updated, lastNewRows: r.newRows } : {}),
      sourceLatestUpdate: r.sourceLatestUpdate, conflicts: r.conflicts,
    });
    if (r.conflicts.length) console.error('Conflicting TibiaMarket copies were not written; see data/economy/sync-status.json');
  }
  step('Markets history', process.execPath, ['tools/build_market_history.mjs']);
  step('rolling activity audit', process.execPath, ['tools/audit_rolling_activity.mjs', '--write']);
  step('chart integration audit', process.execPath, ['tools/audit_market_chart.mjs', '--write']);
  step('Markets projections (archived first)', process.execPath, ['tools/build_market_projections.mjs']);
  step('forecast evaluation', PYTHON, ['tools/forecasts/evaluate.py']);
  step('site validation', process.execPath, ['tools/ci/validate_site.mjs']);
  if (args.includes('--publish')) {
    step('publication', PYTHON, ['tools/forecasts/publish.py', '--message', value('--message') ?? 'Market data update: validated, reconciled and evaluated',
      '--with', 'data/market-history', '--with', 'docs/market-chart-integration-audit.json', '--with', 'docs/rolling-activity-calculation.json', '--with', STATUS]);
  }
  if (args.includes('--release')) {
    const approver = value('--approver');
    if (!approver) throw new Error('--release needs --approver');
    const r = spawnSync(process.execPath, ['tools/release.mjs', '--data', 'HEAD', '--approver', approver, ...(args.includes('--dispatch') ? ['--dispatch'] : [])], { cwd: ROOT, encoding: 'utf8' });
    process.stdout.write(r.stdout ?? '');
    if (r.status !== 0 && !/nothing to release/.test(r.stderr ?? '')) throw new Error(`data release failed: ${r.stderr}`);
    if (r.status !== 0) console.log('data release: nothing to release (production already serves these data)');
  }
}

main().catch(error => { console.error(error.message); process.exit(1); });
